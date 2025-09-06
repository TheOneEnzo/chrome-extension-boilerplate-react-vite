// background.ts
// Background service worker for translations + caching + saving
// Using DeepL API for real translations
import env from '@extension/env';

const API_KEY: string = process.env.CEB_API_KEY || '';

// Debug log to verify it's working
console.log('CEB_API_KEY from process.env:', process.env.CEB_API_KEY);
console.log('CEB_API_KEY length:', process.env.CEB_API_KEY?.length);
const DEFAULT_TARGET_LANG = "en"; // default target language

// Simple in-memory cache
const cache: Record<string, string> = {};

// Types
interface TranslationMessage {
  type: "translate";
  text: string;
  url?: string; // Add URL to the message
}

interface TranslationResponse {
  translation?: string;
  error?: string;
  fromCache?: boolean;
}

// Helper: save to chrome.storage.local (keeps last 100)
async function saveTranslation(original: string, translation: string, url: string = ""): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ translations: [] }, (result) => {
      const updated = [
        ...result.translations,
        { original, translation, date: Date.now(), url: url },
      ];
      // keep only latest 100 items
      const trimmed = updated.slice(-100);
      chrome.storage.local.set({ translations: trimmed }, () => resolve());
    });
  });
}

// Listener for messages
chrome.runtime.onMessage.addListener(
  (message: TranslationMessage, sender, sendResponse: (response?: TranslationResponse) => void) => {
    if (message.type === "translate") {
      chrome.storage.local.get({ enabled: true, targetLang: DEFAULT_TARGET_LANG }, (res) => {
        if (!res.enabled) {
          sendResponse({ error: "Extension is disabled" });
          return;
        }

        const text = (message.text || "").trim();
        if (!text) {
          sendResponse({ translation: "" });
          return;
        }

        const targetLang = (res.targetLang || DEFAULT_TARGET_LANG).toLowerCase();
        // Get URL from the message, or try to get it from the sender tab
        const pageUrl = message.url || (sender.tab?.url) || "";

        // Check cache
        const cacheKey = `${text}|${targetLang}`;
        if (cache[cacheKey]) {
          // Still save to storage even if from cache, with the current URL
          saveTranslation(text, cache[cacheKey], pageUrl);
          sendResponse({ translation: cache[cacheKey], fromCache: true });
          return;
        }

        (async () => {
          try {
            let translation: string | null = null;

            // Check if API key is present and valid
            if (API_KEY && API_KEY.trim() !== '' && API_KEY !== 'undefined') {
              console.log('Using real DeepL API for translation');
              
              // Use the correct DeepL API endpoint format
              const url = "https://api-free.deepl.com/v2/translate";
              const params = new URLSearchParams();
              params.append("auth_key", API_KEY.trim());
              params.append("text", text);
              params.append("target_lang", targetLang.toUpperCase());

              const resp = await fetch(url, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/x-www-form-urlencoded",
                  "User-Agent": "YourApp/1.2.3" // Some APIs like this
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
                translation = "[translation error: no translations in response]";
              }
            } else {
              console.log('Using mock translation - no valid API key found');
              translation = "[mock] " + text;
            }

            // ✅ Ensure translation is a string before using it
            const safeTranslation: string = translation ?? "[null translation]";

            // cache it
            cache[cacheKey] = safeTranslation;
            await saveTranslation(text, safeTranslation, pageUrl);

            sendResponse({ translation: safeTranslation });
          } catch (err) {
            console.error("Translation error", err);
            sendResponse({ 
              translation: "[error: " + (err instanceof Error ? err.message : String(err)) + "]" 
            });
          }
        })();

      });

      // Must return true so response stays alive for async
      return true;
    }
  }
);