// Popup.tsx
import { useEffect, useState } from 'react';

type TranslationItem = {
  id?: string; // Supabase UUID if synced
  original: string;
  translation: string;
  date: string;
  url?: string;
  original_language?: string;
  translation_language?: string;
};

type User = {
  id: string;
  email: string;
};

type SubscriptionStatus = {
  subscribed: boolean;
  productId?: string;
  subscriptionEnd?: string;
};

type CharacterUsage = {
  used: number;
  limit: number;
};

const DEFAULT_TRANSLATION_CHAR_LIMIT = 50;
const MIN_TRANSLATION_CHAR_LIMIT = 1;
const MAX_TRANSLATION_CHAR_LIMIT = 1000;

export default function Popup() {
  const [, setItems] = useState<TranslationItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [targetLang, setTargetLang] = useState('EN-US');
  const [translationCharLimit, setTranslationCharLimit] = useState(DEFAULT_TRANSLATION_CHAR_LIMIT);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [characterUsage, setCharacterUsage] = useState<CharacterUsage | null>(null);

  // --- Effect: Load translations + auth state
  useEffect(() => {
    const initialize = async () => {
      await checkAuth();
      loadTranslations();

      // Load character usage immediately (works for both logged in and not logged in)
      loadCharacterUsage();
    };

    initialize();

    chrome.storage.local.get({ enabled: true }, res => setEnabled(res.enabled));
    chrome.storage.local.get({ targetLang: 'EN-US' }, res => setTargetLang(res.targetLang));
    chrome.storage.local.get({ translationCharLimit: DEFAULT_TRANSLATION_CHAR_LIMIT }, res => {
      setTranslationCharLimit(Number(res.translationCharLimit) || DEFAULT_TRANSLATION_CHAR_LIMIT);
    });

    // Listen for Supabase changes from background
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
    };
  }, []);

  // --- Effect: Load subscription and usage when user changes
  useEffect(() => {
    if (user) {
      loadSubscription();
      loadCharacterUsage();
    } else {
      setSubscription(null);
      loadCharacterUsage(); // Still load usage for non-logged-in users
    }
  }, [user]);

  // --- Refresh character usage periodically when popup is open
  useEffect(() => {
    const interval = setInterval(() => {
      loadCharacterUsage();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const handleBackgroundMessage = (msg: { type?: string }) => {
    if (msg.type === 'flashcardsUpdated') {
      loadTranslations(); // reload whenever background notifies of change
    }
  };

  // --- Load translations from both sources, Supabase wins
  // Modify loadTranslations to only load from Supabase
  const loadTranslations = async () => {
    if (user) {
      const response = await chrome.runtime.sendMessage({
        type: 'flashcards',
        action: 'list',
      });

      if (response.success) {
        setItems(response.data as TranslationItem[]);
      } else {
        console.error('Failed to load Supabase translations:', response.error);
        setItems([]); // Set empty array instead of falling back to local
      }
    } else {
      // User not authenticated, show empty list
      setItems([]);
    }
  };

  // --- Check stored session
  const checkAuth = async () => {
    const { rememberMe } = await chrome.storage.local.get('rememberMe');
    if (!rememberMe) {
      setUser(null);
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'auth',
        action: 'getSession',
      });

      if (response && response.success && response.user) {
        setUser(response.user);
      } else {
        const refreshResponse = await chrome.runtime.sendMessage({
          type: 'auth',
          action: 'refreshSession',
        });
        if (refreshResponse && refreshResponse.success && refreshResponse.user) {
          setUser(refreshResponse.user);
        } else {
          chrome.storage.local.remove('rememberMe');
          setUser(null);
        }
      }
    } catch (err) {
      console.error('Error checking auth:', err);
      setUser(null);
    }
  };

  // --- Handle sign in + migrate local translations
  const handleSignIn = async () => {
    setLoading(true);
    const response = await chrome.runtime.sendMessage({
      type: 'auth',
      action: 'signin',
      email: authEmail,
      password: authPassword,
      remember: true,
    });
    setLoading(false);

    if (response.success) {
      setUser(response.user);
      setShowAuthForm(false);
      setAuthEmail('');
      setAuthPassword('');

      loadTranslations();
      loadSubscription();
      loadCharacterUsage();
    } else {
      alert('Sign in failed: ' + response.error);
    }
  };

  const handleSignOut = async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'auth',
      action: 'signout',
    });
    if (response.success) {
      setUser(null);
      setItems([]); // Just clear the items
      setSubscription(null);
      loadCharacterUsage(); // Reload usage for non-logged-in state
    }
  };

  // --- Load subscription status
  const loadSubscription = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'subscription',
        action: 'check',
      });
      console.log('Subscription response:', response);
      if (response && response.success) {
        setSubscription({
          subscribed: response.subscribed || false,
          productId: response.productId,
          subscriptionEnd: response.subscriptionEnd,
        });
      } else {
        console.error('Subscription check failed:', response);
      }
    } catch (err) {
      console.error('Error loading subscription:', err);
    }
  };

  // --- Load character usage
  const loadCharacterUsage = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'subscription',
        action: 'getUsage',
      });
      console.log('Character usage response:', response);
      if (response && response.success) {
        setCharacterUsage({
          used: response.used || 0,
          limit: response.limit || 500,
        });
      } else {
        console.error('Character usage check failed:', response);
        // Set default values if request fails
        setCharacterUsage({
          used: 0,
          limit: user ? 2000 : 500,
        });
      }
    } catch (err) {
      console.error('Error loading character usage:', err);
      // Set default values on error
      setCharacterUsage({
        used: 0,
        limit: user ? 2000 : 500,
      });
    }
  };

  // --- Get subscription tier name
  const getSubscriptionTier = (): string => {
    if (!user) return 'Not Logged In';
    if (!subscription) return 'Loading...';
    if (!subscription.subscribed) return 'Free';
    if (subscription.productId === 'prod_TdgBRg4vUcghkL') return 'Pro';
    if (subscription.productId === 'prod_TdgB3FcPDfpXCJ') return 'Premium';
    return 'Free';
  };

  // --- Settings
  const toggleExtension = (checked: boolean) => {
    setEnabled(checked);
    chrome.storage.local.set({ enabled: checked });
  };
  const changeTargetLang = (lang: string) => {
    setTargetLang(lang);
    chrome.storage.local.set({ targetLang: lang });
  };
  const changeTranslationCharLimit = (value: string) => {
    const parsedValue = Number.parseInt(value, 10);
    const nextLimit = Number.isNaN(parsedValue)
      ? DEFAULT_TRANSLATION_CHAR_LIMIT
      : Math.min(Math.max(parsedValue, MIN_TRANSLATION_CHAR_LIMIT), MAX_TRANSLATION_CHAR_LIMIT);

    setTranslationCharLimit(nextLimit);
    chrome.storage.local.set({ translationCharLimit: nextLimit });
  };

  const openFlashcards = () => {
    window.open('https://highlightranslator.com/flashcards', '_blank');
  };

  const openPricing = () => {
    window.open('https://highlightranslator.com/pricing', '_blank');
  };

  return (
    <div style={{ fontFamily: 'system-ui, Arial', margin: 8 }}>
      {!user && (
        <div
          style={{
            margin: '-8px -8px 14px -8px',
            padding: '14px 12px',
            backgroundColor: '#f5f8ff',
            borderBottom: '1px solid #d8e6ff',
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            overflow: 'hidden',
          }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>
              Need more translation characters?
            </p>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.35, color: '#5f6368' }}>
              Create an account and sign in to get a higher monthly limit.
            </p>
          </div>
          <button
            onClick={openPricing}
            style={{
              flexShrink: 0,
              padding: '7px 11px',
              backgroundColor: '#1a73e8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0,
            }}>
            Pricing
          </button>
        </div>
      )}

      {/* Authentication Section */}
      <div style={{ marginBottom: 15, padding: 10, borderBottom: '1px solid #eee' }}>
        {user ? (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              Welcome, <strong>{user.email}</strong>
            </p>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#666' }}>
              Plan: <strong>{getSubscriptionTier()}</strong>
            </p>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <button
                onClick={() => {
                  loadSubscription();
                  loadCharacterUsage();
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#1a73e8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 11,
                }}>
                Refresh
              </button>
              <button
                onClick={handleSignOut}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#ff4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}>
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div>
            {showAuthForm ? (
              <div>
                <input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px',
                    marginBottom: '6px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: 12,
                  }}
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px',
                    marginBottom: '6px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: 12,
                  }}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={handleSignIn}
                    disabled={loading}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#1a73e8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: 12,
                      flex: 1,
                    }}>
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                  <button
                    onClick={() => setShowAuthForm(false)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#666',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowAuthForm(true)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#1a73e8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}>
                  Sign In to Sync Translations
                </button>
                <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                  or{' '}
                  <a
                    href="https://highlightranslator.com/auth"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#007bff', textDecoration: 'none' }}>
                    create an account here
                  </a>
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Language Selection */}
      <label htmlFor="target-lang" style={{ display: 'block', marginBottom: 5, fontSize: 14 }}>
        Translate to:
      </label>
      <select
        id="target-lang"
        value={targetLang}
        onChange={e => changeTargetLang(e.target.value)}
        style={{
          width: '100%',
          padding: '6px',
          marginBottom: '10px',
          border: '1px solid #ddd',
          borderRadius: '4px',
        }}>
        <option value="AR">Arabic</option>
        <option value="BG">Bulgarian</option>
        <option value="ZH">Chinese (simplified)</option>
        <option value="ZH-TW">Chinese (traditional)</option>
        <option value="CS">Czech</option>
        <option value="DA">Danish</option>
        <option value="NL">Dutch</option>
        <option value="EN-US">English (American)</option>
        <option value="EN-GB">English (British)</option>
        <option value="ET">Estonian</option>
        <option value="FI">Finnish</option>
        <option value="FR">French</option>
        <option value="DE">German</option>
        <option value="EL">Greek</option>
        <option value="HE">Hebrew</option>
        <option value="HU">Hungarian</option>
        <option value="ID">Indonesian</option>
        <option value="IT">Italian</option>
        <option value="JA">Japanese</option>
        <option value="KO">Korean</option>
        <option value="LV">Latvian</option>
        <option value="LT">Lithuanian</option>
        <option value="NO">Norwegian (bokmål)</option>
        <option value="PL">Polish</option>
        <option value="PT">Portuguese</option>
        <option value="PT-BR">Portuguese (Brazilian)</option>
        <option value="RO">Romanian</option>
        <option value="RU">Russian</option>
        <option value="SK">Slovak</option>
        <option value="SL">Slovenian</option>
        <option value="ES">Spanish</option>
        <option value="ES-XL">Spanish (Latin American)</option>
        <option value="SV">Swedish</option>
        <option value="TR">Turkish</option>
        <option value="UK">Ukrainian</option>
        <option value="VI">Vietnamese</option>
      </select>

      <div style={{ marginBottom: 12, padding: 10, backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <label
          htmlFor="translation-char-limit"
          style={{ display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 'bold' }}>
          Characters per translation
        </label>
        <input
          id="translation-char-limit"
          type="number"
          min={MIN_TRANSLATION_CHAR_LIMIT}
          max={MAX_TRANSLATION_CHAR_LIMIT}
          value={translationCharLimit}
          onChange={e => changeTranslationCharLimit(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: 12,
          }}
        />
        <p style={{ margin: '6px 0 0 0', fontSize: 11, lineHeight: 1.35, color: '#666' }}>
          This controls how many selected characters are sent for one translation. Lower limits keep translations short
          and use fewer monthly characters; higher limits allow longer phrases.
        </p>
      </div>

      <button
        onClick={openFlashcards}
        style={{
          padding: '8px 16px',
          backgroundColor: '#1a73e8',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '10px',
          width: '100%',
        }}>
        Open Flashcards
      </button>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
          marginBottom: 10,
        }}>
        <input type="checkbox" checked={enabled} onChange={e => toggleExtension(e.target.checked)} />
        Enable extension
      </label>

      {/* Character Usage Progress Bar */}
      <div style={{ marginTop: 15, padding: 10, backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 'bold' }}>Character Usage</span>
          {characterUsage ? (
            <span style={{ fontSize: 12, color: '#666' }}>
              {characterUsage.used.toLocaleString()} / {characterUsage.limit.toLocaleString()}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#666' }}>Loading...</span>
          )}
        </div>
        {characterUsage ? (
          <>
            <div
              style={{
                width: '100%',
                height: 8,
                backgroundColor: '#e0e0e0',
                borderRadius: 4,
                overflow: 'hidden',
              }}>
              <div
                style={{
                  width: `${Math.min((characterUsage.used / characterUsage.limit) * 100, 100)}%`,
                  height: '100%',
                  backgroundColor:
                    characterUsage.used / characterUsage.limit > 0.9
                      ? '#ff4444'
                      : characterUsage.used / characterUsage.limit > 0.7
                        ? '#ffa500'
                        : '#1a73e8',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' }}>
              {characterUsage.limit - characterUsage.used > 0
                ? `${(characterUsage.limit - characterUsage.used).toLocaleString()} characters remaining this month`
                : 'Character limit reached'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' }}>Loading usage data...</div>
        )}
      </div>

      {user && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#666', textAlign: 'center' }}>
          Translations are being synced to your account
        </div>
      )}
    </div>
  );
}
