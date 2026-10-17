# DASPAR Sounds & Entertainment

Responsive customer website and administrator workspace for DASPAR Sounds & Entertainment, built with HTML5, CSS3, vanilla JavaScript, Vite, and Node.js/Express.

## Current status and important hosting distinction

The public website is currently published on GitHub Pages at <https://gfmwangi.github.io/daspar-sounds-and-entertainment/>. GitHub Pages serves static files only; it does not run this Express API or PostgreSQL. Until the full-stack application is deployed to a Node.js host, the live Pages site cannot provide administrator authentication, database-backed product changes, saved inquiries, or backend image uploads. Do not present the Pages admin link as a secure working administrator system.

The production-readiness changes are kept on a separate feature branch and are not deployed. The live GitHub Pages site remains unchanged until the owner approves a cutover. The production website should be served by the Express application over HTTPS from the same origin as its API and PostgreSQL-backed features. The static Pages build can remain a customer-facing preview, but it is not the full-stack production service.

## Business information

DASPAR supplies electronics and public-address (PA) systems, with countrywide delivery in Kenya. Services include PA systems, sound engineering, installation and maintenance, CCTV installation, speaker repairs, electrical and electronics maintenance, and electrical engineering.

Business email: `dasparent@outlook.com`. Phone: `+254 706 892 739` and `+254 745 494 350`. WhatsApp inquiries use `+254 745 494 350`. Business hours: Monday–Friday, 8:00 AM–7:00 PM; Saturday, 9:00 AM–6:30 PM; Sunday closed. The address supplied for the business is Strowburg Building, Ground Floor, next to Safaricom Main Office, Eldoret CBD. The business has also said it does not currently have a physical shop, so visitors should contact DASPAR before arranging a visit.

## Application and data

- `client/` contains customer pages, admin pages, supplied brand/product images, CSS, and browser-side JavaScript.
- `server/` contains the Express API, PostgreSQL repository and migrations, secure session handling, rate limits, Cloudinary image-upload integration, and Resend email integration.
- PostgreSQL is required for the full-stack site. Migrations run at startup, and the existing 30 products and 10 categories are seeded once. Later product edits are preserved across restarts.
- Administrator passwords are scrypt-hashed. Sign-in uses opaque `HttpOnly` session cookies. There is no public registration endpoint.
- The first owner creates an account once through `/admin/setup.html`. The database permanently locks this setup after the first successful account creation. Save the one-time emergency recovery key privately.
- Account Settings permits the owner to view the recovery key only after verifying the current password; rotating it also requires the current password. Credential changes revoke sessions. The emergency recovery-key flow resets the password, revokes prior sessions, and rotates the key.
- Email/password recovery and inquiry email forwarding require Resend configuration. Without credentials, the site says no email was sent; when Resend accepts a request, the site says provider acceptance occurred but inbox delivery is not confirmed. The recovery key is the separate emergency option.
- Customer inquiries are stored in PostgreSQL and available in the protected Inquiries dashboard. Product image uploads require a configured Cloudinary account; until configured, the upload API reports that uploads are unavailable rather than claiming success.
- `server/scripts/backup-db.js` streams a custom-format PostgreSQL dump directly into AES-256-GCM encrypted output. `server/scripts/restore-db.js` requires an explicit destructive-operation confirmation, validates the encrypted backup, restores in a transaction, and removes its temporary plaintext dump.

## Local development

Requirements: Node.js 22, pnpm 10, and PostgreSQL. The backup commands additionally require the PostgreSQL client utilities `pg_dump` and `pg_restore`.

1. Install dependencies and create a private environment file:

   ```bash
   pnpm install --frozen-lockfile
   cp .env.example .env
   ```

2. In `.env`, set `DATABASE_URL` to a dedicated development database and set `SESSION_SECRET` to at least 32 random bytes. Do not commit `.env`, send secret values in chat, or point tests at production data. The local defaults permit `http://localhost:3000` and `http://127.0.0.1:3000`.

3. Start the backend and frontend in separate terminals:

   ```bash
   pnpm dev:backend
   pnpm dev:frontend
   ```

   The backend listens on port 5000 by default. Vite serves the site on port 3000 and proxies `/api` to the backend. Open `/admin/setup.html` on the local site to create the first owner. After setup, use `/admin/login.html`; the setup endpoint remains permanently locked. For a public-page-only preview without the API, run `pnpm dev:static`.

## Disposable backend integration tests

The backend integration suite requires `NODE_ENV=test` and refuses a non-loopback database or a database name without a separate `test` segment. Configure synthetic `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` values in the ignored local `.env`, point `DATABASE_URL` to a dedicated disposable test database, and run:

```bash
NODE_ENV=test pnpm test:backend
```

