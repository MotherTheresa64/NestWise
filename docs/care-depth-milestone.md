# Care depth milestone — September 7, 2026

This milestone extends the existing Expo, Fastify and PostgreSQL architecture. The reference screenshots informed functionality only; NestWise retains its own components, colors, navigation and layout. No production services, settings, deployments or records were changed.

## Care logging

| Event | Implemented functionality |
| --- | --- |
| Bottle and water | Liquid type, additional milk types, custom liquid name, quantity/unit and quick amounts; recent child-specific defaults and repeat drafts. |
| Nursing | Side and separate left/right minutes; existing timer and explicit start/end editing retained. |
| Pumping | Separate category, side, pumping method, optional volume when starting a timer, recorded duration and start/end editing. |
| Solids | Multiple named foods per meal, per-food amount/unit, preference, optional caregiver-observed sensitivity and observation text; texture and legacy reaction retained. |
| Diaper | Wet/dirty/mixed/dry, independent pee and poo amounts, rash, stool color and consistency with conditional fields. |
| Potty | Attempt/success and contents. |
| Sleep | Existing timer plus location, backdated start/end and explicit duration-to-end calculation. |
| Medicine | Name, dose/unit, route and scheduled context. Repeating a medicine does not copy its dose. |
| Temperature | Measurement/unit and method; repeat drafts do not copy measurements. |
| Symptoms | Multiple named symptoms with individual severity, alongside legacy single-symptom compatibility. |
| Growth | Weight, height and head circumference selection with compatible units; measurement changes clear the previous quantity. |
| Other care | Structured teeth action/tooth, bath kind, routine steps, milestone name and custom activity/duration. |

Shared sibling logging and versioned event editing remain in the existing mutation queue. Repeat drafts use new timestamps and require confirmation; they exclude notes, symptoms, sensitivity observations, measured temperature/growth and medicine doses. Home child cards open common categories with that child preselected. Forms support quick backdating and keep confirmation in a fixed dialog footer.

## Food library and synchronization

The searchable library supports household or selected-child scope, add/edit, favorites, archive/restore, and ordering by favorites then recorded usage. Recent foods can also be added from recorded meals. It is text-first and does not depend on stock photos or an external provider.

Food edits persist in the existing care cache, project optimistically, survive reload, and use separate versioned receipts and explicit conflict review. WebSocket invalidations and bounded incremental sync deliver changes. Authorization checks enforce household membership and write roles. Household export includes foods. Child erasure removes associated library records and receipts, scrubs their change history and prevents replay resurrection. Deletion is blocked while local event or food changes are unresolved.

New clients request `includeFoods=1` for incremental changes. Older clients receive harmless cursor-advancing tombstones for catalog changes rather than treating foods as reminders. Older records remain readable. Older client validators may not understand newly populated structured event fields: update clients before asking caregivers to edit these new records.

## Reports and connection UX

Summary, Day, Week and List views use recorded data within the existing date/child/section filters. Summary includes category session counts, named-food meal counts and separate diaper/potty counts. Day displays hourly starts and care entries; Week displays six-hour start-count buckets for up to seven days; List groups readable entries by date and opens details. These are distributions of recorded starts, not a continuous sleep calendar or recommendations. Household timezone handling combines repeated daylight-saving hours. Existing pediatrician PDF selection, privacy controls, disclaimer and CSV export remain; structured values are escaped and preserved in exports.

After inactivity, a shared readiness probe allows up to 75 seconds to wake the API, with a friendly waking status after four seconds. Explicit browser offline state is separate from unreachable-server state. Only readiness GETs retry automatically; uncertain arbitrary mutation responses are not replayed by the transport. Care queue retries continue to use idempotent receipts. Wake behavior has deterministic tests; actual hosted cold starts still need observation.

## Schema and manual rollout

Care details remain validated JSON; new optional typed fields do not require rewriting existing events. New `002-foods.sql` creates the household-scoped `foods` table, change trigger, index and `erased_foods` replay protection. The migration runner includes both the unchanged baseline and this checksum-tracked migration.

After review, perform these steps manually using the existing deployment runbook:

1. Back up the production database and verify restore access.
2. Build the API (`npm run build:api`). With production database/TLS variables supplied by the deployment environment, run `npm run db:migrate:production -w @nestwise/api` once. Do not use the development `.env` in production.
3. Deploy the compatible API before the new frontend; verify readiness and household authorization. The migration is additive and rerunnable, but do not edit an applied migration or drop catalog data during rollback.
4. Export/deploy the frontend with the real HTTPS API and web URLs. The `.example` URLs used for local release verification are not deployment values. Distribute updated native clients and verify offline/reconnect behavior on devices.
5. Smoke-test two caregiver sessions, food edits/conflicts, exports and hosted wake-up with fictional test data in a controlled test household. Do not run the development seeder against production.

## Verification

Executed successfully against the current changes:

- `npm run typecheck`, `npm run lint`, `git diff --check`.
- `npm test` with isolated local PostgreSQL test database: **119 tests, 17 files**, including real database integration.
- `npm run test:e2e`: **7 passed**. Includes existing privacy/realtime/conflict/report journeys plus richer mobile logging, repeat safety, durable offline food edits and another open caregiver view. Fixture traffic waits for the API rate-limit window where needed; production limits were not weakened.
- `npm run build:api`; `npm run db:migrate` twice; built `dist/migrate.js` against the local development database.
- Clean web export with HTTPS example configuration; iOS and Android bundle exports; focused release-marker scans of web and native output.
- Local web build with localhost configuration for browser tests and review.
- `npx expo-doctor`: **20/20**.
- Browser screenshot/overflow coverage at 390, 412, 768, 1366 and 1920 pixels; visual inspection of mobile logging and mobile/desktop reports.

## Remaining limitations

- Photo support is a scoped `PrivatePhotoStore` interface only: no capture, attachment persistence or upload UI is claimed. A concrete private storage adapter and deletion/export tests are needed before exposing it.
- Native exports are not installed-device testing. Camera, notifications, keyboard behavior, secure storage and background transitions need physical iOS/Android QA.
- Live Render cold starts, production email delivery and production migration were not exercised.
- Browser care caches remain readable by scripts on the same origin; native caches use the existing encryption. Exports and other caregiver devices may retain copies after deletion.
- Existing dependency audit findings and broader production/security work remain documented in the deployment review. This milestone does not establish production readiness.
