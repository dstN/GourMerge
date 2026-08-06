# GourMerge — Secrets & Environment Management

How secrets are stored, injected, and rotated. Companion to [`RUNBOOK.md`](./RUNBOOK.md)
(which has the full runtime env-var table) and `.env.example` (the canonical list).

> **Golden rule:** secrets live only in (a) the local, git-ignored `.env`, (b) GitHub
> Actions secrets — deploy credentials as **environment** secrets on `production`, see
> §2 — and (c) Netcup's **Node.js → Custom environment variables**. They are
> **never** committed. `.env` and `.env.*` are git-ignored, and no `.env` is ever shipped:
> the deploy sends only `.output/` and `app.js`.

---

## 1. Runtime secrets (injected on the Netcup host)

These are read by the running app (Nitro `runtimeConfig` / `process.env`). All of them —
sensitive or not — go in one place:

**Websites & Domains → gourmerge.de → Node.js → Custom environment variables →
[specify]**, then **Restart App**.

Nothing goes in an `.htaccess`. There is none on the host, the same panel configures
Passenger itself, and an nginx proxy sits in front of Apache so `.htaccess` directives are
not reliably consulted. Keeping secrets out of a file under the webroot is also simply
safer.

| Variable                                              | Sensitive | Purpose                                        |
| ----------------------------------------------------- | --------- | ---------------------------------------------- |
| `DATABASE_URL`                                        | **Yes**   | MySQL connection (`mysql://user:pass@host/db`) |
| `NUXT_SESSION_PASSWORD`                               | **Yes**   | ≥32-char key encrypting session cookies        |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | **Yes**   | Transactional email (verification, reset)      |
| `SMTP_FROM`                                           | No        | From-address for emails                        |
| `NUXT_PUBLIC_SENTRY_DSN`                              | No        | Sentry project DSN (public by design)          |
| `NUXT_PUBLIC_APP_URL`                                 | No        | Canonical URL for emails / SEO / OG / sitemap  |
| `LOG_LEVEL`                                           | No        | `debug` \| `info` \| `warn` \| `error`         |
| `REQUIRE_EMAIL_VERIFICATION`                          | No        | Gate publishing / GMRs on a verified email     |

The full annotated list with example values is in [`.env.example`](../.env.example).

---

## 2. GitHub Actions secrets (CI/CD)

**Two different places, and the difference matters.** Repository secrets are readable by
any workflow on any branch — so putting the deploy credentials there would let a pushed
branch read them without ever passing the `production` approval gate. Environment
secrets are only available to a job that declares `environment: production`, which is
exactly and only the deploy job.

### 2a. Environment secrets — Settings → Environments → `production`

| Secret                | Value / purpose                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_HOST`         | `gourmerge.de` — SSH host of the webspace                                                                                                                                                                       |
| `DEPLOY_USER`         | The Plesk system user, shared across all domains on the subscription. Deliberately not written down here — it is half of an SSH credential pair and this repo is public                                         |
| `DEPLOY_SSH_PASSWORD` | System user's password. Netcup exposes no key auth, so this is password auth via sshpass                                                                                                                        |
| `DEPLOY_PATH`         | `/gourmerge.de` — the **application root**, not the webroot. The SSH shell is chrooted with the subscription root as `/`, so this is what `pwd` shows                                                           |
| `DEPLOY_DOMAIN`       | `gourmerge.de` — host only, for the post-deploy `/api/health` smoke test                                                                                                                                        |
| `DATABASE_URL`        | Production DB URL for `drizzle-kit migrate` (see §4.2 — also set in Plesk)                                                                                                                                      |
| `DEPLOY_SSH_HOSTKEY`  | _Optional but recommended._ Output of `ssh-keyscan -t ed25519 gourmerge.de`. Without it the deploy trusts the key it fetches at run time, and with password auth a MITM would collect the password in cleartext |

### 2b. Repository secrets — Settings → Secrets and variables → Actions

Only the Sentry trio, because `ci.yml` declares no environment. All three are optional:
the build succeeds without them, it just skips source-map upload. Server-side Sentry
capture does **not** depend on them.

`SENTRY_AUTH_TOKEN` · `SENTRY_ORG` · `SENTRY_PROJECT`

Use an **organization** token, not a personal one: Sentry → **Settings → Auth Tokens →
Create New Organization Token**. Its only scope, `org:ci`, is described as "Source Map
Upload, Release Creation, Code Mappings" — precisely what the build needs and nothing
more. A personal token would be tied to one human account (it dies with their access) and
the scopes on offer there — `project:read/write/admin` — are all broader than required.

Organization tokens encode their own org, so `SENTRY_ORG` is optional; `SENTRY_PROJECT`
defaults to `gourmerge` in `nuxt.config.ts`. Both are passed as `undefined` rather than
`''` when unset, because an empty string counts as a provided value and would override the
org the token already carries.

**Build-time-only Sentry vars.** `ci.yml` sets `NUXT_SENTRY_RELEASE` to `github.sha` on
the build step so deployed errors are attributable to a release. It is baked into the
artifact and cannot be injected on the host — its name does not map to the
`runtimeConfig.public.sentry.release` path (that would be `NUXT_PUBLIC_SENTRY_RELEASE`).

`GITHUB_TOKEN` is provided automatically and needs no configuration.

CI test values in `ci.yml` (`NUXT_SESSION_PASSWORD`, `DATABASE_URL` pointing at the
ephemeral `mysql:8.4` service) are **throwaway test values**, not secrets.

---

## 3. Generating values

```bash
# NUXT_SESSION_PASSWORD (32-byte hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 4. Rotation policy

