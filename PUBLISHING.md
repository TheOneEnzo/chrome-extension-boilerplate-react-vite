# Publishing to the Chrome Web Store

Releases are uploaded and submitted for review through the **Chrome Web Store API v2**
using [`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli)
(pinned to `4.0.2` and run with `pnpm dlx`, so it isn't a project dependency).

- Store item: `gmllfaeopfdgjekgcgfahamnoogkedec` (Highlight Translator)
- Version source of truth: `version` in `chrome-extension/manifest.ts`
- Local: `pnpm publish:store`
- CI: `.github/workflows/publish-store.yml`, triggered by pushing a tag like `v2.7.1`

"Publish" here means **submit for review**. Google still reviews every version before it goes live.

---

## 1. One-time setup: create the API credentials

The CLI authenticates with an OAuth client and a refresh token. It doesn't support service accounts,
so don't create one. Do all of this signed in as the Google account that owns the item in the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole).

### 1a. Google Cloud project and API
1. Open <https://console.cloud.google.com/>, then create a project (for example `highlight-translator-publish`) or pick an existing one.
2. Go to **APIs & Services → Library**, search for **Chrome Web Store API**, and click **Enable**.

### 1b. OAuth consent screen
1. Go to **APIs & Services → OAuth consent screen** (also called "Google Auth Platform → Branding / Audience").
2. Set **User type** to **External**. Enter an app name (anything works) and your email as the support and developer contact.
3. You don't need to add any scopes here.
4. Under **Audience**, click **Publish app** so its status becomes **In production**.
   > ⚠️ If you leave it in **Testing**, Google expires the refresh token after **7 days**, and every later release fails with `invalid_grant`.
   > You don't need verification for your own use. You'll just see an "unverified app" warning when you authorize in step 1d.

### 1c. OAuth client
1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Set **Application type** to **Web application**.
3. Under **Authorized redirect URIs**, add `https://developers.google.com/oauthplayground`.
4. Click **Create**, then copy the **Client ID** and **Client secret**.

### 1d. Refresh token (OAuth Playground)
1. Open <https://developers.google.com/oauthplayground>.
2. Click the ⚙️ (top right), tick **Use your own OAuth credentials**, and paste the client ID and secret.
3. On the left, in **Input your own scopes**, enter `https://www.googleapis.com/auth/chromewebstore` and click **Authorize APIs**.
4. Sign in with the account that owns the store item. Click through the "unverified app" warning (**Advanced → Go to … (unsafe)**) and allow access.
5. Click **Exchange authorization code for tokens**, then copy the **Refresh token**.

### 1e. Publisher ID
In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), go to **Account** (Publisher → Settings) and copy the **Publisher ID**. If you belong to several publishers, switch to the one that owns Highlight Translator first.

---

## 2. One-time setup: GitHub secrets

In GitHub, open **TheOneEnzo/chrome-extension-boilerplate-react-vite → Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `CWS_CLIENT_ID` | OAuth client ID (1c) |
| `CWS_CLIENT_SECRET` | OAuth client secret (1c) |
| `CWS_REFRESH_TOKEN` | Refresh token (1d) |
| `CWS_PUBLISHER_ID` | Publisher ID (1e) |
| `CEB_API_KEY` | DeepL API key, the same one as in your local `.env` |
| `CEB_SUPABASE_KEY` | Supabase anon key, the same one as in your local `.env` |

The workflow runs in a GitHub **environment** named `chrome-web-store`. GitHub creates it automatically on the first run, and repository secrets work there.
If you want a manual approval click before anything is uploaded, go to **Settings → Environments → chrome-web-store → Required reviewers** and add yourself.
You can also store the secrets on that environment instead of the repository.

---

## 3. Cutting a release (CI, recommended)

Release from `main`, after the release changes are merged:

1. Bump `version` in `chrome-extension/manifest.ts`, for example `2.7.0` → `2.7.1`. The store rejects an upload whose version isn't higher than the live one.
2. Commit, then merge to `main`.
3. Tag that commit and push the tag:
   ```bash
   git checkout main && git pull
   git tag v2.7.1
   git push origin v2.7.1
   ```
4. Watch **Actions → Publish to Chrome Web Store**. The workflow:
   - fails straight away if the tag (`v2.7.1`) doesn't match the manifest version (`2.7.1`)
   - writes `.env` from the secrets, runs `pnpm zip`, and checks that the built `manifest.json` has the same version
   - attaches the zip as a workflow artifact
   - uploads it to the store and submits it for review
5. Track the review status in the Developer Dashboard.

**Manual run:** **Actions → Publish to Chrome Web Store → Run workflow**. Pick a tag or branch, and untick **Submit for review** if you only want to upload a draft.
When you run it on a branch there's no tag to compare, but the build's version is still checked.

If the tag check fails, delete the tag (`git push origin :refs/tags/v2.7.1 && git tag -d v2.7.1`), fix the version, and tag again.

## 4. Publishing from your machine

1. Make sure `.env` has `CEB_API_KEY` and `CEB_SUPABASE_KEY` filled in.
2. Create `.env.store` in the repo root. It's git-ignored by the `**/.env.*` rule, so it's never committed:
   ```bash
   CWS_CLIENT_ID=...
   CWS_CLIENT_SECRET=...
   CWS_REFRESH_TOKEN=...
   CWS_PUBLISHER_ID=...
   ```
3. Run one of these:
   ```bash
   pnpm publish:store                    # build, upload, submit for review
   pnpm publish:store --upload-only      # build and upload a draft only
   pnpm publish:store --tag v2.7.1       # also check a tag against the manifest
   pnpm publish:store --skip-build       # reuse the newest zip in dist-zip/
   pnpm release:check-version v2.7.1     # just run the version guard
   ```

## Troubleshooting

- **`invalid_grant`**: the refresh token expired or was revoked. Usually the consent screen is still in Testing (see 1b). Make a new token (1d) and update `CWS_REFRESH_TOKEN`.
- **Upload rejected because the version must be greater**: bump `version` in `manifest.ts`.
- **`ITEM_PENDING_REVIEW` / cannot publish**: a previous version is still in review. Wait for it, or cancel it in the dashboard, then run again. With `--upload-only` the draft is kept.
- **Translation broken in the published build**: the `CEB_API_KEY` secret is missing or wrong. The workflow fails if it's empty, but it can't check that the key is valid.
