# DASPAR backend and frontend completion plan

## Goal and boundaries

Continue from the latest GitHub `main` snapshot in an isolated, unpushed staging branch. Preserve the existing customer-site layout, blue-and-white theme, product imagery, catalogue, and navigation. Do not choose or configure Render/Railway, change DNS, or publish during this coding stage. Use portable PostgreSQL through a private `DATABASE_URL`, so a later provider can supply the same connection contract. Do not enable public administrator self-registration: provision the first owner privately and require a verified owner-only recovery path. Never remove production warnings from the live Pages deployment until the real backend is operating and tested.

## Implementation approach and project structure

- `client/`: keep the current customer pages, contact flow, and admin login/dashboard design; add session-aware return navigation, make the dashboard fail closed, provide an authenticated read-only inbox for saved customer inquiries, expose owner-only email/password and recovery-key settings, and add a first-run-only administrator setup wizard plus emergency recovery page.
- `server/`: retain Node.js/Express, but require valid private configuration, exact CORS origins, secure cookie sessions, server-side authorization, and validation for every write.
- `server/db/migrations/`: add ordered PostgreSQL schema migrations for categories, products, admin accounts, setup-lock state, hashed/encrypted recovery keys, sessions, password recovery, inquiries, audit logs, and migration history. Seed catalogue rows from the existing 30-product/10-category source only when initialization is incomplete; never overwrite owner-edited records on restart.
- `server/db/`: replace production JSON-file persistence with parameterized PostgreSQL queries and explicit transaction boundaries. Lock first-owner creation atomically and permanently in the database. Keep test fixtures disposable and separate from live data.
- `server/services/`, `server/routes/`, and `server/middleware/`: keep password hashing/session support in the auth service; use the private Resend/Cloudinary provider integrations only on the server; validate temporary uploads before object storage, and store stable image URLs/IDs in PostgreSQL.
- `scripts/`: provide safe private owner bootstrap/recovery commands, migration commands, and an authenticated encrypted `pg_dump`/restore tool. Do not print passwords, database URLs, reset links, recovery keys, or backup encryption keys to logs.
- `README.md`, `.env.example`, and `TODO.md`: document safe local setup, the database schema/seeding behavior, setup/recovery lifecycle, encrypted backup/restore workflow, and remaining provider credentials without any secret defaults.

## Product and design requirements

- Keep the established blue-and-white palette, supplied product photos, mobile layout, and public page structure; this is not a redesign.
- Customers retain the public home, catalogue, services, delivery, and contact pages.
- Admin product content and controls render only after the server validates the admin session and protected product data loads.
- Owner email/password settings require a valid admin session and current password; changing either revokes sessions and requires the owner to sign in again. Public self-registration remains unavailable.
- Before any administrator exists, `/admin/setup.html` is the only route to create the first owner account. Setup is locked atomically and permanently after successful completion; it cannot be reopened through the public UI.
- First setup generates a high-entropy emergency recovery key. The application stores a one-way verifier plus encrypted copy, displays the key after setup, and makes it available only to an authenticated owner. Emergency recovery requires the owner email, the key, and a new matching password; successful recovery revokes all sessions and rotates the key.
- Email reset links remain an optional second recovery route: each link is single-use and expires after 30 minutes; no success is claimed if the provider is not configured.
- A signed-in admin can open the customer website and see a return-to-dashboard link only while the same-origin server confirms the admin session. The public customer footer has no Admin Portal entry. Center the existing copyright line.
- Login and recovery copy must accurately describe enabled behavior. Password recovery must not claim to send or change anything unless its configured recovery service succeeds.
- Valid live catalogue responses are authoritative even when the database returns an empty product/category array. Fall back to bundled catalogue data only when the API is unavailable or invalid.
- Contact submissions confirm receipt only after the database acknowledges saving. A JSON API error must be shown without launching a draft or implying the inquiry was received; if no API service is reachable, explain that nothing was saved and open only a visitor-reviewed email draft.

## Design system (preserve, do not redesign)

- **Design movement:** polished contemporary technical-service branding, using the existing DASPAR blue-and-white visual identity.
- **Core principles:** clear information hierarchy; trustworthy, practical business presentation; product imagery first; responsive usability.
- **Color philosophy:** retain deep blue for confidence and navigation, white for readable content surfaces, and light blue for highlights; avoid black as a main design color.
- **Layout paradigm:** preserve the current separated public pages and restrained dashboard/sidebar structure rather than centralizing or rebuilding them.
- **Signature elements:** existing blue call-to-action buttons, clean outlined content cards, and supplied DASPAR logo/product photography.
- **Interaction philosophy:** explicit confirmation for destructive changes, visible loading/error states, and no UI-only success claims.
- **Animation:** retain existing subtle transitions; avoid adding motion to security or data operations.
- **Typography system:** preserve the existing project font declarations and established heading/body hierarchy.
- **Brand essence:** dependable electronics, PA-system and sound-engineering products/services for Kenyan customers; professional, helpful, practical.
- **Brand voice:** concise and factual; example lines: “Browse the DASPAR product catalogue.” “Your changes are saved only after the server confirms them.”
- **Wordmark & logo:** continue using the client-supplied DASPAR logo assets; do not replace with generic text branding.
- **Signature brand color:** preserve the existing deep DASPAR blue from the current stylesheet.

## Material constraints and provider-independent requirements

This stage can implement schema, SQL data access, secure configuration, frontend behavior, and provider adapters without selecting a host. A real database integration test still needs a disposable local PostgreSQL instance or a separately provisioned test database; it must never point at production while testing. Actual password-reset delivery requires an approved and verified sender/domain plus private credentials. Durable photo upload requires an approved object-storage account and private credentials. Production-origin cookie/CORS behavior, restart persistence on the chosen provider, backups, domain/DNS, and end-to-end production verification remain post-provider tasks.

An encrypted database backup/restore command can be implemented and tested locally without choosing a host, but unattended backups, managed PostgreSQL snapshots/PITR, off-site retention, and a production restore drill depend on the selected host/provider and its storage/scheduling facilities.
