# GourMerge — Secrets & Environment Management

How secrets are stored, injected, and rotated. Companion to [`RUNBOOK.md`](./RUNBOOK.md)
(which has the full runtime env-var table) and `.env.example` (the canonical list).

> **Golden rule:** secrets live only in (a) the local, git-ignored `.env`, (b) GitHub
> Actions repository secrets, and (c) the Netcup hosting env injection. They are
> **never** committed. `.env` and `.env.*` are git-ignored and `.htaccess` returns
> 403 for `/.env`.

---

## 1. Runtime secrets (injected on the Netcup host)

These are read by the running app (Nitro `runtimeConfig` / `process.env`). Inject them
via **Passenger env directives** in `.htaccess` for non-sensitive values, and via the
**Netcup hosting panel environment settings** for sensitive ones (so they are not stored
in a file under the webroot):

```apache
# .htaccess — non-sensitive values only
PassengerEnvVar NUXT_PUBLIC_APP_URL https://gourmerge.app
PassengerEnvVar LOG_LEVEL info
PassengerEnvVar REQUIRE_EMAIL_VERIFICATION true
```

| Variable                                              | Sensitive | Purpose                                          |
| ----------------------------------------------------- | --------- | ------------------------------------------------ |
| `DATABASE_URL`                                        | **Yes**   | MariaDB connection (`mysql://user:pass@host/db`) |
| `NUXT_SESSION_PASSWORD`                               | **Yes**   | ≥32-char key encrypting session cookies          |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | **Yes**   | Transactional email (verification, reset)        |
| `SMTP_FROM`                                           | No        | From-address for emails                          |
| `NUXT_PUBLIC_SENTRY_DSN`                              | No        | Sentry project DSN (public by design)            |
| `NUXT_PUBLIC_APP_URL`                                 | No        | Canonical URL for emails / SEO / OG / sitemap    |
| `LOG_LEVEL`                                           | No        | `debug` \| `info` \| `warn` \| `error`           |
| `REQUIRE_EMAIL_VERIFICATION`                          | No        | Gate publishing / GMRs on a verified email       |

The full annotated list with example values is in [`.env.example`](../.env.example).

---

## 2. GitHub Actions repository secrets (CI/CD)

Set under **Repo → Settings → Secrets and variables → Actions**. Consumed by
`.github/workflows/deploy.yml` (and optionally `ci.yml` for source maps).

| Secret                                                | Used by             | Purpose                                                                                                                                       |
| ----------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_HOST`                                         | `deploy.yml`        | Netcup SSH/SFTP host                                                                                                                          |
| `DEPLOY_USER`                                         | `deploy.yml`        | SSH user                                                                                                                                      |
| `DEPLOY_SSH_KEY`                                      | `deploy.yml`        | Private key for rsync + SSH (no passphrase, scoped key)                                                                                       |
| `DEPLOY_PATH`                                         | `deploy.yml`        | Absolute webroot path on the host                                                                                                             |
| `DEPLOY_DOMAIN`                                       | `deploy.yml`        | Domain for the post-deploy `/api/health` smoke test                                                                                           |
| `DATABASE_URL`                                        | `deploy.yml`        | Production DB URL for `drizzle-kit migrate` during deploy                                                                                     |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | `ci.yml` (optional) | Source-map upload at build time. Optional — build succeeds without them (no upload). Server-side Sentry capture does **not** depend on these. |

**Build-time-only Sentry vars.** `ci.yml` sets `NUXT_SENTRY_RELEASE` to `github.sha` on
the build step so deployed errors are attributable to a release. It is baked into the
artifact and cannot be injected on the host — its name does not map to the
`runtimeConfig.public.sentry.release` path (that would be `NUXT_PUBLIC_SENTRY_RELEASE`).

`GITHUB_TOKEN` is provided automatically and needs no configuration.

CI test values in `ci.yml` (`NUXT_SESSION_PASSWORD`, `DATABASE_URL` pointing at the
ephemeral `mariadb:11` service) are **throwaway test values**, not secrets.

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
2. **`DATABASE_URL` password** — change the MySQL user password in the Netcup panel,
   then update the secret/host env in lockstep, then restart Passenger
   (`touch tmp/restart.txt`).
3. **`SMTP_PASS`** — rotate in the Netcup mail panel, update host env.
4. **`DEPLOY_SSH_KEY`** — replace the key pair; update the GitHub secret and the host's
   `authorized_keys`.

> **Local dev note:** any credential that has ever lived in a developer's local `.env`
> (e.g. a local MariaDB password or a generated session secret) should be treated as
> dev-only and **must not** be reused for staging/production. Generate fresh values for
> each environment.

---

## 5. Audit checklist

- [ ] `git ls-files .env` returns nothing (untracked)
- [ ] `git log --all -- .env` is empty (never committed)
- [ ] `.env` and `.env.*` are in `.gitignore`
- [ ] `.htaccess` returns 403 for `/.env` and `/.git`
- [ ] No secret appears in `.env.example` (placeholders only)
- [ ] Production secrets injected via Netcup panel, not committed files
