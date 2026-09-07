# NestWise production deployment

Repository preparation, September 7, 2026. No services have been created, no credentials supplied, and no live deployment verified. Complete the release gates below before collecting real family data. The product milestone remains valid; this guide supersedes its deployment/email configuration gaps, not its device-testing limitations.

## Architecture and accounts

Use **Vercel for the static Expo web export**, **one always-running Render Node web service for Fastify**, and **managed Render PostgreSQL in the same region**. Native clients call the same HTTPS API. PostgreSQL remains the source of truth and provides LISTEN/NOTIFY; no Redis or external realtime vendor is required for this topology.

Vercel now supports WebSockets in beta, but connections still end at function duration limits. Moving this existing listening process and its dedicated PostgreSQL subscription into function lifecycles adds deployment and connection-management changes without a product benefit. Render preserves the architecture and does not impose a fixed WebSocket timeout. Connections still reconnect after deployments. Sources: [Vercel WebSockets](https://vercel.com/docs/functions/websockets), [Render WebSockets](https://render.com/docs/websocket).

Create or use these accounts yourself:

1. GitHub with access to `MotherTheresa64/NestWise`; production source is `main`.
2. Vercel, connected to that repository. Use a plan permitted for your intended usage.
3. Render, connected to the repository, with billing for an always-on web service and persistent database. The Blueprint proposes Starter API and Basic 256 MB database as a starting configuration, not a capacity guarantee. Review current plans, region and backup features before applying. This production intent requires paid pre-deploy migration support; free sleeping/expiring services are unsuitable.
4. Resend plus a domain you control for verification/recovery email. A verified sending domain and restricted sending API key are required. No email provider account is needed to run locally with mail explicitly disabled.
5. DNS access for optional `app.your-domain` and `api.your-domain`. Provider subdomains also work. Native store distribution separately requires Apple/Google developer accounts and signing/device QA; bundle exports are not store builds.

## Environment variables: keep the services separate

Never put `DATABASE_URL`, mail keys, private keys, or test credentials in Vercel or any `EXPO_PUBLIC_*` variable. Expo embeds public variables in downloadable bundles. Changing them requires rebuilding, including native releases. Root `.env` is only loaded by local API scripts; Expo reads `apps/app/.env` or the shell. Platform production commands do not load a local `.env`.

### Vercel build and native release build

| Variable | Production value | Preview/staging value |
| --- | --- | --- |
| `DEPLOY_ENV` | `production` | `staging` |
| `EXPO_PUBLIC_API_URL` | `https://api.your-domain` or the API's Render HTTPS origin | Separate staging API HTTPS origin |
| `EXPO_PUBLIC_WEB_URL` | `https://app.your-domain` or stable Vercel production origin | Stable staging web origin |

Use exact origins without paths, credentials, query strings or trailing slash. These are examples, not existing NestWise domains. Node version in Vercel settings: **24.x** (locally verified 24.19.0). Leave framework preset **Other** and root directory at the **repository root**, not `apps/app`.

`vercel.json` supplies `npm ci`, the deployment preflight, web export, release scan, `apps/app/dist`, SPA rewrites and headers. Exports clear Metro's cache: testing found that changing public variables without clearing could retain a previous API URL. HTTP→WS and HTTPS→WSS URL derivation stays in the client; there is no separate WebSocket variable.

### Render API environment

| Variable | Value / purpose |
| --- | --- |
| `NODE_VERSION` | `24.19.0` in the Blueprint |
| `NODE_ENV` | `production` for both production and hosted staging |
| `HOST` | `0.0.0.0` |
| `PORT` | Let Render supply it; the app defaults to 3001 only when absent |
| `CORS_ORIGIN` | Exact web origin, e.g. `https://app.your-domain`; comma-separated explicit additional trusted origins only |
| `TRUST_PROXY_HOPS` | `1` for the direct Render proxy topology; `0` for direct local connections |
| `DATABASE_URL` | Secret internal connection string, wired from `nestwise-db` in Blueprint |
| `DATABASE_SSL_MODE` | `disable` **only for the selected private Render internal connection**; `verify-full` for external TLS connections |
| `DATABASE_PRIVATE_NETWORK` | `true` to explicitly acknowledge private-network unencrypted DB transport; otherwise false/absent |
| `DATABASE_POOL_MAX` | `10`, including one long-lived LISTEN connection; allowed 2–50 |
| `DATABASE_CA_CERT` | Optional trusted PEM CA for `verify-full`; absent for system-trusted certificates. Literal `\n` escapes accepted |
| `EMAIL_PROVIDER` | `disabled` during infrastructure setup; change to `resend` before public recovery is required |
| `RESEND_API_KEY` | Resend sending key, secret, required when provider is `resend` |
| `EMAIL_FROM` | Verified sender, e.g. `NestWise <care@your-domain>`, required for Resend |
| `APP_WEB_URL` | Stable trusted HTTPS web origin used in security emails, required for Resend |

Do not set `TEST_DATABASE_URL`, development seed credentials or public Expo variables on the API. There is no JWT signing secret: sessions use random opaque tokens with only hashes stored in PostgreSQL. There are no auth cookies to configure; clients send Bearer headers.

The initial Blueprint includes disabled email and asks for CORS/web origins. Add the three Resend variables in the Render Environment page, and change `EMAIL_PROVIDER` in both `render.yaml` and the service to `resend` when ready. Do not let a later Blueprint sync revert it to disabled. Alternatively keep the key/from fields in the Blueprint using `sync: false`, never literal secret values.

### Development versus staging

`.env.example` contains safe development placeholders and every application environment variable. Replace the local database password with your local database's password; the Compose sample has its own local-only credentials. For an exported local web build, explicitly set `EXPO_PUBLIC_API_URL=http://localhost:3001` and `EXPO_PUBLIC_WEB_URL=http://localhost:8081` in the build shell. Development Metro retains its localhost fallback; release bundles with missing configuration fail closed.

For staging, create a separate Render API/database and a separate stable Vercel staging project/domain. Use the same commands and `NODE_ENV=production`, with staging public URLs and its own database/mail key. Give the staging service its own explicit CORS origin. Set Vercel **Preview** variables to staging values. Never connect PR previews to production family data or allow `*.vercel.app` in production CORS. Untrusted fork previews must not receive secrets; missing preview configuration intentionally fails the build. A stable staging domain avoids adding every random preview URL to the allowlist.

## First deployment, step by step

1. Review this change locally, run the verification below, then commit and push the reviewed repository changes to GitHub `main`. No push is performed by this preparation. Confirm the GitHub tree contains `render.yaml`, `vercel.json`, and the new migration/mail/config files.
2. Decide the API/database region **before creating resources**. The template uses Oregon for both; change both together if another region is appropriate for your users and data policy. Database identity/region choices can require replacement later.
3. Create a Vercel project importing the GitHub repository. Root directory: repository root; framework: Other; Node: 24.x; production branch: `main`. Reserve its stable domain. Defer deployment until the API URL is known, or accept an initial missing-variable build failure.
4. In Render choose **New → Blueprint**, connect the repository and `main`, and select `render.yaml`. Review the paid service/database plans before applying. Enter `CORS_ORIGIN` and `APP_WEB_URL` using the stable web origin. Optional CLI validation after installing/authenticating Render CLI: `render blueprints validate`. The template was locally validated against Render's published JSON schema; authenticated provider validation remains a manual step.
5. Apply only after reviewing billing. The API build runs `npm ci --include=dev && npm run build:api`. Its pre-deploy step runs `npm run db:migrate:production -w @nestwise/api`. Start is `npm run start -w @nestwise/api`. The API does not run migrations or seed on ordinary process restart.
6. Check the migration deploy log says `Database schema ready`, then request `https://YOUR-API/ready` and `/live`. Both should return 200. `/ready` checks the users table/database and the change listener; `/live` only confirms the HTTP process. `/health` remains for compatibility. Do not switch real traffic to an unready service.
7. Put the API HTTPS origin into Vercel's Production `EXPO_PUBLIC_API_URL`, put the stable web origin into `EXPO_PUBLIC_WEB_URL`, and set `DEPLOY_ENV=production`. Deploy `main`. No API function, API rewrite or database integration belongs in Vercel. The frontend connects directly to the API.
8. Open `/`, `/children`, `/reports`, `/join` and `/account` directly and refresh each. JS/assets should load with correct MIME types; HTML is not cached. Open developer tools and confirm HTTPS API calls and a `wss://YOUR-API/realtime` upgrade with status 101. Test a second caregiver browser and an offline/reconnect cycle using **test data in staging first**.
9. Configure Resend as below. Verify actual email arrival, one-time code use, expiration, invalid-code handling and session revocation on password reset in staging.
10. Complete backup/restore rehearsal, proxy checks and security gates below before collecting real family data. The first real user registers normally, creates a household and adds children. There is no default admin password and no automatic fictional household.

Render pre-deploy commands are a paid-service feature; failed pre-deploy commands prevent the new version being deployed. [Deployment lifecycle](https://render.com/docs/deploys). Do not move migrations into the frontend build.

## Database transport, pool and migrations

The Blueprint uses the private internal connection, same region, and disables external DB access (`ipAllowList: []`). This mode deliberately does not claim TLS inside Render's private network. Render documents encrypted storage/backups and TLS on external connections. If your policy requires end-to-end DB TLS, use the full external hostname, `DATABASE_SSL_MODE=verify-full`, and narrowly allow the API egress addresses; validate this arrangement before release. Never use `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0` or an IP in place of the certificate hostname. SSL parameters in `DATABASE_URL` are rejected to prevent them overriding the explicit TLS configuration. [Render PostgreSQL connections and encryption](https://render.com/docs/postgresql-creating-connecting).

Each API instance uses at most 10 DB connections by default; one is reserved for LISTEN. Budget for old+new instances during deployment, the migration process, backups and administrative access. Connection acquisition times out at 5 seconds, idle pool connections at 30 seconds, ordinary statements at 30 seconds. Do not put LISTEN behind a transaction-mode pooler. The initial single instance has in-memory IP rate limits; shared rate limiting/edge abuse controls must precede horizontal scaling.

`schema.sql` is the inherited, non-seeding baseline. Migration runs use a transaction, advisory lock, 10-second DDL lock timeout and 5-minute statement timeout. A ledger records its SHA-256 after LF normalization. Existing installations apply the idempotent baseline once to establish the ledger; subsequent runs skip it. A changed checksum fails instead of silently replaying modified SQL. No table truncation, reset or sample insertion is part of deployment. The existing data and repeat-run paths are tested.

For future migrations:

1. Add a new numbered SQL file next to `schema.sql`; append its filename to the ordered list in `src/migrate.ts`, and copy it to `dist` in `tsup.config.ts`.
2. Do not edit an already applied SQL file or erase the ledger to force it through.
3. Prefer additive, backward-compatible schema changes because the old API continues serving while pre-deploy runs. Backfill and later removal should be separate reviewed releases. Large backfills need a dedicated procedure rather than raising every timeout.
4. Test against a restored staging copy and run twice. Take/check a recoverable backup, then deploy API before any frontend that requires it.

Manual migration, only from the intended Render environment/shell after a successful build: `npm run db:migrate:production -w @nestwise/api`. The command consumes that service's environment. Never paste a production connection string into a committed command or use the fictional seeder on hosted environments. Never run integration/E2E against production; they create test users and schemas.

## Email setup and behavior

Create a Resend sending domain and add its required DNS verification/SPF/DKIM records at your DNS provider. Configure DMARC appropriate to your domain after verifying legitimate senders. Create a sending-scoped key, store it only as Render `RESEND_API_KEY`, and set `EMAIL_FROM`, `APP_WEB_URL`, `EMAIL_PROVIDER=resend`. Restart/deploy the API. These variables enable the existing `AccountMail` interface without a dependency or external model key. [Resend send API](https://resend.com/docs/api-reference/emails/send-email).

Mail contains only recipient and account-security instructions, never care/child records. The code appears as text to paste into `/account?mode=reset` or `?mode=verify`; the code is not in the generated URL or referrer/history. Codes expire after 30 minutes. Provider calls time out after 10 seconds, use an idempotency key, and require a successful response with an acceptance ID. Acceptance is not a guarantee of inbox delivery. Monitor Resend failures/bounces manually; no retry worker, webhook/bounce pipeline or durable email outbox exists yet. Failed delivery deletes the issued token and reports an error, never fake success. A network timeout after provider acceptance can produce an unusable emailed code; request a fresh code.

Verify the flow with an address you control and monitor quotas. The app can run with provider disabled, but **public password recovery is then unavailable**. Email verification remains user-initiated and is not a prerequisite for registration or household invitations; do not represent all account email addresses as verified. Existing reset endpoints avoid disclosing account existence in normal responses; timing and provider-error differences can still leak existence and require further hardening for high-abuse deployments.

## Custom domains, WebSockets and security headers

Add the web domain in Vercel Settings → Domains and API domain in Render Settings → Custom Domains. Follow each provider's actual DNS instructions, wait for certificates, then update all origins and rebuild frontend/native clients. Keep old origins explicitly during a planned client transition if needed, then remove them. Never send real tokens over HTTP. Avoid adding another proxy until its forwarded-header chain has been tested; `TRUST_PROXY_HOPS=1` assumes a single trusted edge that supplies the nearest client address. Verify spoofed `X-Forwarded-For` does not evade rate limiting on the real service. Do not trust arbitrary hop counts merely to make rate limits work.

Connect directly to `/realtime` with WSS, without a Vercel rewrite. Browser origins use the same exact allowlist as CORS; native clients without Origin still must authenticate. Authentication is the first frame, within 5 seconds, never a token in a WebSocket URL. Messages are capped at 2 KB, connections have an admission ceiling of 500 per process, and access is checked before every invalidation/25-second heartbeat. Push payloads contain no care records. Reconnect uses the existing versioned incremental API and offline queue; no sticky-session requirement. SIGTERM closes subscriptions and the DB pool with a 25-second application shutdown budget inside Render's 30-second grace period.

Web responses have no-store caching, no-referrer, frame denial, nosniff, HSTS and a CSP. API responses also use no-store and Helmet. The template's CSP allows HTTPS/WSS connection destinations because actual API domains are not known at repository preparation time; narrow `connect-src` to the exact API HTTPS/WSS origins after domain selection. Do not add `unsafe-eval` or external analytics by default. RN web requires inline styles. Local E2E mirrors the headers, with only the local API added to connect-src. Inspect hosted response headers and PDF printing after deployment; local tests do not verify Vercel's edge behavior. Consider immutable asset caching only after preserving old hashed asset availability through rollouts; conservative no-store avoids stale HTML/session response caching now.

## Subsequent releases and rollback

Keep Render automatic deployment off initially. Run all checks in staging, review the exact Git commit, back up, deploy that `main` commit to the API, wait for `/ready`, then promote/deploy the matching Vercel frontend. Vercel may automatically deploy main by default; configure its production promotion workflow so a frontend requiring new API behavior is not promoted prematurely. Native older versions can persist for months: preserve API compatibility.

Rollback the Vercel deployment through its deployment dashboard. Roll back the API to a previous compatible commit in Render. **Neither action rolls back PostgreSQL.** Verify the chosen API understands the current schema. Prefer a corrective forward migration. For irreversible data damage, stop writes, restore to a new isolated DB, check records/erasure obligations and then change the API connection string; explicitly reconcile lost post-backup writes and queued client mutations before reopening. Never casually restore over the live database or discard caregiver offline queues.

## Backups, monitoring and incident response

Before launch select a paid DB plan with backup/PITR retention meeting your requirements, inspect its actual settings and document RPO/RTO. A suggested starting policy to review is daily encrypted backups with at least 7 days recovery, a pre-migration recovery point, and a monthly restore drill into an isolated database. This is a recommendation, not an enabled service guarantee. Record the date/result of a successful restore. Keep access restricted and backups in the appropriate region; maintain an explicit retention/deletion policy because deleting a household cannot erase historical backups immediately. Avoid plaintext database dumps on developer laptops.

Monitor `/ready`, 5xx/503/429 rates, WebSocket reconnects, process memory, DB disk/connections and Resend failures/quotas. Configure alerts to an operator in the provider dashboards. API request logging is disabled to avoid recording URLs, tokens, children and export bodies; handled server errors log only request ID and status, and startup/migration errors are deliberately generic. Investigate through health/config checks, not by enabling raw payload logging. Provider edge logs, PostgreSQL slow-query/error logs and email-provider logs need their own retention/access review; the app cannot redact those for you. Invitation links still contain bearer invitation codes in a query string: do not log full frontend query strings, add third-party tracking to join/account pages or paste links in public tickets.

If a token/key is exposed, revoke affected sessions/invitations or rotate the provider/database credential, update platform secrets and restart as appropriate. Never rotate by committing a replacement secret. Browser care cache remains readable to same-origin scripts; do not use a shared/untrusted device. Native encrypted cache keys remain device-bound and require restore/device QA. Exports and PDFs are sensitive files under the caregiver's control, with no remote revocation. Native PDF cleanup occurs after sharing but cannot guarantee deletion following a crash.

## Troubleshooting

| Symptom | Check / safe action |
| --- | --- |
| Vercel preflight fails | Correct production/preview variable scope, HTTPS origins, no trailing slash; rebuild |
| Wrong API after changing variables | Confirm public variable values, ensure `--clear` export is used, deploy a newly built bundle |
| Direct-route blank page | Root/output settings, index rewrite, asset MIME types and browser CSP console; do not serve API from Vercel |
| API initialization failure | Required variables, exact CORS origins, TLS mode, mail configuration; messages intentionally omit secret values |
| Readiness 503 | DB accessible, baseline migrated, free pool slots, LISTEN active; inspect Render DB health |
| Migration fails | Verify database target and ledger/checksum, DDL lock contention; do not delete ledger or reset DB |
| CORS/WS forbidden | Actual browser Origin must match exact CORS_ORIGIN; update the intended environment only |
| WS reconnects on deploy | Expected; incremental changes should catch up. 4403 means session/membership ended; 503 can mean capacity |
| Excessive 429 | Check real proxy/client IP behavior and client retries; do not disable auth rate limiting |
| No email | Provider enabled, verified domain, key permissions, acceptance/bounce/limits; disabled provider does not send |
| TLS certificate failure | Use full database hostname/trusted CA and verify-full; do not disable verification on a public connection |
| Offline edits held | Use the existing conflict/held-edit review and local backup; never clear storage as routine troubleshooting |

## Verification and remaining release gates

Locally run on Node 24.19 / PostgreSQL 18:

- `npm ci`.
- `npm run db:migrate` and built `npm run db:migrate:production -w @nestwise/api` against the isolated local database.
- `npm run typecheck`, `npm run lint`, and `npm test` with `TEST_DATABASE_URL`: 83 tests across 13 files.
- `npm run build:api`, `npm run build:web` with explicit local public variables; HTTPS sample release export separately and release-output scans.
- `npm run test:e2e`: all five existing browser journeys pass with the deployment headers mirrored locally, including offline queue/conflicts, realtime, privacy and PDF report routes.
- From `apps/app`: `npx expo-doctor` (20/20), and iOS/Android `expo export` with HTTPS sample public variables. These are Hermes bundle exports, not installed/signed device builds.
- Render Blueprint validates against the published JSON schema. Actual account-side Blueprint application, paid plan availability and provisioning remain unverified.
- Vercel's used configuration fields validate against the published schema. Its full schema currently mixes draft versions in unused function/service sections, so those unused sections were excluded for local validation; actual Vercel build/deployment validation remains outstanding.
- Production-mode API startup, readiness/CORS and the SIGTERM handler were exercised with platform-style environment variables and no env-file flag. This checks the handler locally; Render's signal/proxy lifecycle still requires a hosted test.
- Focused tracked-file credential patterns returned zero hits. Web and both native exports pass the release marker scan. Two generic `localhost` strings remain in framework URL parsing and a secure-origin error message; the application API is the supplied HTTPS origin, with no localhost API dependency in the release.

For any release, run `node scripts/check-deployment-env.mjs` with the intended public environment, then export with `--clear`, then `node scripts/check-release-output.mjs PATH_TO_EXPORT`. The scan detects known development/server-only markers and any supplied database/mail secret. It is not a complete secret scanner. `.env` and generated artifacts stay ignored; no deployment credential is committed.

Do not claim production readiness until these outstanding gates are addressed: actual provider/DNS/TLS/forwarded-IP tests, inbox delivery, staging migration and restore rehearsal, real-device secure storage/notifications/PDF tests, operational alert/retention setup, and documented security risk acceptance or remediation. See [focused security review](production-security-review.md). `npm audit` currently reports **18 moderate, zero high/critical** findings; they are not fixed by this milestone.
