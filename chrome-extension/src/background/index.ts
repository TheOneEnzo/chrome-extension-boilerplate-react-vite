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

// Subscription endpoint
const SUBSCRIPTION_ENDPOINT = 'https://bivafzwsqftbpnoomcyv.supabase.co/functions/v1/check-subscription';

// Product IDs
const PRO_PRODUCT_ID = 'prod_TdgBRg4vUcghkL';
const PREMIUM_PRODUCT_ID = 'prod_TdgB3FcPDfpXCJ';

// Character limits
const CHAR_LIMITS = {
  NOT_LOGGED_IN: 500,
  LOGGED_IN: 2000,
  PRO: 10000,
  PREMIUM: 20000,
};

// Simple in-memory cache
const cache: Record<string, string> = {};
const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000;
let subscriptionCache: { value: SubscriptionResponse; ts: number } | null = null;

let settingsCache = { enabled: true, targetLang: DEFAULT_TARGET_LANG };
let settingsLoaded = false;

async function loadSettingsCache(): Promise<void> {
  const res = await chrome.storage.local.get({ enabled: true, targetLang: DEFAULT_TARGET_LANG });
  settingsCache = {
    enabled: !!res.enabled,
    targetLang: (res.targetLang || DEFAULT_TARGET_LANG).toLowerCase(),
  };
  settingsLoaded = true;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) {
    settingsCache.enabled = !!changes.enabled.newValue;
  }
  if (changes.targetLang) {
    settingsCache.targetLang = (changes.targetLang.newValue || DEFAULT_TARGET_LANG).toLowerCase();
  }
});

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

interface SubscriptionMessage {
  type: 'subscription';
  action: 'check' | 'getUsage';
}

interface SubscriptionResponse {
  success: boolean;
  subscribed?: boolean;
  productId?: string;
  subscriptionEnd?: string;
  error?: string;
}

interface UsageResponse {
  success: boolean;
  used?: number;
  limit?: number;
  error?: string;
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
      .maybeSingle();

    if (error) {
      console.log('No cached translation in Supabase:', error.message);
      return null;
    }

