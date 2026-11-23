# NestWise architecture

Status: working development milestone. No production deployment exists (`render.yaml` and `vercel.json` are templates; see [production-deployment.md](production-deployment.md)). The milestone docs in this folder record history and their test counts are point-in-time; this file describes the code as of `main`.

## Overview

npm workspaces monorepo (`package.json`):

| Path | Role |
| --- | --- |
| `apps/api` | Fastify 5 + `pg` REST API, WebSocket change signal, SQL migrations (`src/*.sql`) |
| `apps/app` | Expo SDK 55 / React Native 0.83 / Expo Router app; web build via react-native-web, plus iOS/Android bundles |
| `packages/shared` | Zod 3 contracts (events, children, reminders, mutations, auth), role helpers, routine estimates, quick-phrase parser |
| `e2e` | Playwright browser journeys (6 spec files, 8 tests) |

The API and the app import the same Zod schemas from `@nestwise/shared`, so a request body is validated by identical rules on the client and the server.

## Technology choices

- **Fastify + raw SQL (`pg`)**: small surface, schema-per-route validation with Zod, explicit transactions. Trade-off: SQL is inline in `src/app.ts`, no ORM or query builder, no type-checked queries.
- **PostgreSQL**: needed for row locks (`FOR UPDATE`), transactional triggers, `LISTEN/NOTIFY` and `jsonb`. CI and Compose use `postgres:17-alpine`; the Render template provisions major version 18.
- **JSONB documents** for children, events, reminders and foods (`data jsonb`), with relational columns only for keys, versions and ownership. This keeps evolving care-event fields (see `rich-care` schemas) out of migrations. Trade-off: no column-level constraints on care data; integrity lives in Zod.
- **Expo / React Native**: one codebase for web, iOS and Android. Native capabilities (notifications, SecureStore, print/share) are not verified on a device (docs say so).
- **Own session auth** (scrypt + opaque bearer tokens) rather than a hosted identity provider. It keeps the data model self-contained for a milestone, at the cost of owning password reset, verification, rate limits and session management (see Limitations).

## Authentication and authorization

- Registration/login (`src/app.ts`): password 12 to 128 chars, hashed with scrypt (`salt:hex`). Login always runs scrypt, with a dummy hash when the user does not exist, and compares with `timingSafeEqual`.
- Sessions: 32 random bytes returned once as a hex token; only its SHA-256 is stored in `sessions` (30-day expiry). `userFor()` requires `Authorization: Bearer <64 hex>` and joins `sessions` to `users`. Users can list and revoke other sessions; password reset deletes all of a user's sessions.
- Roles: `members.role` is `owner | admin | caregiver | viewer`. `access(request, mode)` loads the caller's role for the household in the URL; non-members get 404 (not 403) so household ids are not probeable. `canWrite` is everything but viewer; `canManage` is owner and admin (`packages/shared/src/index.ts`).
- Owner-only actions: role changes, member removal, ownership transfer (typed `TRANSFER OWNERSHIP`), household deletion, child erasure. Only an owner can invite administrators. An owner must transfer ownership before leaving.
- Invitations: random 256-bit token (hash stored), bound to an email and role, 7-day expiry, single use (`DELETE ... RETURNING` inside the accept transaction). Acceptance additionally requires the accepting user's `verified_at` to be set, checked inside the same transaction (`POST /invitations/accept`), because registration does not prove mailbox ownership. Consequence: invitations cannot be accepted on a deployment with no mail provider.
- Account mail (verify/reset) uses one-use, purpose-bound, 30-minute tokens (`src/account.ts`), delivered only through a configured `AccountMail` adapter (`src/mail.ts`, Resend). With `EMAIL_PROVIDER=disabled` (the default in `render.yaml`) those endpoints return 503.

## Database design

`src/schema.sql` (frozen as the first migration), `002-foods.sql`, `003-lookup-indexes.sql`.

- Tenancy: `households` own everything via `household_id` with `ON DELETE CASCADE`. `members(household_id, user_id)` is the join.
- `events(id, household_id, data, version, updated_at)`: care logs. `version` is the optimistic-concurrency counter. Soft delete lives inside `data.deletedAt`.
- `mutation_receipts(household_id, mutation_id)` PK: idempotency store holding the original input and the result.
- `changes(household_id, revision, kind, entity_id, record)`: append-only change feed, populated by the `record_household_change()` trigger on `events`, `children`, `reminders`, `members` and `foods`.
- `households.revision`: per-household counter bumped inside that trigger.
- `erased_events`, `erased_foods`: erasure markers so a stale offline mutation cannot resurrect deleted care.
- `audit`: write and membership actions; `user_id` is `ON DELETE SET NULL` so deleting an account anonymizes rather than destroys history.
- `003-lookup-indexes.sql` adds indexes for `members(user_id)`, `sessions(user_id)`, `reminders(household_id)`, `invitations(household_id)`.
- Migrations (`src/migrate.ts`): one transaction under `pg_advisory_xact_lock`, a `schema_migrations` table with SHA-256 checksums, and a hard failure if an applied file changed. Append new files; never edit applied ones.