Rotate immediately if a value is exposed (committed, pasted, logged, or shared), and
on a routine cadence for long-lived credentials:

1. **`NUXT_SESSION_PASSWORD`** — rotating invalidates all existing sessions (users
   re-login). Safe to rotate any time; do so if it ever leaked.
2. **`DATABASE_URL` password** — this value is **stored twice, deliberately**, and both
   copies must change together:

   | Copy                                       | Consumer                                     | When        |
   | ------------------------------------------ | -------------------------------------------- | ----------- |
   | Netcup → Node.js → custom env variables    | the running app (`server/database/index.ts`) | runtime     |
   | GitHub → Environments → production secrets | `npx drizzle-kit migrate` on the runner      | deploy time |

   The runner cannot read Plesk's env and the host cannot read GitHub's secrets, hence
   the duplication. One identical URL serves both: the database is a separate machine
   (a separate Netcup MySQL host from the webspace), so
   there is no internal shortcut like `localhost` — the app goes over the same public
   hostname the runner uses.

   Rotate: change the password in the Netcup panel → update **both** copies → restart
   Passenger (**Restart App**, or `touch tmp/restart.txt`). Forgetting one fails differently:

   - **Only Plesk updated** → the app keeps working; the next deploy fails at the
     migrate step. That step runs before the release is swapped, so nothing breaks.
   - **Only GitHub updated** → migrations apply, then the app cannot connect,
     `/api/health` returns 503, the smoke test fails and the deploy auto-rolls back.
     **The rollback will not fix this**: it swaps the code directory, not the host's
     environment variable. The site stays down until Plesk is corrected.

3. **`SMTP_PASS`** — rotate in the Netcup mail panel, update host env.
4. **`DEPLOY_SSH_PASSWORD`** — regenerate the system user's password in Plesk
   (Hosting Settings → System user's credentials → Generate), then update the
   `production` environment secret. Note this password also grants FTP and File Manager
   access to **every** domain on the subscription, so treat an exposure as affecting all
   of them, not just GourMerge.

> **Local dev note:** any credential that has ever lived in a developer's local `.env`
> (e.g. a local MySQL password or a generated session secret) should be treated as
> dev-only and **must not** be reused for staging/production. Generate fresh values for
> each environment.

---

## 5. Audit checklist

- [ ] `git ls-files .env` returns nothing (untracked)
- [ ] `git log --all -- .env` is empty (never committed)
- [ ] `.env` and `.env.*` are in `.gitignore`
- [ ] No `.env` on the host — the deploy ships only `.output/` and `app.js`
- [ ] No secret appears in `.env.example` (placeholders only)
- [ ] Production secrets injected via Netcup panel, not committed files
