# Realtime and care-management milestone

Continued from clean `main` at `15551fe` without changing the Expo/Fastify/PostgreSQL architecture. This milestone concentrates on priorities 1–3, account/membership foundations from priority 4, and the sync/accessibility verification needed to support them. It is not production-ready and does not complete the full roadmap.

## Implemented

### Authorized push and incremental sync

- The ten-second caregiver polling loop is removed. `/realtime` uses WebSockets; the first frame contains the session token and one household ID. Credentials are never placed in a URL. Browser origins are checked against `CORS_ORIGIN`; native clients authenticate without an Origin header.
- PostgreSQL transaction triggers append household changes and emit `NOTIFY` only after commit. Each API process has a dedicated `LISTEN` connection, so updates work across API instances. Notifications carry only a household UUID; client messages carry only `ready`, `changed`, or `heartbeat`, never care details.
- Session expiration and membership are rechecked before every signal and every 25-second heartbeat. Removed caregivers and revoked sessions lose their connection. API mutations also recheck write permission after obtaining the household transaction lock.
- Each household has a transactionally serialized revision. `/households/:id/changes?after=N` returns at most 200 changes with `hasMore`; reconnects catch up from the durable cursor. This avoids the commit-order bug possible with an independent sequence. A snapshot remains the bootstrap/migration path.
- Events, children, reminders and membership updates flow through the change feed. Queued optimistic edits remain projected over server state, and existing mutation receipts/version conflicts are preserved. The browser test interrupts the actual WebSocket and confirms cursor recovery without a new snapshot.
- Reconnect uses bounded exponential backoff and jitter, plus a heartbeat watchdog and foreground recovery. Transient HTTP failures retry with backoff; authorization/validation failures remain visible without discarding entries. Sync requests arriving during another sync are coalesced.

### Editing and reminders

- Existing logs can be edited with shared-child selection, date/time, end time, notes and category details. The editor retains its opened version; concurrent edits become conflicts. Unchanged timer timestamps retain seconds/milliseconds. Clearing an existing end time explicitly indicates that the timer will reopen.
- Added structured fields for sleep location, nursing side durations, milk type, solids texture/reaction, stool observations, medicine route, temperature method, symptom/severity and custom event names. Existing quantities, units and growth measurements remain validated.
- Child editing and archive/restore use version checks. Archiving hides new-log choices and retains history/shared sibling events; existing archived-child events remain editable.
- Reminder UI supports one-time, 24-hour, 7-day and custom elapsed recurrence, household or selected children, care categories, completion and 15-minute snooze. Snooze is versioned and repeat-safe for the same absolute target; stale changes are rejected. Recurrence is elapsed time, not wall-clock scheduling across daylight saving changes.
- Optional native local notifications schedule up to 48 future reminders from the selected household. Permission is requested only through the user’s Enable control. Notification content is generic; reconciliation cancels changed/completed reminders and sign-out clears scheduled NestWise reminders. Web does not advertise native notification capability.

### Safety foundations and portability

- Session listing and revocation of other sessions expose no token hashes. Settings can restore an expired session without deleting pending care.
- Owners can edit roles, remove caregivers or transfer ownership to an existing member. Transfer requires explicit typed confirmation and atomically demotes the old owner/promotes the new one. An owner cannot leave until transferring ownership. Membership changes are audited. Administrators retain existing invitation/child-management permissions but cannot elevate themselves or manage ownership.
- Outstanding invitations can be listed/revoked. A non-owner can leave with confirmation.
- Verification and password-reset routes use hashed, purpose-bound, one-use 30-minute tokens. Password reset revokes sessions and invalidates other reset tokens. A supplied `AccountMail` adapter is required to deliver messages. The running server has **no mail adapter**, never returns recovery tokens in responses, and clearly marks delivery unavailable. Integration tests inject an in-memory mail sink, never send email.
- A local JSON backup exports only the current account’s cached household data, including queued edits/conflicts, without credentials. It works offline and remains accessible on onboarding after household access is lost. Web downloads JSON; native uses the OS text share sheet. This is not a complete server export or a restore/import workflow.
- Light/dark/system preference persists. Choice controls have explicit web checked semantics and 44px targets; dialogs respect reduced motion. Form submission guards prevent duplicate actions and prevent realtime responses from clearing the next child’s input.