## Data flow: offline sync and mutation log

1. A caregiver logs care in the app (`apps/app/src/lib/store.tsx`). The event is appended to a durable per-account, per-household queue of `SyncMutation`s (`mutationId`, `operation`, `eventId`, `baseVersion`, optional `event`) in local storage, and the UI shows `optimisticEvents()` (`lib/queue.ts`): server state with queued mutations replayed over it.
2. `sync()` sends queued mutations one at a time to `POST /households/:id/sync`. The server opens a transaction and takes `SELECT ... FROM households ... FOR UPDATE`, which serializes all writes to the household, including retries carrying the same `mutationId`.
3. Inside the lock it rechecks the caller's role and that the session is still valid, then per mutation: rejects erased events (409); returns the stored receipt if the `mutationId` was already applied (and 409s if the same id arrives with different content or from another user); otherwise applies it. A create for an existing id, a stale `baseVersion`, or an edit to a deleted event produces `status: "conflict"` with the server's copy instead of overwriting. Each applied write inserts an `audit` row and a receipt. A failure rolls the whole batch back.
4. The client removes the mutation from the queue, stores conflicts separately, and blocks further edits to a conflicted event until the user resolves it in Settings.
5. Event inserts/updates fire the change-feed trigger, which allocates the next household revision by updating the household row (so revisions commit in order; the SQL comment notes a plain sequence could expose a later revision before an earlier transaction commits) and calls `pg_notify`.
6. Realtime (`src/realtime.ts`): the client opens `/realtime`, sends one first frame `{token, householdId}` (never in the URL), and gets `ready`. Each API process holds one dedicated `LISTEN nestwise_changes` connection. A notification carries only the household id; the server sends `{type:"changed"}` after rechecking the session and membership. No care data crosses the socket. A 25 s heartbeat revalidates access; limits: 5 s to authenticate, 2 KB frames, 500 connections, exact Origin check.
7. On `changed`/`ready`/foreground the client calls `GET /households/:id/changes?after=<revision>` (pages of 200 with `hasMore`) and merges with `applyChanges()`, ignoring revisions it already has. The full `/snapshot` (REPEATABLE READ, read-only) is only the bootstrap. Reconnect uses exponential backoff with jitter and a 60 s watchdog.
8. `lib/transport.ts` handles hosting cold starts: it only retries the safe `GET /ready` while the server wakes, and never retries a write whose response is uncertain (the queued mutation stays and its idempotent replay is safe).

Children, reminders and foods use simpler versioned updates (`baseVersion` compare in the `UPDATE ... WHERE version=$n`), not the receipt log. Food edits have their own queue and `/foods/sync`.

## Key business logic

- **Care events**: categories with typed fields (feeding, sleep, diaper, medicine, temperature, growth, symptoms and others) validated in `packages/shared/src/index.ts`; sibling events can reference several children (`childIds`), and every child id is checked against the household (`checkChildren`).
- **Reminders**: one-time or repeating (`repeatMinutes`). Completing a repeating reminder inserts the next occurrence at the first future multiple of the interval, in the same transaction, under `FOR UPDATE` so a retry does not duplicate it. Snooze is versioned and rejects stale or past targets. Repeat is elapsed time, not wall-clock across DST. Creating a reminder locks the household first, the same lock child erasure takes, so a reminder cannot be attached to a child being erased.
- **Invitations / membership**: see above. Membership changes run under the household lock and are audited; each change fires the feed trigger, so a removed caregiver's socket is closed on the next signal.
- **Routine Intelligence** (`packages/shared/src/intelligence.ts`): recency-weighted intervals from recorded naps/feeds; abstains with insufficient or stale data; confidence reflects sample count and variation, not a calibrated probability. It is a heuristic, not a validated model.
- **Quick phrases** (`natural.ts`): a documented local grammar; ambiguous input returns `null` and the user confirms an editable draft.
- **Privacy**: authorized JSON exports (no secrets), typed-confirmation deletion of households and children, child erasure that removes events, foods, reminders, receipts and change-feed payloads for that child and writes erasure markers, and account deletion that anonymizes attribution to "Former caregiver" (`src/privacy.ts`, `src/account.ts`).
- **Native cache encryption** (`apps/app/src/lib/cache-cipher.ts`, `care-storage.ts`): XChaCha20-Poly1305 via `@noble/ciphers`, fresh nonce per write, storage key as associated data (blocks cross-record substitution), per-account key in Expo SecureStore. Missing or corrupt keys fail visibly instead of overwriting data. Web storage is not encrypted.

