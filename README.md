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

```bash
pnpm install --frozen-lockfile
pnpm dev:static
```

The development server uses port `3000` by default; `PORT` can change it.

## Build and deployment

```bash
pnpm build:static
```

The static output is written to `dist/public/`. GitHub Actions builds and deploys the public site to GitHub Pages whenever changes are pushed to `main`. The project-site base path is `/daspar-sounds-and-entertainment/`; if the repository name changes, update the base path in `scripts/build-pages.mjs` and the matching Vite configuration.

GitHub Pages deployment uses a custom workflow, as documented by [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's static deployment guide](https://vite.dev/guide/static-deploy).

## Project structure

- `client/` contains the public multi-page site, admin mockups, shared styles/scripts, product data, and supplied image assets.
- `scripts/render-catalogue.mjs` generates catalogue cards into the initial HTML so the product list is present before JavaScript runs.
- `.github/workflows/pages.yml` builds and publishes the static site.
- `GITHUB_PAGES.md` records the publication paths and deployment references.

No backend, database, authentication, server functions, persistent storage, or email API is included. Product data is maintained in `client/src/data/products.js` and can be connected to a future data source without changing the site's page structure.
