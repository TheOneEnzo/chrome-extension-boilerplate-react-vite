# Chrome Web Store privacy rejection fix

This repo was rejected for a Chrome Web Store User Data and Privacy issue:

- Reference ID: Purple Nickel
- Issue: the privacy policy does not include the required information about how user data is collected, handled, stored, and shared.

The code does handle user data. The privacy policy and Chrome Web Store Privacy practices form must match the behavior below.

## What the extension collects or handles

From the current codebase:

- Selected website text: the content script reads text selected by the user for translation.
- Surrounding website context: the content script can collect nearby sentence context and truncates it to 300 characters.
- Page URL: the content script sends `window.location.href` with the translation request.
- Translation data: original text, translated text, source/target language, date, context, and URL can be saved as flashcards.
- Account data: users can sign in with email and password through Supabase.
- Authentication data: Supabase access token, refresh token, expiry, user object, `rememberMe`, and user email are stored in `chrome.storage.local` when the user signs in with persistence.
- Subscription/usage data: subscription status/product ID/end date is checked through a Supabase Edge Function; monthly character usage is stored locally.
- Settings data: enabled/disabled state, target language, and per-translation character limit are stored locally.
- Imported/exported flashcards: flashcard JSON files are processed locally by the browser.

## Third parties

The policy should name all processors/services used:

- DeepL: receives the highlighted text and target language to provide translations.
- Supabase: handles authentication, stores synced flashcards for signed-in users, and runs the subscription status endpoint.
- Stripe: include this only if paid plans/subscriptions on `highlightranslator.com` are processed through Stripe.
- Chrome/Browser local storage: stores settings, session data, and usage counters on the user's device.

## Chrome Web Store dashboard data categories

The Privacy practices tab should likely disclose these categories:

- Personally identifiable information: email address and Supabase user ID.
- Authentication information: password is submitted to Supabase for login; access and refresh tokens are stored locally for persistent login.
- Website content: highlighted text and surrounding context.
- Web browsing activity: page URL/domain associated with a saved flashcard.
- User-generated content: saved/imported flashcards and translations.
- Financial/payment information: only if the extension or connected website handles paid subscriptions or subscription status tied to payments.

Do not state that the extension does not collect or handle user data.

## Privacy policy draft

Use this as a starting point for a public page, preferably `https://highlightranslator.com/privacy`. Update the contact email, effective date, and Stripe wording before publishing.

```text
Privacy Policy for Highlight Translator
Effective date: [DATE]

Highlight Translator helps users translate selected text in Chrome and save translations as flashcards.

Information we collect and use

When you select text on a webpage while the extension is enabled, the extension processes the selected text to provide a translation. The extension may also process a short amount of surrounding context, up to 300 characters, to create useful flashcards. The extension also processes the current page URL so saved flashcards can be associated with the website where the text was selected.

If you use the extension without signing in, selected text is sent to our translation provider to return a translation. We do not sync your flashcards to your account unless you sign in.

If you sign in, we collect your email address for account access. Your password is sent to Supabase for authentication and is not stored by the extension. When persistent login is enabled, the extension stores Supabase session information, including access token, refresh token, expiry time, and user information, in Chrome local storage on your device.

If you save or sync flashcards, we store the original selected text, translated text, language information, date, surrounding context, and page URL in Supabase so the flashcards can be shown in your account and grouped by website.

The extension stores settings such as enabled/disabled state, target language, character limit, and monthly character usage in Chrome local storage on your device.

How we share information

We share highlighted text and target language with DeepL to provide translations. We share account, session, subscription, and synced flashcard data with Supabase to provide authentication, storage, synchronization, and subscription status checks. If paid subscriptions are used, payment processing may be handled by Stripe; Stripe may process billing information under its own privacy policy. We do not sell user data and do not use user data for advertising.

Data storage and security

Data transmitted by the extension is sent over HTTPS. Local settings, usage counters, and session data are stored in Chrome local storage on the user's device. Synced flashcards and account data are stored in Supabase for signed-in users.

Retention and deletion

Local extension data can be removed by clearing extension data or uninstalling the extension. Signed-in users can delete flashcards from the product interface where available or contact us to request deletion of account-associated flashcard data. Account and subscription records may be retained as needed to provide the service, maintain security, comply with legal obligations, and resolve disputes.

Limited use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements. We only use user data to provide and improve Highlight Translator's user-facing translation, flashcard, account, and subscription features.

Contact

For privacy requests or questions, contact us at: [CONTACT EMAIL]
```

## Store listing and reviewer notes

Make sure the Chrome Web Store listing and in-product UI describe the user-facing reason for website data access:

```text
Highlight Translator translates text that the user highlights on webpages. When signed in, the extension can save the highlighted text, translation, surrounding context, language information, and page URL as flashcards so users can review translations later and group them by website.
```

Reviewer notes can include:

```text
The extension only processes webpage text after the user selects/highlights text. Highlighted text is sent to DeepL for translation. Signed-in users can sync flashcards through Supabase; saved flashcards include selected text, translation, context, language, date, and page URL. Auth is handled by Supabase. The privacy policy at [URL] discloses collection, use, storage, and sharing.
```

## Additional code issues found

These are not the stated Purple Nickel rejection, but should be fixed before resubmission:

- `pages/popup/src/Popup.tsx` sends `{ type: 'flashcards', action: 'list' }`; `chrome-extension/src/background/index.ts` now handles `list`, `delete`, and `clearAll` for authenticated Supabase flashcards.
- `chrome-extension/src/background/index.ts` imports `@supabase/supabase-js`; `chrome-extension/package.json` and `pnpm-lock.yaml` now list that dependency so clean installs can resolve it.
- `chrome-extension/manifest.ts` now declares specific `host_permissions` for DeepL and Supabase because Chrome documentation says extension service worker cross-origin requests should be covered by host permissions.
