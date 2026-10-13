import { PRODUCT_CATEGORIES, PRODUCTS, getProductById } from "./data/products.js";

const grid = document.querySelector("#product-grid");
if (grid) {
  const searchInput = document.querySelector("#product-search");
  const filterList = document.querySelector("#category-filters");
  const resultCount = document.querySelector("#result-count");
  const emptyState = document.querySelector("#empty-state");
  const clearButton = document.querySelector("#clear-filters");
  const dialog = document.querySelector("#product-dialog");
  const dialogContent = document.querySelector("#dialog-content");
  const whatsappNumber = "254745494350";
  let activeCategory = "all";

  let currentProducts = [...PRODUCTS];
  let currentCategories = [...PRODUCT_CATEGORIES];

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const photoUrl = (file = "") => {
    if (!file) return `${import.meta.env.BASE_URL}assets/logo/logo-1.jpeg`;
    if (file.startsWith("http://") || file.startsWith("https://") || file.startsWith("/")) return file;
    return `${import.meta.env.BASE_URL}assets/products/${encodeURIComponent(file)}`;
  };
  const stockLabel = (availability) => ({
    in_stock: "Available",
    out_of_stock: "Unavailable",
    pending: "Status not listed",
  }[availability] || "Status not listed");
  const mailtoFor = (product) => {
    const subject = `Product inquiry: ${product.name}`;
    const body = `Hello Daspar Sounds and Entertainment,\n\nI would like to inquire about ${product.name}. Please share the current price and delivery information.\n\nThank you.`;
    return `mailto:dasparent@outlook.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const whatsappFor = (product) => {
    const message = `Hello Daspar Sounds and Entertainment, I would like to inquire about ${product.name}. Please share the current price and delivery information.`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  };
  const productSummary = (product) => product.description || "Contact DASPAR for product details and current pricing.";

  function renderFilters() {
    const items = [{ id: "all", label: "All categories" }, ...currentCategories];
    filterList.innerHTML = items.map((category) => `
      <button class="filter-chip${activeCategory === category.id ? " is-active" : ""}" type="button"
        data-category="${escapeHtml(category.id)}" aria-pressed="${activeCategory === category.id}">
        ${escapeHtml(category.label)}
      </button>`).join("");
  }

  function productCard(product) {
    const image = (product.images && product.images[0]) || "";
    return `
      <article class="product-card">
        <button class="product-card__media" type="button" data-open-product="${escapeHtml(product.id)}" aria-label="View details for ${escapeHtml(product.name)}">
          <img class="product-card__image" src="${escapeHtml(photoUrl(image))}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">
        </button>
        <div class="product-card__body">
          <div class="product-card__meta"><span class="category-label">${escapeHtml(product.categoryLabel)}</span><span class="stock-label"><i></i> ${escapeHtml(stockLabel(product.availability))}</span></div>
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(productSummary(product))}</p>
          <p class="product-card__price-note">Contact us for the current price.</p>
          <div class="product-card__actions"><a class="button button--small button--whatsapp" href="${escapeHtml(whatsappFor(product))}" target="_blank" rel="noopener noreferrer">WhatsApp inquiry <span aria-hidden="true">↗</span></a><button class="button button--small button--primary" type="button" data-open-product="${escapeHtml(product.id)}">View details <span aria-hidden="true">↗</span></button></div>
        </div>
      </article>`;
  }

  function visibleProducts() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    return currentProducts.filter((product) => {
      const categoryMatches = activeCategory === "all" || product.categoryId === activeCategory;
      const specsText = Array.isArray(product.specifications) ? product.specifications.map((item) => `${item.label} ${item.value}`).join(" ") : "";
      const searchable = `${product.name} ${product.categoryLabel} ${product.description || ""} ${specsText}`.toLocaleLowerCase();
      return categoryMatches && (!query || searchable.includes(query));
    });
  }

  function render() {
    const items = visibleProducts();
    grid.innerHTML = items.map(productCard).join("");
    resultCount.textContent = `${items.length} ${items.length === 1 ? "product" : "products"}`;
    emptyState.hidden = items.length !== 0;
    grid.hidden = items.length === 0;
    renderFilters();
  }

  function openProduct(id) {
    const product = currentProducts.find((p) => p.id === id) || getProductById(id);
    if (!product) return;
    const images = Array.isArray(product.images) && product.images.length ? product.images : [""];
    const firstImage = images[0];
    const gallery = images.length > 1 ? `
      <div class="detail-gallery__thumbs" role="group" aria-label="More product photos">
        ${images.map((file, index) => `
          <button class="detail-gallery__thumb${index === 0 ? " is-selected" : ""}" type="button"
            data-gallery-photo="${escapeHtml(photoUrl(file))}" data-gallery-alt="${escapeHtml(product.name)} photo ${index + 1}"
            aria-label="Show photo ${index + 1}" aria-pressed="${index === 0}">
            <img src="${escapeHtml(photoUrl(file))}" alt="" loading="lazy" decoding="async">
          </button>`).join("")}
      </div>` : "";
    const description = product.description ? `<p>${escapeHtml(product.description)}</p>` : "";
    const specs = Array.isArray(product.specifications) ? product.specifications : [];
    const specifications = specs.length ? `
      <section class="detail-specifications" aria-labelledby="detail-specs-heading">
        <h3 id="detail-specs-heading">Specifications &amp; catalogue details</h3>
        <dl class="detail-specs">${specs.map((spec) => `<div><dt>${escapeHtml(spec.label)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`).join("")}</dl>
      </section>` : "";
    dialogContent.innerHTML = `
      <div class="detail-layout">
        <div class="detail-photo">
          <img class="detail-photo__main" id="detail-photo-image" src="${escapeHtml(photoUrl(firstImage))}" alt="${escapeHtml(product.name)}" decoding="async">
          ${gallery}
        </div>
        <div class="detail-content">
          <p class="eyebrow">${escapeHtml(product.categoryLabel)}</p>
          <h2 id="dialog-title">${escapeHtml(product.name)}</h2>
          <p class="stock-label"><i></i> ${escapeHtml(stockLabel(product.availability))}</p>
          ${description}
          <p class="detail-price">Contact us for the current price.</p>
          ${specifications}
          <div class="detail-actions">
            <a class="button button--whatsapp" href="${escapeHtml(whatsappFor(product))}" target="_blank" rel="noopener noreferrer">WhatsApp inquiry <span aria-hidden="true">↗</span></a>
            <a class="button button--outline" href="${escapeHtml(mailtoFor(product))}">Inquire by email</a>
          </div>
        </div>
      </div>`;
    dialog.showModal();
    dialogContent.querySelectorAll("[data-gallery-photo]").forEach((button) => button.addEventListener("click", () => {
      const mainImage = dialogContent.querySelector("#detail-photo-image");
      mainImage.src = button.dataset.galleryPhoto;
      mainImage.alt = button.dataset.galleryAlt;
      dialogContent.querySelectorAll("[data-gallery-photo]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
    }));
  }

  filterList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    render();
  });
  searchInput.addEventListener("input", render);
  clearButton.addEventListener("click", () => { activeCategory = "all"; searchInput.value = ""; render(); searchInput.focus(); });
  document.querySelector("[data-clear-search]")?.addEventListener("click", () => { activeCategory = "all"; searchInput.value = ""; render(); searchInput.focus(); });
  grid.addEventListener("click", (event) => { const button = event.target.closest("[data-open-product]"); if (button) openProduct(button.dataset.openProduct); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelector("[data-dialog-close]").addEventListener("click", () => dialog.close());
  const requestedCategory = new URLSearchParams(window.location.search).get("category");
  if (PRODUCT_CATEGORIES.some((category) => category.id === requestedCategory)) activeCategory = requestedCategory;
  render();

  // Load live data from the backend when available
  async function syncFromBackend() {
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch("/api/public/products"),
        fetch("/api/public/categories"),
      ]);
      if (prodRes.ok) {
        const data = await prodRes.json();
        if (Array.isArray(data) && data.length > 0) {
          currentProducts = data;
        }
      }
      if (catRes.ok) {
        const cats = await catRes.json();
        if (Array.isArray(cats) && cats.length > 0) {
          currentCategories = cats;
        }
      }
      render();
    } catch {
      // Backend not running or static GitHub Pages mode; static PRODUCTS baseline remains active
    }
  }

  syncFromBackend();
}
