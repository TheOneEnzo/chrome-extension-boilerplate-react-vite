// Popup.tsx
import React, { useEffect, useState } from 'react';

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

export default function Popup() {
  const [items, setItems] = useState<TranslationItem[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [targetLang, setTargetLang] = useState('EN-US');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // --- Effect: Load translations + auth state
  useEffect(() => {
    loadTranslations();
    checkAuth();

    chrome.storage.local.get({ enabled: true }, res => setEnabled(res.enabled));
    chrome.storage.local.get({ targetLang: 'EN-US' }, res => setTargetLang(res.targetLang));

    // Listen for Supabase changes from background
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
    };
  }, [user]);

  const handleBackgroundMessage = (msg: any) => {
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

      if (response.success && response.user) {
        setUser(response.user);
      } else {
        const refreshResponse = await chrome.runtime.sendMessage({
          type: 'auth',
          action: 'refreshSession',
        });
        if (refreshResponse.success && refreshResponse.user) {
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
      remember: rememberMe,
    });
    setLoading(false);

    if (response.success) {
      setUser(response.user);
      setShowAuthForm(false);
      setAuthEmail('');
      setAuthPassword('');

      loadTranslations();
      
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
    }
  };

    // --- Remove one translation
  const removeItem = async (index: number) => {
    const item = items[index];
    if (user && item.id) {
      await chrome.runtime.sendMessage({
        type: 'flashcards',
        action: 'delete',
        id: item.id,
      });
      // Reload translations after deletion
      loadTranslations();
    }
  };

  // --- Clear all translations
  const clearAll = async () => {
    if (!confirm('Clear all saved translations?')) return;

    if (user) {
      await chrome.runtime.sendMessage({
        type: 'flashcards',
        action: 'clearAll',
      });
      setItems([]);
    }
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

  const openFlashcards = () => {
    window.open('https://highlightranslator.com/flashcards', '_blank');
  };

  const escapeHtml = (s: string) =>
    String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m));


  return (
    <div style={{ fontFamily: 'system-ui, Arial', margin: 8 }}>
      {/* Authentication Section */}
      <div style={{ marginBottom: 15, padding: 10, borderBottom: '1px solid #eee' }}>
        {user ? (
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              Welcome, <strong>{user.email}</strong>
            </p>
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
                <label style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{ marginRight: '6px' }}
                  />
                  Remember me
                </label>
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
                style={{ color: '#007bff', textDecoration: 'none' }}
              >
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

      <h1 style={{ fontSize: 16, margin: '6px 0 12px 0' }}>Saved translations</h1>

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

      {user && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#666', textAlign: 'center' }}>
          Translations are being synced to your account
        </div>
      )}
    </div>
  );
}
