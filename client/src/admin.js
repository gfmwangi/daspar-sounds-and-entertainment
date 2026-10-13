import { PRODUCT_CATEGORIES, PRODUCTS } from "./data/products.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

const photoUrl = (file = "") => {
  if (!file) return `${import.meta.env.BASE_URL}assets/logo/logo-1.jpeg`;
  if (file.startsWith("http://") || file.startsWith("https://") || file.startsWith("/")) return file;
  return `${import.meta.env.BASE_URL}assets/products/${encodeURIComponent(file)}`;
};

/* ---------------------------------------------------------
 * 1. Admin Sign-in Page Handler
 * --------------------------------------------------------- */
const loginForm = document.querySelector("#admin-login-form");
if (loginForm) {
  const status = document.querySelector("#admin-login-message");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = loginForm.elements.email?.value.trim();
    const password = loginForm.elements.password?.value;

    if (!email || !password) {
      if (status) status.textContent = "Please provide both email address and password.";
      return;
    }

    if (status) {
      status.textContent = "Signing in...";
      status.style.color = "var(--color-primary, #0369a1)";
    }

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.authenticated) {
        if (status) status.textContent = "Sign-in successful. Loading dashboard...";
        window.location.href = `${import.meta.env.BASE_URL}admin/dashboard.html`;
      } else {
        if (status) {
          status.textContent = result.message || result.error || "Invalid email or password.";
          status.style.color = "#dc2626";
        }
      }
    } catch {
      if (status) {
        status.textContent = "Cannot connect to backend server. Ensure backend is running on port 5000.";
        status.style.color = "#dc2626";
      }
    }
  });
}

/* ---------------------------------------------------------
 * 2. Admin Dashboard Handler
 * --------------------------------------------------------- */
