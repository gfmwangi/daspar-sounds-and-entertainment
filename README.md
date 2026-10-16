# DASPAR Sounds & Entertainment

A responsive frontend-only website for DASPAR Sounds & Entertainment, built with HTML5, CSS3, vanilla JavaScript, and Vite.

## Published pages

- Customer website: https://gfmwangi.github.io/daspar-sounds-and-entertainment/
- Products: https://gfmwangi.github.io/daspar-sounds-and-entertainment/products.html
- Services: https://gfmwangi.github.io/daspar-sounds-and-entertainment/services.html
- Delivery: https://gfmwangi.github.io/daspar-sounds-and-entertainment/delivery.html
- Contact: https://gfmwangi.github.io/daspar-sounds-and-entertainment/contact.html
- Admin sign-in visual: https://gfmwangi.github.io/daspar-sounds-and-entertainment/admin/login.html
- Admin dashboard visual: https://gfmwangi.github.io/daspar-sounds-and-entertainment/admin/dashboard.html

The admin screens are visual-only mockups. They do not authenticate users, restrict access, store changes, or protect data; anyone can open their URLs. Do not enter real credentials or confidential information.

## Website features

The home page introduces the business and features the supplied Pro-Mixers photograph. The catalogue contains 30 products across 10 categories with search, category filters, product details, photographs, availability labels, and WhatsApp inquiry links. All listed items are confirmed available. Prices are provided by inquiry rather than displayed as fixed amounts. Separate pages cover services, countrywide delivery in Kenya, and contact information. The email inquiry form opens a draft in the visitor's email application.

Business contact: `dasparent@outlook.com`; `+254 706 892 739` and `+254 745 494 350`. WhatsApp inquiries use `+254 745 494 350`. Business hours: Monday–Friday, 8:00 AM–7:00 PM; Saturday, 9:00 AM–6:30 PM; Sunday closed. There is no physical shop at present.

## Run locally

Requirements: Node.js 22 or a compatible current release, and pnpm 10.

1. Install project dependencies:
```bash
pnpm install
```

2. Start the backend server (runs on port 5000 by default):
```bash
pnpm run dev:backend
```

3. In a second terminal, start the frontend Vite development server (proxies `/api` requests to backend on port 5000):
```bash
pnpm run dev:frontend
```

Alternatively, to run the static frontend only without the backend:
```bash
pnpm run dev:static
```

## Backend and Database

The backend is built with Node.js 22 and Express in `server/`.

- **Persistent Database**: Automatically initialized and seeded on first run with the 30 confirmed catalogue products and 10 categories from `client/src/data/products.js`. Data persists in `data/daspar-store.json`.
- **Authentication**: Session-based authentication with `httpOnly`, `SameSite=Lax` cookies, rate limiting, and password hashing (`scrypt`).
- **Default Administrator**:
  - Email: `admin@daspar.co.ke` (configurable via `ADMIN_EMAIL` in `.env`)
  - Password: `DasparAdmin2026!` (configurable via `ADMIN_INITIAL_PASSWORD` in `.env`)
- **API Endpoints**:
  - `GET /api/public/products` — Filterable catalogue (`?category=`, `?q=`)
  - `GET /api/public/products/:id` — Single product details
  - `GET /api/public/categories` — Product categories
  - `POST /api/contact-inquiries` — Customer inquiries (rate-limited)
  - `POST /api/admin/session` — Administrator sign-in
  - `GET /api/admin/session` — Current session check
  - `DELETE /api/admin/session` — Sign out
  - `GET /api/admin/stats` — Live dashboard metrics
  - `GET /api/admin/products` — Authorized catalogue management
  - `POST /api/admin/products` — Add product
  - `PATCH /api/admin/products/:id` — Update product
  - `DELETE /api/admin/products/:id` — Delete product
  - `POST /api/admin/products/:id/images` — Upload product photographs

## Build and deployment

```bash
pnpm run build:static
```

- **Static Deployment (GitHub Pages)**: Builds to `dist/public/` using `pnpm run build:pages`. GitHub Actions deploys the static site to GitHub Pages whenever changes are pushed to `main`.
- **Full-Stack Deployment (Render, Railway, Fly.io, or VPS)**: Build the static frontend (`pnpm run build`) and start the unified Node server (`pnpm start`). The Node server serves both the static pages and the `/api/*` endpoints from the same origin.

## Project structure

- `client/` — Public multi-page website, admin screens, styles, client scripts, and product assets.
- `server/` — Express backend, database engine, authentication service, rate limiters, file uploads, and API routes.
- `data/` — Persistent store directory (git-ignored for security).
- `scripts/render-catalogue.mjs` — Generates catalogue cards into the initial HTML so products are present before client JavaScript runs.
- `scripts/build-pages.mjs` — Prepares static build with GitHub Pages subpath.
- `.github/workflows/pages.yml` — Builds and deploys the static site to GitHub Pages.
- `GITHUB_PAGES.md` — Publication records and URLs.

