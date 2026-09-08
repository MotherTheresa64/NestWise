# Navigation and care UX milestone

This is a client UI change on top of the verified care-depth milestone. It does not change database schemas, API contracts, mutation receipts, queues, permissions or deployment configuration. Reference screenshots were used for interaction principles only; NestWise retains its sage/cream/lavender palette, standard Ionicons, typography and independent layouts.

## Navigation and home

- Below 900px, a persistent Home / Timeline / Log / Reports / More navigation replaces the former four-item navigation. Log is the central primary action for caregivers with write permission. Viewers retain review navigation without a misleading write control.
- More contains Children, Household, Reminders, Settings, Food Library, Privacy / Exports and household switching. Privacy / Exports opens the existing Settings controls; it is not a new backend flow.
- The mobile header shows the current child, initial avatar, household name and sibling selector, with settings access and subtle connectivity status. Selection follows navigation and resets safely to an active child on a full app reload or household change. Forms always show their actual selected children and allow siblings together.
- Mobile Home shows the selected child's care tiles, last recorded summaries and household-local date/time. All 17 existing categories are available: Sleep, Bottle, Nursing, Food, Diaper, Pumping, Potty, Medicine, Temperature, Growth, Symptom, Bath, Teeth, Milestone, Routine, Water and Other.
- Running timers link to the timeline. Recorded rhythm estimates are expandable, so sparse-history explanations do not dominate fast logging. Viewer and no-child states have explicit next steps.
- Desktop keeps the existing sidebar and family overview instead of enlarging the mobile tile layout. Page width increases to use large screens; borderless panels and more consistent spacing reduce visual clutter.

## Entry flows

- Mobile Log and Timeline's Log care open the same child-aware category chooser. Category tiles on Home go directly to the focused editor.
- Children appear first. Fast entry collapses category switching, quick-phrase parsing and backdating until requested.
- Bottle/Nursing and Diaper/Potty have direct segmented switching. Quantity inputs are larger, with existing unit and quick-amount controls preserved.
- Notes are collapsed when empty; existing notes remain visible during editing. Food amounts expand separately for each food. Selected foods retain preference and optional observed-sensitivity controls.
- Timer forms offer expandable completed-session fields, explicit timer-start wording and the existing start/end/duration validation. Collapsing fields does not clear their data.
- Save remains outside the scrolling form. Mobile dialogs align near the bottom, account for safe-area insets and use iOS keyboard avoidance. Existing error, confirmation and conflict behavior remains.

## Reports and timeline

- Day / Week / List / Summary is a prominent equal-width segmented control. Mobile date/child/section/privacy options collapse behind Report filters; desktop retains direct access.
- Day puts chronological care entries before hourly distributions. Week uses a compact grid of actual six-hour start counts with scaled bars and explicit numbers. List and Summary retain existing data, date ranges and export behavior.
- Mobile timeline replaces the category wall with a filter sheet, retaining child selection and search. Entries add category icons while retaining human-readable summaries, attribution, timers, editing and repeat actions.
- PDF/CSV exports and section/privacy controls continue to use the existing report implementation.

## Accessibility and scope

- Core controls have at least 44px targets; segmented views use 48px targets. Labels and state remain explicit; color is not the only signal.
- Text controls are larger, light-mode secondary text has stronger contrast, web keyboard focus is outlined, and reduced-motion preferences suppress animations/transitions.
- The existing native/web Modal behavior remains, including keyboard Escape dismissal on web. Safe-area spacing and scrollable sheets were verified in browser viewports. Physical-device keyboards, screen readers, OS text scaling and focus behavior still need device QA.
- Tile reorder/hide preferences, custom avatars and photo capture were not added. Active child selection is session UI state, not a persistent caregiver preference.

## Verification and rollout

Executed successfully: `npm run typecheck`, `npm run lint`, `npm test` with local PostgreSQL integration (119 tests in 17 files), `npm run test:e2e` (8 journeys), `npm run build:api`, local web build, clean HTTPS-configured web/iOS/Android exports, and Expo Doctor (20/20). Release exports use fictional `.example` endpoints for build verification, not live production addresses.

Browser coverage includes sibling switching, the central chooser, multiple-child confirmation, collapsed notes, timeline and report filters, food-library access, Escape dismissal, visible save controls and screenshots at 390×844, 412×915, 768×1024, 1366×768 and 1920×1080. The deeper screenshot review found and fixed internal horizontal scrolling in food units; a browser regression assertion now checks for it. All seven main screens were also captured at all five sizes, with no page errors or document overflow. Mobile food sheets, weekly grids and desktop/tablet layouts were visually inspected.

After review, deploy the frontend through the existing production process with the real HTTPS public API and web URLs; distribute rebuilt native clients as appropriate. This milestone requires no additional migration. If the preceding care-depth milestone has not been deployed, its `002-foods.sql` migration and compatible API must still precede that frontend. No production changes were made here. Installed-device QA and existing security/dependency limitations remain prerequisites to a broader production-readiness claim.
