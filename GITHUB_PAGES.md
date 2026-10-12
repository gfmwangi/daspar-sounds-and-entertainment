# GitHub Pages deployment

## Approved publication

The approved public GitHub repository is `gfmwangi/daspar-sounds-and-entertainment`. The repository site uses the Vite project-site base path `/daspar-sounds-and-entertainment/`.

- Customer website: `https://gfmwangi.github.io/daspar-sounds-and-entertainment/`
- Admin sign-in: `https://gfmwangi.github.io/daspar-sounds-and-entertainment/admin/login.html`
- Admin dashboard: `https://gfmwangi.github.io/daspar-sounds-and-entertainment/admin/dashboard.html`

The deployment uses a GitHub Actions Pages workflow to build the static Vite output and upload `dist/public`. The workflow is configured with the `github-pages` environment and the required `pages: write` and `id-token: write` permissions. GitHub Pages is public; the admin screens are visual-only and have no authentication, so their routes are publicly accessible.

## Deployment references

- [GitHub: Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub: Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Vite: Deploying a static site, including GitHub Pages base paths](https://vite.dev/guide/static-deploy)
