// Background service worker for translations + caching + saving + authentication
import { createClient } from '@supabase/supabase-js';
import { sync } from 'fast-glob';

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
  action: 'signin' | 'signout' | 'getSession' | 'refreshSession';
  email?: string;
  password?: string;
  remember?: boolean;
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

// Store session data in chrome.storage for persistence
async function storeSessionData(session: any) {
  if (session) {
    await chrome.storage.local.set({
      supabaseSession: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user
      }
    });
  }
}

// Retrieve session data from chrome.storage
async function getStoredSessionData() {
  const result = await chrome.storage.local.get('supabaseSession');
  return result.supabaseSession || null;
}

// Clear session data from chrome.storage
async function clearStoredSessionData() {
  await chrome.storage.local.remove(['supabaseSession', 'rememberMe']);
}

// Get current user session with proper error handling
async function getCurrentSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Session error:', error);
      return null;
    }
    
    return session;
  } catch (error) {
    console.error('Error in getCurrentSession:', error);
    return null;
  }
}

// Get current user ID
async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user?.id || null;
}

// Check if session is expired
function isSessionExpired(session: any): boolean {
  if (!session || !session.expires_at) return true;
  const now = Math.floor(Date.now() / 1000);
  return now >= session.expires_at;
}

// Restore session from storage and refresh if needed
async function restoreSession(): Promise<boolean> {
  try {
    const { rememberMe } = await chrome.storage.local.get('rememberMe');
    
    if (!rememberMe) {
      return false;
    }

    const storedSession = await getStoredSessionData();
    
    if (!storedSession) {
      console.log('No stored session found');
      return false;
    }

    // Check if session is expired
    if (isSessionExpired(storedSession)) {
      console.log('Stored session expired, attempting refresh...');
      
      // Set the expired session first
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: storedSession.access_token,
        refresh_token: storedSession.refresh_token
      });
      
      if (setSessionError) {
        console.error('Error setting expired session:', setSessionError);
        await clearStoredSessionData();
        return false;
      }

      // Now try to refresh
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('Error refreshing session:', refreshError);
        await clearStoredSessionData();
        return false;
      }

      if (data.session) {
        console.log('Session refreshed successfully');
        await storeSessionData(data.session);
        return true;
      }
    } else {
      // Session is still valid, set it
      console.log('Restoring valid session from storage');
      const { error } = await supabase.auth.setSession({
        access_token: storedSession.access_token,
        refresh_token: storedSession.refresh_token
      });
      
      if (error) {
        console.error('Error restoring session:', error);
        await clearStoredSessionData();
        return false;
      }
      
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in restoreSession:', error);
    return false;
  }
}

// Refresh session periodically
async function refreshSessionIfNeeded() {
  try {
    const { rememberMe } = await chrome.storage.local.get('rememberMe');
    
    if (!rememberMe) {
      return;
    }

    const session = await getCurrentSession();
    
    if (!session) {
      console.log('No active session to refresh');
      return;
    }

    // Check if session will expire soon (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const expiresSoon = session.expires_at - now < 300; // 5 minutes
    
    if (expiresSoon) {
      console.log('Session expires soon, refreshing...');
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('Error refreshing session:', error);
        // Don't clear rememberMe immediately, try to restore on next operation
      } else if (data.session) {
        console.log('Session refreshed successfully');
        await storeSessionData(data.session);
      }
    }
  } catch (error) {
    console.error('Error in refreshSessionIfNeeded:', error);
  }
}

// Ensure user is authenticated before operations
async function ensureAuthenticated(): Promise<boolean> {
  const { rememberMe } = await chrome.storage.local.get('rememberMe');
  
  if (!rememberMe) {
    return false;
  }

  // First try to get current session
  let session = await getCurrentSession();
  
  if (session && !isSessionExpired(session)) {
    return true;
  }

  // If no valid session, try to restore from storage
  return await restoreSession();
}

// Helper: save to Supabase flashcards table with real user ID
async function saveTranslation(
  original: string,
  translation: string,
  url: string = '',
  targetLang: string,
  contextText: string = '',
  originalLang: string = 'auto',
  translationLang: string = ''
): Promise<void> {
  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      console.log('User not authenticated, skipping save to Supabase');
      return;
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('No user ID, skipping save to Supabase');
      return;
    }

    // Use targetLang if translationLang is empty
    const finalTranslationLang = translationLang || targetLang;

    console.log('Saving translation:', {
      original,
      translation,
      originalLang,
      translationLang: finalTranslationLang,
      context: contextText
    });

    // Insert with insert on (user_id, original)
    const { data, error } = await supabase
      .from('flashcards')
      .insert({
        user_id: userId,
        original,
        context: contextText,
        translation,
        url,
        original_language: originalLang,
        translation_language: finalTranslationLang,
        date: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
    } else {
      console.log('Saved translation to Supabase:', data);
    }
  } catch (err) {
    console.error('saveTranslation error:', err);
  }
}

