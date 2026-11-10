// Popup.tsx
import '@src/Popup.css';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

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

type TriggerMode = 'always' | 'modifier';
type Theme = 'system' | 'light' | 'dark';

const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];
const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

const applyTheme = (theme: Theme) => {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('ht-theme', theme);
  } catch {
    // ignore: the popup still follows chrome.storage on next open
  }
};

const WEB_URL = 'https://highlightranslator.com';
const PRO_PRODUCT_ID = 'prod_TdgBRg4vUcghkL';
const PREMIUM_PRODUCT_ID = 'prod_TdgB3FcPDfpXCJ';

const DEFAULT_TRANSLATION_CHAR_LIMIT = 50;
const MIN_TRANSLATION_CHAR_LIMIT = 1;
const MAX_TRANSLATION_CHAR_LIMIT = 1000;
const CHAR_LIMIT_STEP = 10;

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

// DeepL target languages (stored as-is in chrome.storage.local.targetLang).
const TARGET_LANGUAGES: { code: string; name: string }[] = [
  { code: 'AR', name: 'Arabic' },
  { code: 'BG', name: 'Bulgarian' },
  { code: 'ZH', name: 'Chinese (simplified)' },
  { code: 'ZH-TW', name: 'Chinese (traditional)' },
  { code: 'CS', name: 'Czech' },
  { code: 'DA', name: 'Danish' },
  { code: 'NL', name: 'Dutch' },
  { code: 'EN-US', name: 'English (American)' },
  { code: 'EN-GB', name: 'English (British)' },
  { code: 'ET', name: 'Estonian' },
  { code: 'FI', name: 'Finnish' },
  { code: 'FR', name: 'French' },
  { code: 'DE', name: 'German' },
  { code: 'EL', name: 'Greek' },
  { code: 'HE', name: 'Hebrew' },
  { code: 'HU', name: 'Hungarian' },
  { code: 'ID', name: 'Indonesian' },
  { code: 'IT', name: 'Italian' },
  { code: 'JA', name: 'Japanese' },
  { code: 'KO', name: 'Korean' },
  { code: 'LV', name: 'Latvian' },
  { code: 'LT', name: 'Lithuanian' },
  { code: 'NO', name: 'Norwegian (bokmål)' },
  { code: 'PL', name: 'Polish' },
  { code: 'PT', name: 'Portuguese' },
  { code: 'PT-BR', name: 'Portuguese (Brazilian)' },
  { code: 'RO', name: 'Romanian' },
  { code: 'RU', name: 'Russian' },
  { code: 'SK', name: 'Slovak' },
  { code: 'SL', name: 'Slovenian' },
  { code: 'ES', name: 'Spanish' },
  { code: 'ES-XL', name: 'Spanish (Latin American)' },
  { code: 'SV', name: 'Swedish' },
  { code: 'TR', name: 'Turkish' },
  { code: 'UK', name: 'Ukrainian' },
  { code: 'VI', name: 'Vietnamese' },
];

// Languages DeepL can detect as a source, keyed by the lowercase base code the
// background script compares against.
const SOURCE_LANGUAGES: { code: string; name: string }[] = [
  { code: 'ar', name: 'Arabic' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'et', name: 'Estonian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'nb', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
];
const SOURCE_LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  SOURCE_LANGUAGES.map(({ code, name }) => [code, name]),
);
const TARGET_BASE_ALIASES: Record<string, string> = { no: 'nb' };

const targetBaseName = (targetLang: string): string => {
  const base = targetLang.toLowerCase().split('-')[0];
  return SOURCE_LANGUAGE_NAMES[TARGET_BASE_ALIASES[base] || base] || targetLang;
};

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// ---------- Small UI pieces ----------

const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSignOut = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path
      d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconCards = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="7" width="14" height="13" rx="2" />
    <path d="M7 4h12a2 2 0 0 1 2 2v11" strokeLinecap="round" />
  </svg>
);

const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path
      d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      strokeLinecap="round"
    />
  </svg>
);

const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSystem = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" strokeLinecap="round" />
  </svg>
);

const IconClose = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
);

const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className="ht-switch"
    onClick={() => onChange(!checked)}
  />
);

const Row = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
  <div className="ht-row">
    <div className="ht-row-text">
      <div className="ht-row-title">{title}</div>
      {sub && <div className="ht-row-sub">{sub}</div>}
    </div>
    {children}
  </div>
);

