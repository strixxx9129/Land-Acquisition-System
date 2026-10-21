# National Land Acquisition & Management System (LAMS)

Prototype for **Smart India Hackathon problem statement 26016** — *Real-Time National Land Acquisition & Management System for End-to-End Digital Monitoring and Decision Support* (Ministry of Rural Development, Department of Land Resources).

One web platform for the whole land acquisition lifecycle, from project proposal to possession and closure, for the Ministry, states, district collectors and land acquisition officers, requiring bodies, R&R authorities and field officers.

> **All data in this prototype is synthetic.** No real government records, people or land are represented.

## Status

| Milestone | Scope | State |
|---|---|---|
| **M0** | Monorepo, auth, roles & jurisdiction scoping, health, cold-start handling, deploy config | ✅ Done |
| **M1** | Configurable legal workflow engine, proposals, officer inbox, statutory deadlines, tamper-evident history | ✅ Done |
| M2 | Parcels & GIS map with drill-down, area validation | Next |
| M3 | Documents (Supabase), notifications, awards, compensation engine, disbursement | |
| M4 | R&R, possession, milestones, national dashboard | |
| M5 | Alerts, escalation, scheduled scans | |
| M6 | Field-officer PWA (GPS, photo, offline) | |
| M7 | MIS reports, explainable delay prediction | |
| M8 | Hardening, accessibility, docs, demo script | |

## Quick start

Requires Node.js 20.19+ (22 recommended).

```bash
npm install
npm run dev
```

Open http://localhost:5173. No database or `.env` is needed locally: without `MONGODB_URI` the API starts an in-memory MongoDB replica set and seeds it on every start (data resets on restart). The first run downloads a MongoDB binary (~100 MB).

If you created `apps/api/.env` with an Atlas `MONGODB_URI` (for example to seed the cloud database), `npm run dev` uses that database. `npm run dev:fresh` ignores `.env` and always runs against a fresh, fully seeded in-memory database.

The login page lists one **demo account per role**; click one to sign in. The shared demo password is shown there and set by `DEMO_USER_PASSWORD` (see [`apps/api/.env.example`](apps/api/.env.example)).

| Script | What it does |
|---|---|
| `npm run dev` | API on :4000 and web on :5173 (web proxies `/api`) |
| `npm run dev:fresh` | Same, but always with a fresh seeded in-memory database |
| `npm test` | API test suite (in-memory MongoDB) |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run build` | Production builds of API and web |
| `npm run seed` | Seed the database in `MONGODB_URI` (needs `DEMO_USER_PASSWORD`) |

API documentation (OpenAPI 3.1, generated from the validation schemas) is served at **`/api/docs`**.

## Architecture

```
apps/web         React + Vite + TypeScript, TanStack Query, react-i18next, Tailwind   → Vercel (Hobby)
apps/api         Express 5 + TypeScript, Mongoose, Zod, pino                        → Render (free web service)
packages/shared  Zod schemas, permission catalogue and types used by both
                 MongoDB Atlas M0 (free) · Supabase Storage (M3) · GitHub Actions (CI, seeding, scheduled jobs)