## Security decisions

- Parameterized SQL everywhere; Zod `.strict()` on request bodies; 256 KB body limit; 30 s request timeout.
- Helmet, `Cache-Control: no-store` on every API response, per-route rate limits (global 200/min; login/register 10/min; reset/verification tighter), CORS from an exact-origin allowlist that fails closed and requires HTTPS in production, explicit proxy-hop trust (`TRUST_PROXY_HOPS`), DB TLS `verify-full` by default with an explicit private-network opt-out (`src/config.ts`).
- Static hosting headers including CSP, HSTS and frame denial are in `vercel.json`.
- Production errors return a generic 500 message; request logging is disabled to avoid logging tokens.
- Hardening commits: `1ac9f82` makes `mutationSchema` reject a mutation whose `event.id` differs from its `eventId` (the erasure and existence checks run on `eventId`, the write uses `event.id`) and makes reminder creation take the household lock; `59a7417` requires a verified email to accept an invitation, inside the transaction.
- Independent review status: the repo's [security review](production-security-review.md) is a self-review, not a penetration test.

## Testing strategy

- `npm test` runs Vitest across all workspaces: **120 tests in 17 files**. 99 need no database. 21 are PostgreSQL integration tests wrapped in `describe.skipIf(!TEST_DATABASE_URL)`; each suite creates and drops its own random schema. Without `TEST_DATABASE_URL` those 21 show as skipped, so a green local run without a database does not verify the API.
- Unit: shared schemas and estimates (`packages/shared/src/*.test.ts`), queue projection and change merging (`queue.test.ts`, `live.test.ts`), cache cipher, transport cold-start behavior, report model, deployment config fail-closed checks.
- Integration (`apps/api/src/*.test.ts`): isolation, idempotent retries, stale edits, batch rollback, invitation binding and verified-email gating, viewer read-only, change pagination, two API instances for WebSocket fan-out, ownership transfer, password reset tokens, privacy export/erasure, migration checksums.
- E2E: `npm run test:e2e` runs 8 Playwright tests (not part of CI) against the built API and exported web bundle.

## CI and deployment

- `.github/workflows/ci.yml` (push to `main`, PRs, manual): one job with a `postgres:17-alpine` service, Node 24.19.0, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` with `TEST_DATABASE_URL` set, so the 21 integration tests run. CI does not run Playwright, the build commands, or `npm audit`.
- Target deployment (templates only, nothing deployed): API on Render (`render.yaml`: pre-deploy `db:migrate:production`, `/ready` health check that also requires the LISTEN connection, single instance, private-network DB), web on Vercel (`vercel.json`, env check script, SPA rewrite, security headers). A single API instance is assumed because rate limits are in-process.

## Known limitations

- Not production ready: no live deployment, no real email delivery tested, no MFA, no breached-password check.
- Native behavior (notifications, SecureStore, print/share) unverified on devices.
- CI tests against PostgreSQL 17 while the Render template provisions PostgreSQL 18; align them before a real deployment.
- Bearer token in web `sessionStorage` is readable by same-origin script; web cache is unencrypted.
- Initial `/snapshot` and local history are unbounded; `changes`, receipts and audit have no retention policy (so there is also no cursor-expiry or re-snapshot handling).
- Authorization is application-level, not Postgres row-level security; runtime and migration use one DB role.
- Rate limits are per process. Registration returns 409 for an existing email, which reveals account existence.
- Dependency audit reports moderate transitive findings in the Expo toolchain (see the security review).
- Reminders are in-app and local notifications only; no server push.
- Routine estimates and the phrase parser are heuristics, not medical advice.

## Future improvements

Not implemented: server push and background sync; Postgres RLS and separate migration role; shared rate-limit store; snapshot pagination and change-feed retention with re-snapshot; MFA; device test matrix; Playwright and `npm audit` in CI; typed SQL layer; account-enumeration hardening.
