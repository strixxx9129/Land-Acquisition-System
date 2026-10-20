# Design decisions

Short records of choices that shape the system. *Simplification* marks something done for the hackathon, with the production-grade alternative.

## D1. MongoDB instead of PostgreSQL/PostGIS
The problem statement suggests PostgreSQL + PostGIS. The team's brief mandates MERN. MongoDB covers our spatial needs natively: GeoJSON storage, `2dsphere` indexes, `$geoWithin` / `$geoIntersects` / `$geoNear`. Area and point-in-polygon maths runs in the API with Turf.js (M2). Atlas M0 is a replica set, so multi-document transactions are available for workflow and payment changes.
*At national scale:* MongoDB sharded by state code; or PostGIS if heavy spatial analytics (topology, overlays) becomes central.

## D2. Same-origin API through a Vercel rewrite
The browser only talks to the Vercel origin. `/api/*` is rewritten to Render. This keeps the refresh cookie first-party (`SameSite=Lax`), which Safari/iOS would otherwise block as a third-party cookie, and removes CORS preflights. Cost: API traffic passes through Vercel (100 GB/month on Hobby, ample). Cold starts are absorbed by client-side retries.

## D3. Jurisdiction scoping enforced in the data layer, not in handlers
Every jurisdiction-bearing collection uses the `jurisdictionScoped` Mongoose plugin. The current actor lives in `AsyncLocalStorage`, set by the auth middleware. The plugin adds the scope filter to every query and aggregation, and validates every insert/update. A query with no actor throws: **deny by default**. Handlers never build scope filters by hand, so forgetting one is impossible. Seeds and scheduled jobs run explicitly as `runAsSystem(reason)`.
Known gap: `Model.collection.*` (raw driver) bypasses Mongoose middleware. Rule: never use it outside seeds.

## D4. Roles and permissions are data
The code defines a *catalogue* of permission codes it knows how to enforce (`packages/shared/src/access.ts`). Which role holds which permission, and at which scope level, is in the `roles` collection, editable at runtime and audited. Role edits take effect within ~60 s (cache TTL).

## D5. Token design
Access token: 15-minute JWT (HS256, pinned algorithm, issuer/audience checked), kept only in memory in the browser, never in `localStorage`. Refresh token: opaque random secret in an `httpOnly` cookie scoped to `/api/auth`, stored as a SHA-256 hash, rotated on every refresh. Reuse of a rotated token revokes the whole session family. Cross-tab refreshes are serialised with the Web Locks API. A per-user `tokenVersion` lets an admin revoke all sessions. A 30-second principal cache means deactivation takes effect within 30 s.

## D6. No global `sanitizeFilter`; Zod at the edge instead
Mongoose's global `sanitizeFilter` also neuters the server's own `$in` / `$exists` filters. Instead, every handler parses its input with Zod into primitives before building a query, so request bodies can't inject operators. Covered by a test.

## D7. Local development needs no database
Without `MONGODB_URI` the API starts `mongodb-memory-server` as a single-node **replica set** (so transactions work) and seeds it. Tests use the same mechanism.

## D8. Dependency versions
Pinned to the latest release of major versions the team knows well (TypeScript 5.9, Mongoose 8, Vitest 3, tsup 8, Zod 4, Express 5, React 19, Vite 7, Tailwind 4) rather than brand-new majors (TypeScript 7, Mongoose 9, …), to avoid churn during the hackathon. Upgrade after judging.

## D9. Synthetic master data
State codes follow LGD/Census numbering (27 Maharashtra, 09 Uttar Pradesh, 21 Odisha). District codes are **synthetic placeholders** and flagged `syntheticCode: true` in the data. The LGD integration adapter (requirement 11) is the path to real codes.

## Simplifications (hackathon → production)

| Simplification | Production alternative |
|---|---|
| Atlas open to `0.0.0.0/0` (Render has no static egress IP) | Private Endpoint / VPC peering; NIC MeghRaj private network |
| In-memory rate limiting (single instance) | Redis-backed limiter shared by all instances |
| In-memory role/principal caches | Redis cache with pub/sub invalidation |
| Email + password only | Parichay / Jan Parichay SSO with MFA, or DigiLocker for citizens |
| HS256 shared secret | RS256/EdDSA with a KMS/HSM-held key and key rotation |
| Demo password shown on the login page | Demo mode off; real onboarding with verified government emails |
| Logs to stdout | Central logging + SIEM (CERT-In 180-day log retention) |