The tests alter and remove synthetic products, create a synthetic inquiry, and exercise administrator setup, authentication, password-verified recovery-key viewing/rotation/reset, session revocation, catalogue operations, content-signature upload rejection, the image cleanup queue, production HTTPS enforcement, and truthful email/storage failure behavior. Never use real administrator credentials or production data.

## Encrypted database backups

Set `BACKUP_ENCRYPTION_KEY` to a private 32-byte key represented as 64 hexadecimal characters. Generate one locally with `openssl rand -hex 32` and enter it directly in the appropriate private environment store; do not commit it, print it in logs, or reuse the same key in every environment. Optionally set `BACKUP_DIR` and `BACKUP_RETENTION_DAYS` (default `backups` and 30 days; allowed retention is 1–3650 days).

Create a backup with:

```bash
pnpm db:backup
```

The result is a `.pgdump.enc` file. Keep that file and its decryption key separately in protected storage. Restore only after verifying the target database: the operation replaces database objects and data. Use the encrypted backup file path and set the confirmation variable for this invocation only:

```bash
RESTORE_CONFIRM=RESTORE_DASPAR_DATABASE pnpm db:restore /secure/path/to/daspar-<timestamp>-<suffix>.pgdump.enc
```

The restore is transactional and aborts if the format, key, or authentication tag is invalid. It may still replace all application tables after a valid restore begins. Verify the restored application before reopening customer/admin traffic. Backup utilities receive parsed libpq connection settings rather than the full URL as a command argument: documented options such as TLS mode, CA/certificate paths, channel binding, and target-session settings are retained without placing the URL or credentials in process arguments. An unsupported or repeated URL option is rejected rather than silently dropped. See PostgreSQL's [connection URI documentation](https://www.postgresql.org/docs/current/libpq-connect.html) and [libpq environment-variable reference](https://www.postgresql.org/docs/current/libpq-envars.html).

These scripts create encrypted files but do not upload them or schedule recurring backups. Many hosted application filesystems are temporary, so do not leave the only backup inside a running web service. Run the backup command from a secured operator machine with network access to the database, or transfer the encrypted file to a separate durable private backup location. Also enable the selected database provider's own backup/recovery capability. A backup command completing successfully does not, by itself, prove the file was copied off-host or that restoration has been tested.

## Optional integrations

- `CLOUDINARY_URL`: private Cloudinary connection string for durable product-image uploads. Generated provider IDs are recorded in PostgreSQL before upload, then atomically removed from the cleanup queue when product-image metadata is saved. When a product is deleted, provider image IDs are recorded before the database cascade; deletion is attempted immediately and retried during later image management. If cleanup remains pending, the admin receives a warning rather than a false claim that remote images were removed.
- `RESEND_API_KEY`, `EMAIL_FROM`, and `CONTACT_RECIPIENT_EMAIL`: private email configuration for password-reset messages and inquiry notifications. Verify the sender/domain with the email provider before expecting real delivery.
- `PUBLIC_ORIGIN` and `CORS_ORIGINS`: exact website origins, with no wildcard entries. Production requires HTTPS and rejects non-HTTPS origins. Express returns HTTP 426 for plain-HTTP requests except the unauthenticated `/api/health` probe; the hosting proxy must terminate TLS and forward the correct `X-Forwarded-Proto` value.
- `DATABASE_SSL` and the PostgreSQL URL's `sslmode`: follow the selected database provider's connection/TLS instructions. Do not disable database TLS for a remote production database.
- `SESSION_SECRET`: private random value of at least 32 bytes. Changing it invalidates existing sessions and can make a previously encrypted recovery-key copy unavailable; the owner can rotate the key after signing in.

Keep all secret values in the host's private environment-variable settings. Never add them to browser JavaScript, `VITE_*` build variables, Git, screenshots, or public issue trackers.

## Build and run

- `pnpm build:pages` creates the static GitHub Pages package. It cannot run or authenticate against the Node API by itself.
- `pnpm build` creates the production frontend in `dist/public/`.
- `pnpm start` starts Express, applies pending migrations, and serves the API and built customer/admin pages from one origin. The process honors the host-provided `PORT` and listens on `0.0.0.0` in production. The readiness endpoint is `/api/health`.

Use Node.js 22 and pnpm 10.18.0. Build command: `pnpm install --frozen-lockfile && pnpm build`. Start command: `pnpm start`. Health-check path: `/api/health`.

## Render setup

