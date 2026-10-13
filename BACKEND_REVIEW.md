# Backend review branch — local evaluation only

This document applies to `backend-review-20261013`, not the deployed `main` branch. It describes an early local prototype for reviewing API integration. It is **not production-ready** and is not deployed by GitHub Pages.

## What is included

- Express API routes for public catalogue data, admin sign-in/session, product management, image upload, and contact inquiries.
- A local JSON file store initialized from the supplied static catalogue.
- Local disk storage for newly uploaded product images.
- A local-development admin account created from privately configured environment variables.
- In-memory request throttling for sign-in and contact submissions.
- Frontend API calls for the catalogue, admin screen, and contact form, with the static catalogue still available for the public site.

## Run locally

Use Node.js 22+ and pnpm 10. Do not deploy this branch or use real business/customer data.

1. In a terminal, check out the branch and install dependencies:

   ```bash
   git fetch origin
   git switch --track origin/backend-review-20261013
   pnpm install --frozen-lockfile
   ```

2. Create a private local environment file. On macOS/Linux:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Fill `ADMIN_EMAIL` with a disposable test email and `ADMIN_INITIAL_PASSWORD` with a unique test-only password of at least 16 characters. Do not use the business owner's real password. Keep `.env` private; it is ignored by Git.

3. Start the API in one terminal:

   ```bash
   pnpm dev:backend
   ```

4. Start the frontend in a second terminal:

   ```bash
   pnpm dev:frontend
   ```

5. Open `http://localhost:3000/`. The sign-in preview is at `http://localhost:3000/admin/login.html`. The backend binds to `127.0.0.1:5000` by default, and Vite proxies local `/api` and `/uploads/products` requests to it.

The first API start seeds `data/daspar-store.json` with the catalogue and a local test administrator. That file and uploaded images are ignored by Git. They are local review data and may be lost; do not store real customer or business records here.

## Contact behavior

A successful API submission is saved to the local JSON store. **It does not send email or notify DASPAR.** The interface says that the inquiry was saved locally. If the API is unavailable, the frontend opens a pre-addressed email draft to `dasparent@outlook.com`; the visitor must review and send that email in their own mail application.

## Review checks

- `pnpm check:backend` syntax-checks backend JavaScript.
- `pnpm test:review` runs API, session, catalogue, upload, inquiry, CORS, and production-guard checks using synthetic credentials and an automatically removed temporary data directory.
- `pnpm build:static` verifies the static build.
- `pnpm build:pages` verifies the public Pages build output; it does not package or deploy the API.
- `GET /api/health` is only a local health check.
- Admin APIs require the local session cookie. A static HTML shell may still be directly readable; it contains no private records.

## Limitations before any production use

- **No production database:** the JSON store is single-process/local and is not safe for concurrent production writes, backups, migrations, or multi-instance hosting.
- **No durable object storage:** local uploads are tied to the machine and source checkout.
- **No production session store:** session rows are in the local JSON file. Session tokens are hashed at rest, but production requires a reviewed persistent session store, key rotation policy, CSRF strategy, secure cookie settings, and a threat-model review.
- **In-memory rate limits:** limits reset on restart and are not shared across processes.
- **No email provider:** inquiries remain local; the API does not email the business.
- **No production deployment configuration:** GitHub Pages can host only the static frontend. The existing workflow runs for `main` only, and this review branch is not deployed.
- **Bootstrap credentials are local-only:** the branch has no default admin account/password. The first admin is seeded from private environment variables. Changing those values does not reset an already initialized local store.
- **Uploads need further production hardening:** uploaded images are size-limited and stored locally, but production requires durable storage, malware/content inspection, quotas, monitoring, and a retention policy.

Before any production launch, replace the file store with an explicitly chosen durable database and migrations, move uploads to controlled durable object storage, review authentication/session/CSRF controls, add email delivery only with the business's approval, set up backups and monitoring, and deploy the API to an appropriate server-capable host. Do not enable `NODE_ENV=production` in this branch; startup intentionally refuses it.


## Local API surface

- `GET /api/health` — local health check.
- `GET /api/public/products`, `GET /api/public/products/:id`, `GET /api/public/categories` — public catalogue data.
- `POST /api/contact-inquiries` — validates and stores an inquiry locally; it does not send email.
- `POST /api/admin/session`, `GET /api/admin/session`, `DELETE /api/admin/session` — local test sign-in, session check, and sign-out.
- `GET/POST /api/admin/products`, `PATCH/DELETE /api/admin/products/:id`, and `POST /api/admin/products/:id/images` — protected local product management.
- `GET /api/admin/inquiries` and `GET /api/admin/audit-logs` — protected local review records.
- `/uploads/products/:filename` — serves images uploaded to the local review data folder; Vite proxies this path only during local development.
