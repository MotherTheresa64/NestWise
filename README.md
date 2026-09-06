# NestWise

An Expo / React Native family-care app with a TypeScript Fastify API and PostgreSQL. This repository is a working development milestone, **not ready for production family health data**. See [implementation status](docs/implementation-status.md) for verified features and release gaps.

## Run locally

Requires Node.js 22+ (verified with 24.19), npm, and PostgreSQL 17+ or Docker.

```sh
npm ci
```

Copy `.env.example` to `.env`, configure `DATABASE_URL`, then start PostgreSQL (`docker compose up -d db` if using the included Compose file). Run:

```sh
npm run db:migrate
npm run dev:api
```

In another terminal:

```sh
npm run dev:web
```

Open http://localhost:8081, create an account, create a household, then add children. No demo records or fabricated charts are inserted. Invite another registered account from Household by privately sharing the generated token.

For iOS/Android, run `npm run dev:mobile`. Set `EXPO_PUBLIC_API_URL` in the shell or `apps/app/.env` to an API address the device can reach; `localhost` on a phone points to that phone. Set API `HOST` and the development network firewall appropriately. The root `.env` is loaded by the API; Expo loads the app directory's environment. Native runtime testing requires a device/simulator and remains outstanding.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build:api
npm run build:web
```

Database tests run when `TEST_DATABASE_URL` is set. Use a separate test database; the suite creates and drops its own randomly named schema and does not truncate existing tables. Example in PowerShell:

```powershell
$env:TEST_DATABASE_URL='postgresql://nestwise:nestwise_local@localhost:5432/nestwise_test'
npm test
npx playwright install chromium
npm run test:e2e
```

Build both workspaces and migrate first. Playwright starts the built API and serves the exported web bundle. Its journey creates uniquely named test accounts and family records in the configured development database; use a dedicated `.env` database for isolated E2E runs. Unit tests alone skip database integration when the URL is absent. A passing unit run is not a database verification.

## Package map

- `apps/app`: Expo Router routes, inherited responsive shell/theme, forms, durable mutation queue and API client.
- `apps/api`: Fastify routes, session authentication, role checks, PostgreSQL transactions, schema and integration tests.
- `packages/shared`: strict Zod contracts, conservative routine estimates, explicit quick-phrase parser and domain tests.
- `e2e`: browser journey including offline API interruption and reload, reconnect, timer, export and mobile viewport.

The development static server in `scripts/serve-web.mjs` is for local testing. Configure HTTPS, SPA fallbacks, security headers, private database networking, backups and production secret handling before deployment. No deployment has been performed.