export default function Popup() {
  const [enabled, setEnabled] = useState(true);
  const [targetLang, setTargetLang] = useState('EN-US');
  const [translationCharLimit, setTranslationCharLimit] = useState(DEFAULT_TRANSLATION_CHAR_LIMIT);
  const [charLimitDraft, setCharLimitDraft] = useState(String(DEFAULT_TRANSLATION_CHAR_LIMIT));
  const [sourceLangs, setSourceLangs] = useState<string[]>([]);
  const [skipTargetLang, setSkipTargetLang] = useState(true);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('always');
  const [theme, setTheme] = useState<Theme>('system');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [characterUsage, setCharacterUsage] = useState<CharacterUsage | null>(null);

  // --- Effect: Load settings + auth state
  useEffect(() => {
    void checkAuth();
    void loadCharacterUsage();

    chrome.storage.local.get(
      {
        enabled: true,
        targetLang: 'EN-US',
        translationCharLimit: DEFAULT_TRANSLATION_CHAR_LIMIT,
        sourceLangs: [],
        skipTargetLang: true,
        triggerMode: 'always',
        theme: 'system',
      },
      res => {
        const savedTheme: Theme = res.theme === 'light' || res.theme === 'dark' ? res.theme : 'system';
        setTheme(savedTheme);
        applyTheme(savedTheme);
        const limit = Number(res.translationCharLimit) || DEFAULT_TRANSLATION_CHAR_LIMIT;
        setEnabled(res.enabled);
        setTargetLang(res.targetLang);
        setTranslationCharLimit(limit);
        setCharLimitDraft(String(limit));
        setSourceLangs(Array.isArray(res.sourceLangs) ? res.sourceLangs : []);
        setSkipTargetLang(res.skipTargetLang !== false);
        setTriggerMode(res.triggerMode === 'modifier' ? 'modifier' : 'always');
      },
    );
  }, []);

  // --- Effect: Load subscription and usage when user changes
  useEffect(() => {
    if (user) {
      void loadSubscription();
    } else {
      setSubscription(null);
    }
    void loadCharacterUsage();
  }, [user]);

  // --- Refresh character usage periodically when popup is open
  useEffect(() => {
    const interval = setInterval(() => {
      void loadCharacterUsage();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- Check stored session
  const checkAuth = async () => {
    const { rememberMe } = await chrome.storage.local.get('rememberMe');
    if (!rememberMe) {
      setUser(null);
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: 'auth', action: 'getSession' });

      if (response && response.success && response.user) {
        setUser(response.user);
      } else {
        const refreshResponse = await chrome.runtime.sendMessage({ type: 'auth', action: 'refreshSession' });
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

  const handleSignIn = async () => {
    if (!authEmail || !authPassword) {
      setAuthError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setAuthError('');
    const response = await chrome.runtime.sendMessage({
      type: 'auth',
      action: 'signin',
      email: authEmail,
      password: authPassword,
      remember: true,
    });
    setLoading(false);

    if (response?.success) {
      setUser(response.user);
      setShowAuthForm(false);
      setAuthEmail('');
      setAuthPassword('');
    } else {
      setAuthError(response?.error || 'Sign in failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'auth', action: 'signout' });
    if (response?.success) {
      setUser(null);
      setSubscription(null);
    }
  };

  const loadSubscription = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'subscription', action: 'check' });
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

  const loadCharacterUsage = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'subscription', action: 'getUsage' });
      if (response && response.success) {
        setCharacterUsage({ used: response.used || 0, limit: response.limit || 500 });
      } else {
        console.error('Character usage check failed:', response);
      }
    } catch (err) {
      console.error('Error loading character usage:', err);
    }
  };

  const getSubscriptionTier = (): string => {
    if (!user) return 'Guest';
    if (!subscription) return '…';
    if (!subscription.subscribed) return 'Free';
    if (subscription.productId === PRO_PRODUCT_ID) return 'Pro';
    if (subscription.productId === PREMIUM_PRODUCT_ID) return 'Premium';
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
  const commitTranslationCharLimit = (value: number) => {
    const nextLimit = Number.isNaN(value)
      ? translationCharLimit
      : Math.min(Math.max(Math.round(value), MIN_TRANSLATION_CHAR_LIMIT), MAX_TRANSLATION_CHAR_LIMIT);
    setTranslationCharLimit(nextLimit);
    setCharLimitDraft(String(nextLimit));
    chrome.storage.local.set({ translationCharLimit: nextLimit });
  };
  const addSourceLang = (code: string) => {
    if (!code || sourceLangs.includes(code)) return;
    const next = [...sourceLangs, code];
    setSourceLangs(next);
    chrome.storage.local.set({ sourceLangs: next });
  };
  const removeSourceLang = (code: string) => {
    const next = sourceLangs.filter(c => c !== code);
    setSourceLangs(next);
    chrome.storage.local.set({ sourceLangs: next });
  };
  const toggleSkipTargetLang = (checked: boolean) => {
    setSkipTargetLang(checked);
    chrome.storage.local.set({ skipTargetLang: checked });
  };
  const changeTriggerMode = (mode: TriggerMode) => {
    setTriggerMode(mode);
    chrome.storage.local.set({ triggerMode: mode });
  };

  // Cycles System -> Light -> Dark. Saved to chrome.storage so the in-page tooltip follows it too.
  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setTheme(next);
    applyTheme(next);
    chrome.storage.local.set({ theme: next });
  };

  const openWeb = (path: string) => {
    window.open(`${WEB_URL}${path}`, '_blank');
  };

  // --- Derived display values
  const tier = getSubscriptionTier();
  const isPaid = tier === 'Pro' || tier === 'Premium';
  const targetName = targetBaseName(targetLang);
  const fromSummary =
    sourceLangs.length === 0
      ? 'Any language'
      : sourceLangs.length <= 2
        ? sourceLangs.map(c => SOURCE_LANGUAGE_NAMES[c] || c.toUpperCase()).join(', ')
        : `${sourceLangs.length} languages`;
  const statusText = enabled ? `${fromSummary} → ${targetName}` : 'Paused, highlights are ignored';

  const usageRatio = characterUsage ? Math.min(characterUsage.used / Math.max(characterUsage.limit, 1), 1) : 0;
  const usageLevel = usageRatio > 0.9 ? 'danger' : usageRatio > 0.7 ? 'warn' : '';
  const remaining = characterUsage ? Math.max(characterUsage.limit - characterUsage.used, 0) : 0;
  const altKeyLabel = IS_MAC ? '⌥ Option' : 'Alt';

  return (
    <div className="ht">
      {/* Header: what the extension is doing right now + the master switch */}
      <header className="ht-header">
        <img className="ht-logo" src="/icon.png" alt="" />
        <div className="ht-title">
          <h1>Highlight Translator</h1>
          <div className="ht-status" title={statusText}>
            <span className={cx('ht-dot', !enabled && 'off')} />
            {statusText}
          </div>
        </div>
        <button
          type="button"
          className="ht-icon-btn"
          onClick={cycleTheme}
          title={`Theme: ${THEME_LABELS[theme]}. Click for ${THEME_LABELS[THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % 3]]}`}
          aria-label={`Theme: ${THEME_LABELS[theme]}. Change theme`}>
          {theme === 'light' ? <IconSun /> : theme === 'dark' ? <IconMoon /> : <IconSystem />}
        </button>
        <Switch checked={enabled} onChange={toggleExtension} label="Enable translation" />
      </header>

      {/* Languages */}
      <section className={cx('ht-card', !enabled && 'ht-dim')}>
        <div className="ht-langs">
          <div>
            <span className="ht-label">Translate from</span>
            <div className="ht-chips">
              {sourceLangs.length === 0 && <span className="ht-chip muted">Any language</span>}
              {sourceLangs.map(code => (
                <span key={code} className="ht-chip">
                  {SOURCE_LANGUAGE_NAMES[code] || code.toUpperCase()}
                  <button
                    type="button"
                    onClick={() => removeSourceLang(code)}
                    aria-label={`Remove ${SOURCE_LANGUAGE_NAMES[code] || code}`}>
                    <IconClose />
                  </button>
                </span>
              ))}
              <label className="ht-chip add">
                + {sourceLangs.length === 0 ? 'Choose' : 'Add'}
                <select
                  value=""
                  aria-label="Add a language to translate from"
                  onChange={e => addSourceLang(e.target.value)}>
                  <option value="" disabled>
                    Add a language…
                  </option>
                  {SOURCE_LANGUAGES.filter(({ code }) => !sourceLangs.includes(code)).map(({ code, name }) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div>
            <label className="ht-label" htmlFor="target-lang">
              Translate to
            </label>
            <div className="ht-select">
              <select id="target-lang" value={targetLang} onChange={e => changeTargetLang(e.target.value)}>
                {TARGET_LANGUAGES.map(({ code, name }) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </div>
          </div>
        </div>
        <p className="ht-hint">
          {sourceLangs.length === 0
            ? 'Pick languages to ignore everything else, for free.'
            : 'Other languages are ignored and free.'}
        </p>
      </section>

      {/* Behaviour */}
      <section className={cx('ht-card', 'flush', !enabled && 'ht-dim')}>
        <Row
          title="Translate when"
          sub={triggerMode === 'modifier' ? `Hold ${altKeyLabel} while selecting` : 'On every highlight'}>
          <div className="ht-seg" role="group" aria-label="Translate when">
            <button type="button" aria-pressed={triggerMode === 'always'} onClick={() => changeTriggerMode('always')}>
              Always
            </button>
            <button
              type="button"
              aria-pressed={triggerMode === 'modifier'}
              onClick={() => changeTriggerMode('modifier')}>
              Hold {IS_MAC ? '⌥' : 'Alt'}
            </button>
          </div>
        </Row>
        <Row title={`Skip ${targetName} text`} sub="Ignore text that’s already in your language">
          <Switch
            checked={skipTargetLang}
            onChange={toggleSkipTargetLang}
            label={`Skip text already in ${targetName}`}
          />
        </Row>
        <Row title="Max selection" sub="Longer selections are ignored">
          <div className="ht-num">
            <button
              type="button"
              aria-label="Decrease"
              onClick={() => commitTranslationCharLimit(translationCharLimit - CHAR_LIMIT_STEP)}>
              −
            </button>
            <input
              type="number"
              aria-label="Maximum characters per translation"
              min={MIN_TRANSLATION_CHAR_LIMIT}
              max={MAX_TRANSLATION_CHAR_LIMIT}
              value={charLimitDraft}
              onChange={e => setCharLimitDraft(e.target.value)}
              onBlur={() => commitTranslationCharLimit(Number.parseInt(charLimitDraft, 10))}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <button
              type="button"
              aria-label="Increase"
              onClick={() => commitTranslationCharLimit(translationCharLimit + CHAR_LIMIT_STEP)}>
              +
            </button>
          </div>
        </Row>
      </section>

      {/* Usage + account */}
      <section className="ht-card">
        <div className="ht-usage-head">
          <span className="ht-label" style={{ margin: 0 }}>
            This month
          </span>
          <span className="ht-usage-num">
            {characterUsage ? (
              <>
                {characterUsage.used.toLocaleString()} <span>/ {characterUsage.limit.toLocaleString()}</span>
              </>
            ) : (
              <span>Loading…</span>
            )}
          </span>
        </div>
        <div className="ht-bar">
          <div className={usageLevel} style={{ width: `${usageRatio * 100}%` }} />
        </div>
        <div className="ht-usage-foot">
          <span>
            {characterUsage
              ? remaining > 0
                ? `${remaining.toLocaleString()} characters left`
                : 'Limit reached, resets next month'
              : ''}
          </span>
          {tier !== 'Premium' && (
            <button type="button" className="ht-link" onClick={() => openWeb('/pricing')}>
              Get more
            </button>
          )}
        </div>
        <div className="ht-divider" />
        {user ? (
          <div className="ht-account">
            <div className="ht-avatar">{user.email?.[0] || '?'}</div>
            <div className="ht-account-text">
              <div className="ht-email" title={user.email}>
                {user.email}
              </div>
              <span className={cx('ht-badge', isPaid && 'paid')}>{tier} plan</span>
            </div>
            <button
              type="button"
              className="ht-icon-btn"
              title="Refresh plan and usage"
              aria-label="Refresh plan and usage"
              onClick={() => {
                void loadSubscription();
                void loadCharacterUsage();
              }}>
              <IconRefresh />
            </button>
            <button
              type="button"
              className="ht-icon-btn danger"
              title="Sign out"
              aria-label="Sign out"
              onClick={handleSignOut}>
              <IconSignOut />
            </button>
          </div>
        ) : showAuthForm ? (
          <form
            className="ht-form"
            onSubmit={e => {
              e.preventDefault();
              void handleSignIn();
            }}>
            <span className="ht-label" style={{ margin: 0 }}>
              Sign in
            </span>
            <input
              className="ht-input"
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
            />
            <input
              className="ht-input"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
            />
            {authError && <p className="ht-error">{authError}</p>}
            <div className="ht-btn-row">
              <button type="submit" className="ht-btn primary" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="ht-btn ghost"
                onClick={() => {
                  setShowAuthForm(false);
                  setAuthError('');
                }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="ht-account">
            <div className="ht-account-text">
              <div className="ht-row-title">Sync your flashcards</div>
              <div className="ht-row-sub">
                4× more characters ·{' '}
                <button type="button" className="ht-link" onClick={() => openWeb('/auth')}>
                  Create account
                </button>
              </div>
            </div>
            <button type="button" className="ht-btn primary sm" onClick={() => setShowAuthForm(true)}>
              Sign in
            </button>
          </div>
        )}
      </section>

      <button type="button" className="ht-btn primary block" onClick={() => openWeb('/flashcards')}>
        <IconCards />
        Open flashcards
      </button>
    </div>
  );
}
