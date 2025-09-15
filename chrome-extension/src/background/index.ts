// background.ts
// Background service worker for translations + caching + saving + authentication
import { createClient } from '@supabase/supabase-js';

const API_KEY: string = process.env.CEB_API_KEY || '';
const SUPABASE_KEY: string = process.env.CEB_SUPABASE_KEY || '';

console.log('Background script started. API_KEY:', API_KEY ? 'set' : 'not set');
console.log('SUPABASE_KEY:', SUPABASE_KEY ? 'set' : 'not set');
const DEFAULT_TARGET_LANG = 'en';

// Initialize Supabase client
const supabaseUrl = 'https://bivafzwsqftbpnoomcyv.supabase.co';
const supabase = createClient(supabaseUrl, SUPABASE_KEY);
console.log('Supabase initialized:', !!supabase);

// Simple in-memory cache
const cache: Record<string, string> = {};

// Types
interface TranslationMessage {
  type: 'translate';
  text: string;
  url?: string;
}

interface AuthMessage {
  type: 'auth';
  action: 'signin' | 'signout' | 'getSession';
  email?: string;
  password?: string;
}

interface TranslationResponse {
  translation?: string;
  error?: string;
  fromCache?: boolean;
}

interface AuthResponse {
  success: boolean;
  user?: any;
  error?: string;
  session?: any;
}

// Get current user session
async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) {
    console.error('Session error:', error);
    return null;
  }
  return session;
}

// Get current user ID
async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user?.id || null;
}

// Helper: save to Supabase flashcards table with real user ID
async function saveTranslation(
  original: string,
  translation: string,
  url: string = '',
  targetLang: string,
): Promise<void> {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      console.log('User not authenticated, skipping Supabase save');
      fallbackSaveToChromeStorage(original, translation, url);
      return;
    }

    const { data, error } = await supabase.from('flashcards').insert([
      {
        user_id: userId,
        original: original,
        translation: translation,
        url: url,
        date: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error('Supabase insert error:', error);
      fallbackSaveToChromeStorage(original, translation, url);
    } else {
      console.log('Saved to Supabase flashcards successfully for user:', userId);
    }
  } catch (err) {
    console.error('Supabase error:', err);
    fallbackSaveToChromeStorage(original, translation, url);
  }
}

// Helper: check Supabase flashcards table for existing translation
async function checkSupabaseCache(text: string, targetLang: string): Promise<string | null> {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      console.log('User not authenticated, skipping Supabase cache check');
      return null;
    }

    const { data, error } = await supabase
      .from('flashcards')
      .select('translation')
      .eq('original', text)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.log('No cached translation in Supabase:', error.message);
      return null;
    }

    return data.translation;
  } catch (err) {
    console.error('Supabase cache check error:', err);
    return null;
  }
}

// Fallback: save to chrome.storage.local
async function fallbackSaveToChromeStorage(original: string, translation: string, url: string = ''): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.get({ translations: [] }, result => {
      const updated = [...result.translations, { original, translation, date: Date.now(), url: url }];
      const trimmed = updated.slice(-100);
      chrome.storage.local.set({ translations: trimmed }, () => resolve());
    });
  });
}

// Authentication handlers
async function handleSignIn(email: string, password: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    return { success: true, user: data.user, session: data.session };
  } catch (error) {
    console.error('Sign in error:', error);

    // Proper error handling
    if (error instanceof Error) {
      return { success: false, error: error.message };
    } else {
      return { success: false, error: 'Unknown sign in error' };
    }
  }
}

async function handleSignOut(): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);

    // Proper error handling
    if (error instanceof Error) {
      return { success: false, error: error.message };
    } else {
      return { success: false, error: 'Unknown sign out error' };
    }
  }
}

async function handleGetSession(): Promise<AuthResponse> {
  try {
    const session = await getCurrentSession();
    return { success: true, session, user: session?.user };
  } catch (error) {
    console.error('Get session error:', error);

    // Proper error handling
    if (error instanceof Error) {
      return { success: false, error: error.message };
    } else {
      return { success: false, error: 'Unknown session error' };
    }
  }
}
// Main message listener
chrome.runtime.onMessage.addListener(
  (message: TranslationMessage | AuthMessage, sender, sendResponse: (response?: any) => void) => {
    // Handle authentication messages
    if (message.type === 'auth') {
      (async () => {
        switch (message.action) {
          case 'signin':
            if (message.email && message.password) {
              const result = await handleSignIn(message.email, message.password);
              sendResponse(result);
            }
            break;
          case 'signout':
            const result = await handleSignOut();
            sendResponse(result);
            break;
          case 'getSession':
            const sessionResult = await handleGetSession();
            sendResponse(sessionResult);
            break;
        }
      })();
      return true;
    }

    // Handle translation messages
    if (message.type === 'translate') {
      chrome.storage.local.get({ enabled: true, targetLang: DEFAULT_TARGET_LANG }, async res => {
        if (!res.enabled) {
          sendResponse({ error: 'Extension is disabled' });
          return;
        }

        const text = (message.text || '').trim();
        if (!text) {
          sendResponse({ translation: '' });
          return;
        }

        const targetLang = (res.targetLang || DEFAULT_TARGET_LANG).toLowerCase();
        const pageUrl = message.url || sender.tab?.url || '';

        // Check memory cache first
        const cacheKey = `${text}|${targetLang}`;
        if (cache[cacheKey]) {
          await saveTranslation(text, cache[cacheKey], pageUrl, targetLang);
          sendResponse({ translation: cache[cacheKey], fromCache: true });
          return;
        }

        // Check Supabase cache
        const supabaseCachedTranslation = await checkSupabaseCache(text, targetLang);
        if (supabaseCachedTranslation) {
          cache[cacheKey] = supabaseCachedTranslation;
          sendResponse({ translation: supabaseCachedTranslation, fromCache: true });
          return;
        }

        // Handle translation logic (same as before)
        (async () => {
          try {
            let translation: string | null = null;

            if (API_KEY && API_KEY.trim() !== '' && API_KEY !== 'undefined') {
              console.log('Using real DeepL API for translation');

              const url = 'https://api-free.deepl.com/v2/translate';
              const params = new URLSearchParams();
              params.append('auth_key', API_KEY.trim());
              params.append('text', text);
              params.append('target_lang', targetLang.toUpperCase());

              const resp = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'YourApp/1.2.3',
                },
                body: params.toString(),
              });

              if (!resp.ok) {
                const errorText = await resp.text();
                console.error('DeepL API error:', resp.status, errorText);
                throw new Error(`DeepL API error: ${resp.status} - ${errorText}`);
              }

              const data = await resp.json();
              if (data.translations && data.translations.length > 0) {
                translation = data.translations[0].text;
                console.log('Translation successful:', translation);
              } else {
                translation = '[translation error: no translations in response]';
              }
            } else {
              console.log('Using mock translation - no valid API key found');
              translation = '[mock] ' + text;
            }

            const safeTranslation: string = translation ?? '[null translation]';
            cache[cacheKey] = safeTranslation;
            await saveTranslation(text, safeTranslation, pageUrl, targetLang);

            sendResponse({ translation: safeTranslation });
          } catch (err) {
            console.error('Translation error', err);
            sendResponse({
              translation: '[error: ' + (err instanceof Error ? err.message : String(err)) + ']',
            });
          }
        })();
      });
      return true;
    }
  },
);

// Initialize auth state
(async () => {
  const session = await getCurrentSession();
  console.log('Initial auth state:', session ? 'Authenticated' : 'Not authenticated');
  if (session) {
    console.log('User:', session.user.email);
  }
})();