    if (!data) return null;
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
    subscriptionCache = null;

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
    subscriptionCache = null;
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

// Check subscription status
async function checkSubscription(): Promise<SubscriptionResponse> {
  try {
    if (subscriptionCache && Date.now() - subscriptionCache.ts < SUBSCRIPTION_CACHE_TTL_MS) {
      return subscriptionCache.value;
    }

    const session = await getCurrentSession();
    console.log('checkSubscription - session exists:', !!session);
    
    if (!session || !session.access_token) {
      console.log('checkSubscription - no session or access token');
      return { success: true, subscribed: false };
    }

    console.log('checkSubscription - calling endpoint:', SUBSCRIPTION_ENDPOINT);
    const response = await fetch(SUBSCRIPTION_ENDPOINT, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Subscription check failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return { success: true, subscribed: false };
    }

    const data = await response.json();
    console.log('checkSubscription - response data:', data);
    const result = {
      success: true,
      subscribed: data.subscribed || false,
      productId: data.productId,
      subscriptionEnd: data.subscriptionEnd,
    };
    subscriptionCache = { value: result, ts: Date.now() };
    return result;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return { success: false, error: 'Failed to check subscription' };
  }
}

// Get character limit based on subscription status
async function getCharacterLimit(): Promise<number> {
  const { rememberMe } = await chrome.storage.local.get('rememberMe');
  
  if (!rememberMe) {
    return CHAR_LIMITS.NOT_LOGGED_IN;
  }

  const subscription = await checkSubscription();
  
  if (!subscription.success || !subscription.subscribed) {
    return CHAR_LIMITS.LOGGED_IN;
  }

  if (subscription.productId === PREMIUM_PRODUCT_ID) {
    return CHAR_LIMITS.PREMIUM;
  } else if (subscription.productId === PRO_PRODUCT_ID) {
    return CHAR_LIMITS.PRO;
  }

  return CHAR_LIMITS.LOGGED_IN;
}

// Get current month key (YYYY-MM format)
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Get character usage for current month
async function getCharacterUsage(): Promise<{ used: number; limit: number; monthKey: string }> {
  const monthKey = getCurrentMonthKey();
  const result = await chrome.storage.local.get(['charUsage', 'charUsageMonth']);
  
  // Reset if it's a new month
  if (result.charUsageMonth !== monthKey) {
    await chrome.storage.local.set({
      charUsage: 0,
      charUsageMonth: monthKey,
    });
    return { used: 0, limit: await getCharacterLimit(), monthKey };
  }

  const limit = await getCharacterLimit();
  return {
    used: result.charUsage || 0,
    limit,
    monthKey,
  };
}

// Increment character usage
async function incrementCharacterUsage(count: number): Promise<boolean> {
  const usage = await getCharacterUsage();
  
  if (usage.used + count > usage.limit) {
    return false; // Would exceed limit
  }

  await chrome.storage.local.set({
    charUsage: usage.used + count,
    charUsageMonth: usage.monthKey,
  });

  return true;
}

// Get character usage info for popup
async function getUsageInfo(): Promise<UsageResponse> {
  try {
    const usage = await getCharacterUsage();
    console.log('getUsageInfo returning:', { used: usage.used, limit: usage.limit });
    return {
      success: true,
      used: usage.used,
      limit: usage.limit,
    };
  } catch (error) {
    console.error('Error getting usage info:', error);
    return { success: false, error: 'Failed to get usage info' };
  }
}

// Main message listener
chrome.runtime.onMessage.addListener(
  (message: TranslationMessage | AuthMessage | SubscriptionMessage, sender, sendResponse: (response?: any) => void) => {
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

    // Handle subscription messages
    if (message.type === 'subscription') {
      (async () => {
        switch (message.action) {
          case 'check':
            const subResult = await checkSubscription();
            sendResponse(subResult);
            break;
          case 'getUsage':
            const usageResult = await getUsageInfo();
            sendResponse(usageResult);
            break;
        }
      })();
      return true;
    }

    if (message.type === 'translate') {
      (async () => {
        if (!settingsLoaded) {
          await loadSettingsCache();
        }

        if (!settingsCache.enabled) {
          sendResponse({ error: 'Extension is disabled' });
          return;
        }

        const text = (message.text || '').trim();
        if (!text) {
          sendResponse({ translation: '' });
          return;
        }

        const targetLang = settingsCache.targetLang || DEFAULT_TARGET_LANG;
        const pageUrl = message.url || sender.tab?.url || '';

        // Extract highlighted word and context
        const highlightedWord = (message as any).highlightedWord || text;
        const contextText = (message as any).highlightedWord ? text : undefined;

        const cacheKey = `${highlightedWord}|${targetLang}`;

        // Check in-memory cache first
        if (cache[cacheKey]) {
          const cachedTranslation = cache[cacheKey];
          sendResponse({ translation: cachedTranslation, fromCache: true });
          void saveTranslation(
            highlightedWord, 
            cachedTranslation, 
            pageUrl, 
            targetLang, 
            contextText,
            'auto',
            targetLang
          );
          return;
        }

        // Check Supabase cache
        const supabaseCachedTranslation = await checkSupabaseCache(highlightedWord, targetLang);
        if (supabaseCachedTranslation) {
          cache[cacheKey] = supabaseCachedTranslation;
          sendResponse({ translation: supabaseCachedTranslation, fromCache: true });
          void saveTranslation(
            highlightedWord, 
            supabaseCachedTranslation, 
            pageUrl, 
            targetLang, 
            contextText,
            'auto',
            targetLang
          );
          return;
        }

        // If we get here, we need a new translation - check character limit
        const charCount = highlightedWord.length;
        const usage = await getCharacterUsage();
        
        if (usage.used + charCount > usage.limit) {
          sendResponse({ 
            error: `Character limit reached. You've used ${usage.used}/${usage.limit} characters this month.` 
          });
          return;
        }

        // FIX: Translate ONLY the highlighted word, not the context
        (async () => {
          try {
            let translation: string | null = null;
            let detectedSourceLang = 'auto';

            if (API_KEY && API_KEY.trim() !== '' && API_KEY !== 'undefined') {
              const url = 'https://api-free.deepl.com/v2/translate';
              const payload = {
                text: [highlightedWord], // Translate the word only
                target_lang: targetLang.toUpperCase(),
              };

              const resp = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `DeepL-Auth-Key ${API_KEY.trim()}`,
                },
                body: JSON.stringify(payload),
              });

              const raw = await resp.text();
              let data: any = null;
              try {
                data = raw ? JSON.parse(raw) : null;
              } catch (parseErr) {
                console.error('DeepL response parse error:', parseErr, 'raw:', raw);
              }

              if (!resp.ok) {
                console.error('DeepL HTTP error:', resp.status, resp.statusText, data || raw);
                sendResponse({ error: `DeepL error ${resp.status}` });
                return;
              }
              
              // Extract detected language
              if (data?.translations?.length > 0) {
                translation = data.translations[0].text;
                detectedSourceLang = data.translations[0].detected_source_language || 'auto';
              } else {
                console.error('DeepL response missing translations:', data || raw);
                translation = '[translation error]';
              }

              const safeTranslation = translation ?? '[null translation]';
              cache[cacheKey] = safeTranslation;

              // Increment character usage for new translation
              sendResponse({ translation: safeTranslation });
              void incrementCharacterUsage(charCount).then(incrementSuccess => {
                if (!incrementSuccess) {
                  console.warn('Character limit exceeded, but translation already completed');
                }
              });
              void saveTranslation(
                highlightedWord, 
                safeTranslation, 
                pageUrl, 
                targetLang, 
                contextText,
                detectedSourceLang,
                targetLang
              );
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
      })();

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
  void loadSettingsCache();
  const { rememberMe } = await chrome.storage.local.get('rememberMe');
  
  if (rememberMe) {
    console.log('Remember me enabled, restoring session...');
    const restored = await restoreSession();
    console.log('Session restoration:', restored ? 'successful' : 'failed');
  } else {
    console.log('Remember me not enabled');
  }
})();
