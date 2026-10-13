# DASPAR Sounds & Entertainment

A responsive website for DASPAR Sounds & Entertainment, built with HTML5, CSS3, vanilla JavaScript, and Vite.

## Live customer website

- Home: https://gfmwangi.github.io/daspar-sounds-and-entertainment/
- Products: https://gfmwangi.github.io/daspar-sounds-and-entertainment/products.html
- Services: https://gfmwangi.github.io/daspar-sounds-and-entertainment/services.html
- Delivery: https://gfmwangi.github.io/daspar-sounds-and-entertainment/delivery.html
- Contact: https://gfmwangi.github.io/daspar-sounds-and-entertainment/contact.html
- Admin sign-in mockup: https://gfmwangi.github.io/daspar-sounds-and-entertainment/admin/login.html
- Admin dashboard mockup: https://gfmwangi.github.io/daspar-sounds-and-entertainment/admin/dashboard.html

The live `main` branch is a static GitHub Pages website. Its admin pages are public visual mockups with no backend authentication or persistence. Do not enter real credentials or confidential information on those live pages.

## Website features

The home page introduces the business and features the supplied Pro-Mixers photograph. The catalogue contains 30 products across 10 categories with search, category filters, product details, photographs, availability labels, and product-specific WhatsApp links. All listed items are confirmed available. Prices are provided by inquiry rather than displayed as fixed amounts. Separate pages cover services, countrywide delivery in Kenya, and contact information.

Business contact: `dasparent@outlook.com`; `+254 706 892 739` and `+254 745 494 350`. WhatsApp inquiries use `+254 745 494 350`. Business hours: Monday–Friday, 8:00 AM–7:00 PM; Saturday, 9:00 AM–6:30 PM; Sunday closed. The supplied business location is Strowburg Building, Ground Floor, next to Safaricom Main Office, Eldoret CBD. DASPAR previously confirmed there is no physical shop at present; contact the business before making arrangements.

## Local frontend development

Requirements: Node.js 22 or a compatible current release, and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm dev:static
```

The static development server uses port `3000` by default. Build with `pnpm build:static`; output is written to `dist/public/`.

## Backend review branch — not for production

The branch `backend-review-20261013` contains an Express API integration for local evaluation. It is separate from `main`; pushing this branch does not deploy it or change the live GitHub Pages site. Review [BACKEND_REVIEW.md](BACKEND_REVIEW.md) before running it.

This prototype uses a local JSON file for data, local disk for uploaded images, and in-memory rate limiting. It does not provide durable production storage or send email. The API refuses `NODE_ENV=production`, and the example environment file contains no default admin credentials. Use only disposable test credentials and synthetic inquiries. Never commit `.env`, local data, uploads, or real customer information.

Run `pnpm test:review` to exercise the local API with synthetic credentials and disposable temporary data; the test removes its temporary store and uploaded image automatically.

## GitHub Pages

The existing Pages workflow builds and deploys static output from `main` only, using `/daspar-sounds-and-entertainment/` as the project-site base. The backend review branch is not deployed. The workflow is configured in `.github/workflows/pages.yml` and uses `scripts/build-pages.mjs`.

## Main project structure

- `client/`: customer pages, visual admin pages, shared styles/scripts, product data, and supplied assets.
- `scripts/render-catalogue.mjs`: creates initial catalogue cards from the product data.
- `scripts/build-pages.mjs`: builds the static GitHub Pages project-site variant.
- `server/`: local-only API in the backend review branch.
- `BACKEND_REVIEW.md`: setup, testing, and limitations for the review branch.