// Helper: check Supabase flashcards table for existing translation
async function checkSupabaseCache(text: string, targetLang: string): Promise<string | null> {
  try {
    const isAuthenticated = await ensureAuthenticated();

    if (!isAuthenticated) {
      console.log('User not authenticated, skipping Supabase cache check');
      return null;
    }

    const userId = await getCurrentUserId();

    if (!userId) {
      console.log('No user ID after authentication check, skipping cache');
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

// Authentication handlers
async function handleSignIn(email: string, password: string, remember: boolean = false): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Store session data for persistence
    if (remember && data.session) {
      await chrome.storage.local.set({ 
        rememberMe: true,
        userEmail: email
      });
      await storeSessionData(data.session);
    } 
    return { success: true, user: data.user, session: data.session };
  } catch (error) {
    console.error('Sign in error:', error);
    await clearStoredSessionData();

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

    await clearStoredSessionData();
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    } else {
      return { success: false, error: 'Unknown sign out error' };
    }
  }
}

async function handleGetSession(): Promise<AuthResponse> {
  try {
    const { rememberMe } = await chrome.storage.local.get('rememberMe');
    
    if (!rememberMe) {
      return { success: false, error: 'Remember me not enabled' };
    }

    // Try to restore session first
    const sessionRestored = await restoreSession();
    
    if (sessionRestored) {
      const session = await getCurrentSession();
      return { success: true, session, user: session?.user };
    }
    
    return { success: false, error: 'Could not restore session' };
  } catch (error) {
    console.error('Get session error:', error);
    return { success: false, error: 'Unknown session error' };
  }
}

async function handleRefreshSession(): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      console.error('Refresh session error:', error);
      await clearStoredSessionData();
      return { success: false, error: error.message };
    }

    if (data.session) {
      await storeSessionData(data.session);
      return { success: true, session: data.session, user: data.user };
    }

    return { success: false, error: 'No session after refresh' };
  } catch (error) {
    console.error('Refresh session error:', error);
    return { success: false, error: 'Unknown refresh error' };
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
              const result = await handleSignIn(
                message.email, 
                message.password, 
                message.remember
              );
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
          case 'refreshSession':
            const refreshResult = await handleRefreshSession();
            sendResponse(refreshResult);
            break;
        }
      })();
      return true;
    }

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

        // Extract highlighted word and context
        const highlightedWord = (message as any).highlightedWord || text;
        const contextText = (message as any).highlightedWord ? text : undefined;

        const cacheKey = `${highlightedWord}|${targetLang}`;

        if (cache[cacheKey]) {
          // Save main flashcard with context
          await saveTranslation(
            highlightedWord, 
            cache[cacheKey], 
            pageUrl, 
            targetLang, 
            contextText,
            'auto',
            targetLang
          );

          sendResponse({ translation: cache[cacheKey], fromCache: true });
          return;
        }

        // Check Supabase for highlighted word first
        const supabaseCachedTranslation = await checkSupabaseCache(highlightedWord, targetLang);
        if (supabaseCachedTranslation) {
          cache[cacheKey] = supabaseCachedTranslation;
          
          // Save with context when restoring from cache
          await saveTranslation(
            highlightedWord, 
            supabaseCachedTranslation, 
            pageUrl, 
            targetLang, 
            contextText,
            'auto',
            targetLang
          );
          
          sendResponse({ translation: supabaseCachedTranslation, fromCache: true });
          return;
        }

        // FIX: Translate ONLY the highlighted word, not the context
        (async () => {
          try {
            let translation: string | null = null;
            let detectedSourceLang = 'auto';

            if (API_KEY && API_KEY.trim() !== '' && API_KEY !== 'undefined') {
              const url = 'https://api-free.deepl.com/v2/translate';
              const params = new URLSearchParams();
              params.append('auth_key', API_KEY.trim());
              params.append('text', highlightedWord);  // Translate the word only
              params.append('target_lang', targetLang.toUpperCase());

              const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
              });

              const data = await resp.json();
              
              // Extract detected language
              if (data.translations?.length > 0) {
                translation = data.translations[0].text;
                detectedSourceLang = data.translations[0].detected_source_language || 'auto';
              } else {
                translation = '[translation error]';
              }

              const safeTranslation = translation ?? '[null translation]';
              cache[cacheKey] = safeTranslation;

              // Save with the captured languages
              await saveTranslation(
                highlightedWord, 
                safeTranslation, 
                pageUrl, 
                targetLang, 
                contextText,
                detectedSourceLang,
                targetLang
              );
              
              sendResponse({ translation: safeTranslation });
            } 
            else {
              // Handle case where API_KEY is not available
              sendResponse({ error: 'API key not configured' });
            }
          } 
          catch (err) {
            console.error('Translation error', err);
            sendResponse({ translation: '[error]' });
          }
        })();
      });

      return true;
    }
  },
);

// Refresh session every 10 minutes
setInterval(refreshSessionIfNeeded, 10 * 60 * 1000);

// Restore session on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension starting up, restoring session...');
  await restoreSession();
});

// Restore session on install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated, restoring session...');
  await restoreSession();
});

// Initialize auth state
(async () => {
  console.log('Initializing auth state...');
  const { rememberMe } = await chrome.storage.local.get('rememberMe');
  
  if (rememberMe) {
    console.log('Remember me enabled, restoring session...');
    const restored = await restoreSession();
    console.log('Session restoration:', restored ? 'successful' : 'failed');
  } else {
    console.log('Remember me not enabled');
  }
})();