const body = document.querySelector("#admin-products-body");
if (body) {
  let liveProducts = [...PRODUCTS];
  let liveCategories = [...PRODUCT_CATEGORIES];
  let targetDeleteId = null;

  const search = document.querySelector("#admin-search");
  const empty = document.querySelector("#admin-empty");
  const statusBanner = document.querySelector("#admin-prototype-banner");
  const userNameEl = document.querySelector("#admin-user-name");
  const userAvatarEl = document.querySelector("#admin-user-avatar");
  const logoutBtn = document.querySelector("#admin-logout-button");
  const form = document.querySelector("#product-entry-form");
  const formStatus = document.querySelector("#admin-form-status");
  const editingIdInput = document.querySelector("#editing-product-id");
  const deleteDialog = document.querySelector("#delete-dialog");
  const confirmDeleteBtn = document.querySelector("#confirm-delete-button");
  const closeDeleteBtn = document.querySelector("[data-close-delete]");
  const deleteDialogText = document.querySelector("#delete-dialog-text");
  closeDeleteBtn?.addEventListener("click", () => {
    targetDeleteId = null;
    deleteDialog?.close();
  });

  // Populate category select dropdown
  const categorySelect = document.querySelector("#product-category");
  function updateCategoryDropdown(cats) {
    if (!categorySelect) return;
    categorySelect.innerHTML = '<option value="">Choose a category</option>' +
      cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join("");
  }
  updateCategoryDropdown(liveCategories);

  function updateMetrics(products) {
    const uniquePhotos = new Set(products.flatMap((item) => item.images || []));
    const statProducts = document.querySelector("[data-stat-products]");
    const statStock = document.querySelector("[data-stat-stock]");
    const statPhotos = document.querySelector("[data-stat-photos]");
    if (statProducts) statProducts.textContent = String(products.length);
    if (statStock) statStock.textContent = String(products.filter((item) => item.availability === "in_stock").length);
    if (statPhotos) statPhotos.textContent = String(uniquePhotos.size);
  }

  function renderRows() {
    const query = (search?.value || "").trim().toLocaleLowerCase();
    const records = liveProducts.filter((item) =>
      `${item.name} ${item.categoryLabel} ${item.description || ""}`.toLocaleLowerCase().includes(query)
    );

    body.innerHTML = records.map((item) => {
      const hasDetails = Boolean(item.description || (item.specifications && item.specifications.length));
      const firstImage = (item.images && item.images[0]) || "";
      return `
        <tr>
          <td><div class="admin-table-item"><img class="admin-table-thumb" src="${escapeHtml(photoUrl(firstImage))}" alt="" loading="lazy" decoding="async"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.categoryLabel)}</small></span></div></td>
          <td><span class="admin-status ${hasDetails ? "admin-status--details" : "admin-status--pending"}">${hasDetails ? "Details listed" : "Name listed"}</span></td>
          <td><span class="admin-status admin-status--stock">${item.availability === "in_stock" ? "Available" : item.availability === "out_of_stock" ? "Unavailable" : "Status not listed"}</span></td>
          <td><div class="table-actions"><button type="button" class="icon-action" data-edit-product="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.name)}">Edit</button><button type="button" class="icon-action icon-action--danger" data-delete-product="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.name)}">Delete</button></div></td>
        </tr>`;
    }).join("");

    if (empty) empty.hidden = records.length > 0;
  }

  // Load live data from the backend
  async function loadDashboardData() {
    try {
      const [prodsRes, catsRes, statsRes] = await Promise.all([
        fetch("/api/admin/products", { credentials: "include" }),
        fetch("/api/public/categories"),
        fetch("/api/admin/stats", { credentials: "include" }),
      ]);

      if (prodsRes.ok) {
        liveProducts = await prodsRes.json();
      }
      if (catsRes.ok) {
        liveCategories = await catsRes.json();
        updateCategoryDropdown(liveCategories);
      }
      if (statsRes.ok) {
        const stats = await statsRes.json();
        const statProducts = document.querySelector("[data-stat-products]");
        const statStock = document.querySelector("[data-stat-stock]");
        const statPhotos = document.querySelector("[data-stat-photos]");
        if (statProducts) statProducts.textContent = String(stats.totalProducts);
        if (statStock) statStock.textContent = String(stats.inStock);
        if (statPhotos) statPhotos.textContent = String(stats.totalPhotos);
      } else {
        updateMetrics(liveProducts);
      }

      renderRows();
    } catch {
      updateMetrics(liveProducts);
      renderRows();
    }
  }

  // Check administrator session on page load
  async function checkSession() {
    try {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (data.authenticated) {
        if (userNameEl) userNameEl.textContent = data.user?.email || "Administrator";
        if (userAvatarEl) userAvatarEl.textContent = (data.user?.email?.[0] || "A").toUpperCase();
        if (statusBanner) {
          statusBanner.className = "admin-prototype-banner";
          statusBanner.style.background = "#0284c7";
          statusBanner.style.color = "#ffffff";
          statusBanner.style.borderColor = "#0369a1";
          statusBanner.innerHTML = `<strong>Local review backend connected.</strong> Signed in as <code>${escapeHtml(data.user?.email)}</code>. Changes are stored in a local JSON file only; the live GitHub Pages site is unchanged.`;
        }
        await loadDashboardData();
      } else {
        // Not authenticated; redirect to login
        window.location.href = `${import.meta.env.BASE_URL}admin/login.html`;
      }
    } catch {
      // Backend not running; leave visual preview intact
      renderRows();
      updateMetrics(liveProducts);
    }
  }

  checkSession();

  // Search filter
  search?.addEventListener("input", renderRows);

  // Sign out button
  logoutBtn?.addEventListener("click", async () => {
    try {
      await fetch("/api/admin/session", { method: "DELETE", credentials: "include" });
    } finally {
      window.location.href = `${import.meta.env.BASE_URL}admin/login.html`;
    }
  });

  // Table edit & delete handlers
  body.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-product]");
    if (edit) {
      const item = liveProducts.find((product) => product.id === edit.dataset.editProduct);
      if (!item) return;

      showView("add");
      document.querySelector("#add-title").textContent = `Edit Product: ${item.name}`;
      if (editingIdInput) editingIdInput.value = item.id;
      document.querySelector("#product-name").value = item.name;
      document.querySelector("#product-category").value = item.categoryId;
      document.querySelector("#product-short").value = item.description || "";
      document.querySelector("#product-description").value = item.description || "";
      document.querySelector("#product-specs").value = (item.specifications || [])
        .map((spec) => `${spec.label}: ${spec.value}`)
        .join("\n");
      document.querySelector("#product-availability").value = item.availability;
      if (formStatus) formStatus.textContent = "";
      return;
    }

    const del = event.target.closest("[data-delete-product]");
    if (del) {
      targetDeleteId = del.dataset.deleteProduct;
      const item = liveProducts.find((p) => p.id === targetDeleteId);
      if (deleteDialogText && item) {
        deleteDialogText.textContent = `Remove "${item.name}" from the local review store? This will not change the live GitHub Pages site.`;
      }
      deleteDialog?.showModal();
    }
  });

  // Confirm delete handler
  confirmDeleteBtn?.addEventListener("click", async () => {
    if (!targetDeleteId) return;
    try {
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.textContent = "Deleting...";

      const res = await fetch(`/api/admin/products/${encodeURIComponent(targetDeleteId)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        liveProducts = liveProducts.filter((p) => p.id !== targetDeleteId);
        targetDeleteId = null;
        deleteDialog?.close();
        await loadDashboardData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to delete product.");
      }
    } catch {
      alert("Network error: Could not reach backend server.");
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.textContent = "Delete from local store";
    }
  });

  // Form submit handler (Create / Update product + Photo upload)
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const editingId = editingIdInput?.value.trim();
    const productName = form.elements.productName.value.trim();
    const categoryId = form.elements.category.value;
    const description = form.elements.description.value.trim() || form.elements.shortDescription.value.trim();
    const specsRaw = form.elements.specifications.value.trim();
    const availability = form.elements.availability.value;
    const photoFiles = form.elements.photos?.files;

    if (!productName || !categoryId) {
      if (formStatus) {
        formStatus.textContent = "Product name and category are required.";
        formStatus.style.color = "#dc2626";
      }
      form.elements.productName.focus();
      return;
    }

    // Parse specifications textarea (lines with "Label: Value" or just "Feature")
    const specifications = specsRaw
      ? specsRaw
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const colonIdx = line.indexOf(":");
            if (colonIdx > 0) {
              return { label: line.slice(0, colonIdx).trim(), value: line.slice(colonIdx + 1).trim() };
            }
            return { label: "Feature", value: line };
          })
      : [];

    if (formStatus) {
      formStatus.textContent = editingId ? "Updating product..." : "Creating product...";
      formStatus.style.color = "var(--color-primary, #0369a1)";
    }

    try {
      let savedProduct = null;

      if (editingId) {
        // Update existing product
        const patchRes = await fetch(`/api/admin/products/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: productName,
            categoryId,
            description,
            specifications,
            availability,
          }),
        });

        if (!patchRes.ok) {
          const err = await patchRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update product.");
        }
        savedProduct = await patchRes.json();
      } else {
        // Create new product
        const postRes = await fetch("/api/admin/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: productName,
            categoryId,
            description,
            specifications,
            availability,
            images: [],
          }),
        });

        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create product.");
        }
        savedProduct = await postRes.json();
      }

      // Handle photo uploads if any were selected
      let photoUploadFailed = false;
      if (photoFiles && photoFiles.length > 0 && savedProduct?.id) {
        if (formStatus) formStatus.textContent = "Uploading product photos...";
        const formData = new FormData();
        for (let i = 0; i < photoFiles.length; i++) {
          formData.append("photos", photoFiles[i]);
        }

        try {
          const uploadRes = await fetch(`/api/admin/products/${encodeURIComponent(savedProduct.id)}/images`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          photoUploadFailed = !uploadRes.ok;
        } catch {
          photoUploadFailed = true;
        }
      }

      if (formStatus) {
        formStatus.textContent = photoUploadFailed
          ? "Product saved to the local review store, but one or more photos could not be uploaded. The live site is unchanged."
          : "Product saved to the local review store. The live site is unchanged.";
        formStatus.style.color = photoUploadFailed ? "#b45309" : "#15803d";
      }

      form.reset();
      if (editingIdInput) editingIdInput.value = "";
      document.querySelector("#add-title").textContent = "Add a product";

      await loadDashboardData();
      setTimeout(() => {
        showView("overview");
      }, 700);
    } catch (error) {
      if (formStatus) {
        formStatus.textContent = error.message || "Failed to save product.";
        formStatus.style.color = "#dc2626";
      }
    }
  });
}

/* ---------------------------------------------------------
 * 3. View Switcher & Modal Handlers
 * --------------------------------------------------------- */
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
  const form = document.querySelector("#product-entry-form");
  form?.reset();
  const editingIdInput = document.querySelector("#editing-product-id");
  if (editingIdInput) editingIdInput.value = "";
  const title = document.querySelector("#add-title");
  if (title) title.textContent = "Add a product";
  const status = document.querySelector("#admin-form-status");
  if (status) status.textContent = "";
  showView("add");
}));

document.querySelectorAll("[data-back-overview]").forEach((button) => button.addEventListener("click", () => showView("overview")));
document.querySelector("[data-close-delete]")?.addEventListener("click", () => document.querySelector("#delete-dialog")?.close());
document.querySelector("#delete-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