1. Create a Render Postgres database and a Node web service linked to this GitHub repository. Put both in the same region. In the database's connection details, use the internal database URL for the web service.
2. Set the web-service build command to `pnpm install --frozen-lockfile && pnpm build`, the start command to `pnpm start`, and the health-check path to `/api/health`.
3. In the service's Environment settings, add the private variables from the list below. Copy the actual internal `DATABASE_URL` from Render's database connection panel. Ensure it includes `sslmode=require` for TLS over the internal connection; if absent, append `?sslmode=require` (or `&sslmode=require` when the URL already has query parameters). Keep the private internal URL rather than replacing it with a public database URL. Production startup rejects a PostgreSQL URL that does not enable TLS.
4. Save and deploy. Once `/api/health` returns success, visit `/admin/setup.html` on the HTTPS service URL to create the first administrator exactly once. Save the displayed recovery key in a password manager or another separate protected location.
5. Configure the final HTTPS domain before changing `PUBLIC_ORIGIN` and `CORS_ORIGINS`. If the public customer site and admin/API are served from separate origins, use exact origins and validate credentialed cookies and CORS before sharing the site.

Render's dashboard uses the service's Environment page for private variables. Its PostgreSQL guide documents same-region internal URLs and TLS requirements: [Render environment variables](https://render.com/docs/configure-environment-variables), [Render Node/Express deployment](https://render.com/docs/deploy-node-express-app), [Render PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting).

## Railway setup

1. Create a Railway project from this GitHub repository, then add a PostgreSQL service to the same project. Keep the database private; the application should use its private service-variable reference rather than enabling a public TCP proxy.
2. In the app service's Variables tab, add `DATABASE_URL` as a reference to the PostgreSQL service's `DATABASE_URL` (for a service named `Postgres`, the reference form is `${{Postgres.DATABASE_URL}}`). Verify that the referenced URL enables TLS. If it does not, use the provider's documented TLS-required URL parameter, or set `DATABASE_SSL=true` only when Node can validate the database server's certificate. Production startup rejects missing or explicitly disabled database TLS.
3. Set the build command to `pnpm install --frozen-lockfile && pnpm build`, the start command to `pnpm start`, and the service health-check path to `/api/health`. Railway injects `PORT`; the application listens on it.
4. Add the private environment variables listed below, review and deploy the staged variable changes, then generate/attach the HTTPS domain in the app service's Networking settings.
5. Once `/api/health` succeeds on the HTTPS domain, open `/admin/setup.html`, create the first administrator once, and save the displayed recovery key privately.

Railway documents service-to-service PostgreSQL references in its [PostgreSQL guide](https://docs.railway.com/databases/postgresql), variable references in [Using Variables](https://docs.railway.com/guides/variables), Express deployments in [Deploy an Express App](https://docs.railway.com/guides/express), and the `/api/health` setup under [Healthchecks](https://docs.railway.com/deployments/healthchecks).

## Production environment variables

Add these on the **application service**, using your chosen host's private environment settings. Do not put secret values in Git. Use the exact HTTPS origin after its domain is ready.

```text
NODE_ENV=production
SERVER_HOST=0.0.0.0
TRUST_PROXY_HOPS=1
PORT=<provided by the host; usually leave it host-managed>
DATABASE_URL=<private PostgreSQL connection URL from the selected host>
DATABASE_SSL=<follow the host/database TLS instructions; production needs TLS, and true requires a certificate trusted by Node>
SESSION_SECRET=<at least 32 random bytes, unique to production>
PUBLIC_ORIGIN=https://<your-final-domain>
CORS_ORIGINS=https://<your-final-domain>
COOKIE_SAME_SITE=lax
COOKIE_SECURE=true
SESSION_TTL_HOURS=12
BACKUP_ENCRYPTION_KEY=<64 hexadecimal characters, stored separately from the backup>
BACKUP_DIR=<private durable directory only if running the manual backup command here>
BACKUP_RETENTION_DAYS=30
```

Add the following only when you have configured and tested the corresponding provider. Without these values, the feature reports its actual unavailable/not-sent status instead of claiming success:

```text
CLOUDINARY_URL=<private Cloudinary connection string>
RESEND_API_KEY=<private Resend API key>
EMAIL_FROM=<verified sender address>
CONTACT_RECIPIENT_EMAIL=dasparent@outlook.com
```

Do not set `ADMIN_SETUP_EMAIL`, `ADMIN_SETUP_PASSWORD`, `ADMIN_RESET_EMAIL`, or `ADMIN_RESET_PASSWORD` on a public host. Those variables are reserved for private CLI workflows; use the one-time website setup flow and the emergency recovery key instead.

Do not switch the production domain or advertise admin access until the selected host's database connection, HTTPS, setup lock, admin sign-in/logout, product changes, product uploads, inquiry storage, and recovery behavior have been verified. GitHub Pages remains a static-only deployment and is not the production host for this full-stack application.
