# Inherited state and continuation

**Historical foundation milestone.** For the current implementation, verification and remaining work, see [Realtime and care-management milestone](realtime-milestone.md). Statements below about polling, editing and account features describe the earlier checkpoint.

## Initial audit, 2026-09-06

The repository had one commit (`8c2f0f6`), containing only a ten-byte README. All implementation was untracked. No work was reset or discarded.

Existing work inspected in full:

- Root npm workspace scripts, TypeScript, ESLint, Vitest, Compose and environment configuration.
- Shared event, child, auth, household, reminder and mutation contracts with role helpers.
- Expo root layout, responsive Shell, UI components, palette/date helpers, authentication and household onboarding screens.
- The previous agent's `opencode.json` configuration (preserved).

Missing: app package/configuration, state store, every content route, API package, database schema, tests, lockfile and usable documentation. There was no other API/schema/app code to recover. Initial installation succeeded. Shared-only typechecking and lint passed; tests failed because there were no tests, and both build commands failed because their workspaces did not exist. Initial checks did not validate the incomplete app.

## Implemented in this continuation

- Runnable Expo SDK 55, React Native 0.83 and Expo Router workspaces retaining the inherited responsive navigation and components.
- Account registration/login, salted scrypt password hashes, random expiring sessions stored as hashes server-side, logout revocation, request validation, rate limiting, CORS and security headers.
- Household-scoped authorization, owner/admin/caregiver/viewer roles, multi-child profiles, email-bound expiring single-use invitation tokens.
- PostgreSQL persistence and transactional schema initialization, care mutations and audit entries. Household-scoped queries and child ownership checks are enforced server-side.
- Universal category form, quantities/units, notes, shared sibling logs, sleep/nursing/pumping timers, timeline child/category/text filters and deletion confirmation.
- Durable per-account/per-household event mutation queues, optimistic reconstruction, serialized local writes, server idempotency receipts, version conflicts and explicit server-version resolution. API-offline reload can recover cached care data.
- Data-derived rolling nap/feed/bedtime estimates and same-routine sibling window intersection. Insufficient, stale, or ongoing timer data leads to no estimate. No population schedule or fake history is used.
- Actual recorded counts and sleep durations, with report boundary clipping and overlapping sleep deduplication; CSV download on web and text sharing on native.
- Shared in-app reminders with completion; API recurring reminders advance to the next future occurrence and completion retries do not create duplicates.
- Explicit `bottle 120 ml` / `wet diaper` grammar with editable review and confirmation before saving. Unsupported phrases are rejected.
- Tests for domain validation, estimates, shared windows, queue projection, CSV injection protection and actual PostgreSQL authorization/conflict/transaction behavior; browser care journey.

## Scope and remaining production work

This is a substantial functional foundation, not the full production product. In particular:

- Caregiver changes are polled every 10 seconds while open. Push realtime transport, incremental synchronization/pagination, background sync, native push reminders and a fully offline-installable web app remain unimplemented. Offline reload testing keeps the web bundle reachable and blocks the API.
- Native tokens use Expo SecureStore; web tokens use tab sessionStorage. Care caches use AsyncStorage and are not application-encrypted. Device compromise, XSS defenses, retention/erasure policy and account/household deletion/export need a production privacy design. Sign-out clears care caches after pending work is resolved.
- Email verification, password recovery, MFA, invitation revocation, membership removal/role editing, owner transfer and session management UI remain necessary. Invitations require possession of the token and a matching account email, but email ownership is not yet independently verified.
- General event editing, child editing/archiving UI, custom categories, rich category-specific experiences and timer overlap handling need more work. Current UI can stop timers or delete logs; the API supports versioned updates.
- Routine Intelligence is a conservative interval baseline, not a validated predictive model. It needs clinical/product review, richer wake-window and household-local bedtime modeling, error calibration and longitudinal evaluation. Confidence reflects sample count/variation, not calibrated probability.
- Reports are recorded-data summaries/CSV, not percentile growth charts or a formatted pediatrician PDF. Natural-language parsing only supports the two documented explicit patterns.
- Recurrence is available through the API but not yet exposed in the reminder form. Appearance selection is currently session-local. Auditing currently covers event mutations, not every account/household administration action.
- Snapshot sync loads the full household history and is intended for development-sized datasets. Production needs bounded incremental history, receipt/audit retention policies, deployment migrations, backups/restore tests, observability and load tests.
- iOS/Android device behavior, native binary builds, screen-reader behavior and broader browser/device QA are not yet verified by desktop web tests.
- Dependency audit findings must be reviewed before release. Do not use `npm audit fix --force`: npm proposes incompatible Expo/Router downgrades. The current issues are in transitive Expo/navigation tooling; details are available from `npm audit`.

## Local environment created

Docker CLI was present but its daemon was not running. PostgreSQL 18 tools were available. An isolated development cluster was created in ignored `.local/postgres`, listening only on `127.0.0.1:55439`, with `nestwise` and `nestwise_test` databases. The existing PostgreSQL service on 5432 was not modified. The local cluster uses trust authentication for local development only; `.env` points at it. Do not expose this cluster to a network.

On this machine, restart/stop that cluster using PostgreSQL 18 `pg_ctl` with `-D .local/postgres` and the same `-o "-p 55439 -h 127.0.0.1"` on start. Keep `.local` and `.env` out of git.

## Verification record

Executed on 2026-09-06:

- `npm install`: successful; lockfile created. Final dependency audit reports 17 moderate findings, no high/critical findings. An esbuild override removes the observed low-severity Windows development-server advisory. Remaining findings involve Expo/navigation transitive dependencies (`uuid` and `decode-uri-component`).
- `npm run db:migrate`: successful on the isolated PostgreSQL instance. Integration setup also verifies migration reruns.
- `npm run typecheck` and `npm run lint`: pass across the completed workspaces.
- `TEST_DATABASE_URL=... npm test`: 15 passing tests across three suites, including six actual PostgreSQL integration tests. No integration tests skipped in this verification run.
- `npm run build:api` and `npm run build:web`: pass. Playwright starts and tests the compiled API and exported web app.
- `npm run test:e2e`: one complete browser journey passes: registration, household creation, two children, confirmed shared bottle log, timer stop, queued diaper log with API-offline reload, reconnect, CSV download, reminder completion, desktop/mobile layouts, sign-out/cache clearing. No browser page errors were observed.
- `npx expo-doctor`: 20/20 checks pass.
- `npx expo export --platform ios --platform android --output-dir dist-native` from `apps/app`: both Hermes bundles export successfully; this is not a native binary build or device test.
- Desktop and 390×844 mobile screenshots inspected visually; desktop has a sidebar and two-column content, mobile switches to bottom navigation. Browser test asserts no horizontal overflow.
- `git diff --check`: passes. All inherited untracked implementation remains in the working tree with additions; no commit, reset or deployment was performed.