## Verification

All commands are run against the existing local development environment; no production deployment or native device delivery is claimed.

- `npm run db:migrate`: applied additive schema changes to the local PostgreSQL instance; isolated integration schemas also test repeated initialization.
- `npm run typecheck`, `npm run lint`: pass.
- `TEST_DATABASE_URL=... npm test`: 26 tests in five files, including the original six PostgreSQL tests and eight new product integration tests. Actual PostgreSQL and two API instances are used for WebSocket tests.
- `npm run build:api`, `npm run build:web`: pass.
- `npm run test:e2e`: two Chromium journeys pass. Original auth/household/sibling/timer/offline/reconnect/export/reminder/logout coverage is preserved; new coverage includes two caregivers, live edits, stale editor conflicts, WebSocket interruption, cursor catch-up without snapshots, child editing/archive/restore, recurrence/snooze and persisted dark mode. Offline backup checks include the pending mutation and exclude credentials.
- `npx expo-doctor` from `apps/app`: 20/20 checks pass.
- `npx expo export --platform ios --platform android --output-dir dist-native`: both Hermes bundles export. Local notification permission, delivery, reconciliation, and share-sheet behavior still require native-device testing.
- Desktop and 390×844 mobile screenshots inspected in light/dark appearances. Mobile horizontal overflow is checked in the browser journeys.
- `npm audit --omit=dev`: **not clean**, reporting the inherited 17 moderate Expo/navigation transitive findings (`decode-uri-component` and `uuid` dependency chains). No incompatible forced SDK downgrade was applied.

## Release constraints and remaining work

1. Native notifications are a testable scheduling foundation, not verified delivery. Only the selected household is scheduled. Other caregivers’ changes cannot update a closed/offline app’s local alarms until it reconnects. No remote push service, background sync or guaranteed reminders are provided.
2. Email delivery, recovery screens/link handling, MFA and production recovery abuse controls still need implementation/verification. Mail-provider latency can differ for known/unknown accounts despite generic HTTP responses. Existing invitations are still not gated on independently verified email ownership.
3. Household/account/child permanent deletion, erasure of historical change/receipt payloads, full server-side data exports and restore/import are not implemented. Archive is not erasure. Do not claim legal/regulatory privacy compliance. The local backup contains sensitive unencrypted family data and requires private handling.
4. Device care caches are still not application-encrypted. Revocation stops future server access; it cannot erase previously downloaded data. Pending entries are retained even if their household becomes inaccessible. Export them locally or restore authorization; they are not silently discarded.
5. Initial snapshots and local history remain unbounded. The incremental feed is paginated, but change/receipt retention, cursor-expiry/resnapshot policy, batched invalidation fan-out, connection quotas and large-household load tests remain release work. Each API process reserves a database pool connection for `LISTEN`; size production pools accordingly. Database notifications currently use the shared `nestwise_changes` channel.
6. Production needs HTTPS/WSS, an upgrade-capable reverse proxy with idle timeouts above the heartbeat interval, private PostgreSQL, restricted origin configuration, backups/restore verification and operational monitoring. Abrupt listener/database-loss recovery is implemented but not a tested failover/HA deployment.
7. New report range/section charts and pediatrician PDF export, expanded recency/local-bedtime Routine Intelligence, and broader deterministic natural-language logging were not changed in this milestone. Existing CSV, recorded-data summaries, conservative predictions and two-phrase parser remain functional with their previous limitations.
8. Further category polish is needed for timer overlap detection, detailed solids quantities, accessible native date/time pickers and general reminder editing/cancellation. Web has no installable offline service-worker cache. Cross-browser, keyboard/screen-reader and physical phone/tablet QA remain beyond the tested Chromium viewports.

The working tree is left for review; no commit, reset, architecture replacement or deployment was performed.