```

The browser only ever talks to the Vercel origin. Vercel rewrites `/api/*` to Render, so the API is **same-origin**: the refresh cookie is first-party (Safari/iOS don't block it) and no CORS round-trips are needed.

### Security model (implemented in M0)

- **Authentication:** bcrypt-hashed passwords; 15-minute HS256 access token held in memory only; 7-day refresh token in an `httpOnly`, `SameSite=Lax`, path-scoped cookie, stored server-side as a SHA-256 hash and **rotated on every use**. Replaying an old refresh token revokes the whole session chain. Accounts lock after repeated failures; login is rate-limited.
- **Authorisation = role + jurisdiction.** Roles and their permissions are **data** (`roles` collection, editable under *Admin → Roles*, audited). Each role is scoped to a level: national, state, district or organisation (requiring body).
- **Deny-by-default data scoping.** A Mongoose plugin on every jurisdiction-bearing collection reads the current user from `AsyncLocalStorage` and adds the scope filter to *every* read, update, delete and aggregation, and checks every insert. A query issued with no known user throws. Handlers never write scope filters by hand, so they can't forget them. Tests prove a district user can't read, update, delete, create or move another district's records, including through the real HTTP API.
- **Hardening:** Zod validation of every input, Helmet security headers, rate limiting, request ids on every error, CORS allow-list, 100 kB body limit, logs redact credentials and personal identifiers, the server refuses to start in production with missing or development secrets, and no secrets are shipped to the frontend (it has no build-time env at all).

### Workflow engine (implemented in M1)

- **Legal processes are data.** Each framework (RFCTLARR Act 2013, National Highways Act 1956, and any state act an admin adds) is a versioned `WorkflowDefinition`: stages, who acts at each stage, transitions with the roles allowed and the inputs they capture (gazette number, official dates, award amounts, …), stage SLAs, required documents and **statutory deadlines** with their section references. Admins edit it in the browser (*Workflows*), and every save is validated: schema, cross-references, unknown roles, unreachable stages, dead ends.
- **Versioned, never edited in place.** Saving creates a draft; activating it retires the previous version. Each case pins the version it started on, so rules never change under an in-flight case.
- **Safe transitions.** A transition checks the role, the stage, the required remarks and inputs, and the official date. It then updates the case and appends its history entry **in one MongoDB transaction**. The client sends the case `version` it saw (optimistic locking): of two simultaneous actions, exactly one wins and the other gets `409 STALE_VERSION`.
- **Tamper-evident history.** Every event stores the SHA-256 hash of the previous one. The application refuses to update or delete events, and `GET /api/cases/:id/integrity` recomputes the chain, so an edit made directly in the database is detected.
- **Deadlines are computed, not stored**, from the official stage dates (e.g. the gazette date of the s.11 notification), so they are always current: *not started / on track / due soon / breached / met / met late*. Alerts and escalation on top of these come in M5.
- **Inbox per officer:** cases in the user's jurisdiction sitting at a stage where their role has an action, oldest first, with SLA and deadline badges.

The seeded demo cases (Pune Ring Road, Chakan MIDC, Pune–Nashik rail, Nashik–Sinnar NH, Prayagraj canal, Khordha industrial park, Agra ring road, plus a draft for a live demo) are created by **replaying their history through the real engine** with backdated timestamps. Several are deliberately near or past statutory limits.

### Free-tier realities and how they are handled

| Constraint | Handling |
|---|---|
| Render free sleeps after 15 min idle; ~1 min cold start | UptimeRobot pings `/api/health` every 5 min. The web app retries through gateway errors for up to ~100 s and shows a "starting the server" banner instead of failing. |
| Render free: 750 instance-hours/month per workspace | Exactly one always-on service (≈744 h). No second Render service. |
| Render Hobby: 5 GB/month bandwidth (since Aug 2026) | Frontend served by Vercel, files will be downloaded straight from Supabase via signed URLs, API responses gzip-compressed, health pings are ~150 bytes. |
| Render disk is ephemeral; no background workers | Nothing is stored on disk. Scheduled work (M5) runs via a secured endpoint triggered by GitHub Actions + cron-job.org. |
| Render has no fixed outbound IP | Atlas network access is `0.0.0.0/0`, protected by a strong DB password and TLS (*hackathon simplification*; production uses private endpoints/VPC peering). |
| Atlas M0: 512 MB, no backups | Expired sessions auto-delete via TTL index; files never go in MongoDB; geometries kept lean. |
| GitHub disables scheduled workflows after 60 days of repo inactivity | cron-job.org triggers the same endpoints as a backup (M5). |

More in [docs/DECISIONS.md](docs/DECISIONS.md). Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Repository layout

```
apps/api/src
  config.ts            environment, validated with Zod (fails fast)
  app.ts               Express app: security middleware, routes, error handling
  modules/
    access/            actor context (AsyncLocalStorage), jurisdiction scope plugin, roles
    auth/              login, refresh rotation, sessions, auth middleware
    users/ masters/    users; LGD jurisdictions and organisations
    admin/ audit/      role editing; append-only audit log
    workflow/          versioned workflow definitions, validation, activation
    cases/             case model, transition engine, hash-chained history, inbox
    health/            liveness and readiness
  seed/                repeatable synthetic seed data
apps/api/test          auth, scoping, access control, workflow validation, deadlines, case lifecycle
apps/web/src           pages, components, API client (cold-start aware), i18n (en, hi)
packages/shared/src    schemas and permission catalogue shared by web and API
```
