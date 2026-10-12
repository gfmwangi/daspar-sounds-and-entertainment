import { PRODUCT_CATEGORIES, PRODUCTS } from "./data/products.js";

const loginForm = document.querySelector("#admin-login-form");
loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = loginForm.elements.password;
  if (password) password.value = "";
  const status = document.querySelector("#admin-login-message");
  if (status) status.textContent = "Preview only: sign-in is not active; credentials are not sent or saved.";
});

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const photoUrl = (file) => `${import.meta.env.BASE_URL}assets/products/${encodeURIComponent(file)}`;
const body = document.querySelector("#admin-products-body");

if (body) {
  const search = document.querySelector("#admin-search");
  const empty = document.querySelector("#admin-empty");
  const uniquePhotos = new Set(PRODUCTS.flatMap((item) => item.images));
  document.querySelector("[data-stat-products]").textContent = String(PRODUCTS.length);
  document.querySelector("[data-stat-stock]").textContent = String(PRODUCTS.filter((item) => item.availability === "in_stock").length);
  document.querySelector("[data-stat-photos]").textContent = String(uniquePhotos.size);

  const categorySelect = document.querySelector("#product-category");
  if (categorySelect) {
    categorySelect.insertAdjacentHTML("beforeend", PRODUCT_CATEGORIES.map((category) =>
      `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`).join(""));
  }

  function renderRows() {
    const query = (search?.value || "").trim().toLocaleLowerCase();
    const records = PRODUCTS.filter((item) => `${item.name} ${item.categoryLabel} ${item.description}`.toLocaleLowerCase().includes(query));
    body.innerHTML = records.map((item) => {
      const hasDetails = Boolean(item.description || item.specifications.length);
      return `
        <tr>
          <td><div class="admin-table-item"><img class="admin-table-thumb" src="${escapeHtml(photoUrl(item.images[0]))}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.categoryLabel)}</small></span></div></td>
          <td><span class="admin-status ${hasDetails ? "admin-status--details" : "admin-status--pending"}">${hasDetails ? "Details listed" : "Name listed"}</span></td>
          <td><span class="admin-status admin-status--stock">${item.availability === "in_stock" ? "Available" : item.availability === "out_of_stock" ? "Unavailable" : "Status not listed"}</span></td>
          <td><div class="table-actions"><button type="button" class="icon-action" data-edit-product="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.name)}">Edit</button><button type="button" class="icon-action icon-action--danger" data-delete-product="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.name)}">Delete</button></div></td>
        </tr>`;
    }).join("");
    empty.hidden = records.length > 0;
  }

  renderRows();
  search?.addEventListener("input", renderRows);
  body.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-product]");
    if (edit) {
      showView("add");
      const item = PRODUCTS.find((product) => product.id === edit.dataset.editProduct);
      if (!item) return;
      document.querySelector("#product-name").value = item.name;
      document.querySelector("#product-category").value = item.categoryId;
      document.querySelector("#product-short").value = item.description;
      document.querySelector("#product-description").value = item.description;
      document.querySelector("#product-specs").value = item.specifications.map((spec) => `${spec.label}: ${spec.value}`).join("\n");
      document.querySelector("#product-availability").value = item.availability;
      document.querySelector("#admin-form-status").textContent = "";
      return;
    }
    if (event.target.closest("[data-delete-product]")) {
      document.querySelector("#delete-dialog")?.showModal();
    }
  });
}

function showView(name, navName = name) {
  document.querySelectorAll("[data-admin-view]").forEach((view) => {
    const active = view.dataset.adminView === name;
    view.hidden = !active;
    view.classList.toggle("is-visible", active);
  });
  document.querySelectorAll("[data-admin-nav]").forEach((link) => link.classList.toggle("is-active", link.dataset.adminNav === navName));
  if (name === "overview" || name === "products") window.location.hash = "overview";
  if (name === "add") window.location.hash = "add-product";
}

document.querySelectorAll("[data-admin-nav]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const selectedNav = link.dataset.adminNav;
    const destination = selectedNav === "products" ? "overview" : selectedNav;
    showView(destination, selectedNav);
    if (selectedNav === "products") document.querySelector("#products-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll("[data-open-add]").forEach((button) => button.addEventListener("click", () => {
  document.querySelector("#product-entry-form")?.reset();
  const status = document.querySelector("#admin-form-status");
  if (status) status.textContent = "";
  showView("add");
}));
document.querySelectorAll("[data-back-overview]").forEach((button) => button.addEventListener("click", () => showView("overview")));

document.querySelector("#product-entry-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#admin-form-status");
  if (!form.elements.productName.value.trim() || !form.elements.category.value) {
    status.textContent = "Enter a product name and choose a category.";
    form.elements.productName.focus();
    return;
  }
  status.textContent = "Preview only: product changes are not saved permanently.";
});

document.querySelector("[data-close-delete]")?.addEventListener("click", () => document.querySelector("#delete-dialog").close());
document.querySelector("#delete-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
