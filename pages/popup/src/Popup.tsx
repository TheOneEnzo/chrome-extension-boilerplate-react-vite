// Popup.tsx
import React, { useEffect, useState } from 'react';

type TranslationItem = {
  original: string;
  translation: string;
  date: string;
  url?: string;
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

  // Load translations and auth state on mount
  useEffect(() => {
    loadTranslations();
    checkAuth();

    chrome.storage.local.get({ enabled: true }, res => {
      setEnabled(res.enabled);
    });

    chrome.storage.local.get({ targetLang: 'EN-US' }, res => {
      setTargetLang(res.targetLang);
    });
  }, []);

  const loadTranslations = () => {
    chrome.storage.local.get({ translations: [] }, res => {
      setItems(res.translations as TranslationItem[]);
    });
  };

  const checkAuth = async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'auth',
      action: 'getSession',
    });

    if (response.success && response.user) {
      setUser(response.user);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    const response = await chrome.runtime.sendMessage({
      type: 'auth',
      action: 'signin',
      email: authEmail,
      password: authPassword,
    });

    setLoading(false);

    if (response.success) {
      setUser(response.user);
      setShowAuthForm(false);
      setAuthEmail('');
      setAuthPassword('');
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
    }
  };

  const removeItem = (index: number) => {
    chrome.storage.local.get({ translations: [] }, res => {
      const list = res.translations as TranslationItem[];
      const newList = list.filter((_, i) => i !== index);
      chrome.storage.local.set({ translations: newList }, () => {
        setItems(newList);
      });
    });
  };

  const clearAll = () => {
    if (!confirm('Clear all saved translations?')) return;
    chrome.storage.local.set({ translations: [] }, () => {
      setItems([]);
    });
  };

  const toggleExtension = (checked: boolean) => {
    setEnabled(checked);
    chrome.storage.local.set({ enabled: checked });
  };

  const changeTargetLang = (lang: string) => {
    setTargetLang(lang);
    chrome.storage.local.set({ targetLang: lang });
  };

  const openFlashcards = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('new-tab/index.html') });
  };

  const escapeHtml = (s: string) =>
    String(s).replace(
      /[&<>"']/g,
      m =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[m] || m,
    );

  return (
    <div style={{ fontFamily: 'system-ui, Arial', margin: 8, width: 380 }}>
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

      <div id="list" style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>
            No saved translations yet. Highlight text on any page to save.
          </div>
        ) : (
          items
            .slice()
            .reverse()
            .map((it, idx) => {
              const d = new Date(it.date);
              return (
                <div
                  key={idx}
                  style={{
                    padding: 8,
                    borderBottom: '1px solid #eee',
                  }}>
                  <div style={{ fontWeight: 600 }}>{escapeHtml(it.original)}</div>
                  <div style={{ color: '#1a1a1a', marginTop: 4 }}>{escapeHtml(it.translation)}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>{`${d.toLocaleString()} ${
                    it.url ? ' — ' + escapeHtml(it.url) : ''
                  }`}</div>
                  <button
                    onClick={() => removeItem(items.length - 1 - idx)}
                    style={{
                      marginTop: 5,
                      color: 'red',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}>
                    ✖ Remove
                  </button>
                </div>
              );
            })
        )}
      </div>

      {items.length > 0 && (
        <button
          onClick={clearAll}
          style={{
            marginTop: 10,
            color: 'red',
            border: '1px solid red',
            background: 'transparent',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            width: '100%',
          }}>
          Clear All Translations
        </button>
      )}

      {user && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#666', textAlign: 'center' }}>
          Translations are being synced to your account
        </div>
      )}
    </div>
  );
}
