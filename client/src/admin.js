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
  const runtimeNote = document.querySelector("#admin-login-runtime-note");
  const setupLink = document.querySelector("#admin-setup-link-container");
  const onGitHubPages = window.location.hostname.toLowerCase().endsWith(".github.io");
  let backendAvailable = false;
  const loginControls = [...loginForm.querySelectorAll("input, button")];
  loginControls.forEach((control) => { control.disabled = true; });
  if (onGitHubPages) {
    if (runtimeNote) {
      runtimeNote.dataset.state = "unavailable";
      runtimeNote.textContent = "Admin sign-in is unavailable on GitHub Pages because it only hosts static files. No credentials have been submitted.";
    }
  } else {
    Promise.all([
      fetch("/api/admin/session", { credentials: "include", cache: "no-store" }),
      fetch("/api/admin/setup/status", { credentials: "include", cache: "no-store" }),
    ]).then(async ([sessionResponse, setupResponse]) => {
      if (!sessionResponse.ok || !setupResponse.ok) throw new Error("Sign-in service unavailable.");
      const [session, setup] = await Promise.all([sessionResponse.json(), setupResponse.json()]);
      backendAvailable = true;
      if (session.authenticated) {
        window.location.replace(`${import.meta.env.BASE_URL}admin/dashboard.html`);
        return;
      }
      if (!setup.setupComplete) {
        if (setupLink) setupLink.hidden = false;
        if (runtimeNote) runtimeNote.textContent = "No administrator account exists yet. Complete the one-time owner setup before signing in.";
        return;
      }
      loginControls.forEach((control) => { control.disabled = false; });
      if (runtimeNote) runtimeNote.textContent = "Sign-in service connected. Enter the administrator credentials to continue.";
    }).catch(() => {
      if (runtimeNote) {
        runtimeNote.dataset.state = "unavailable";
        runtimeNote.textContent = "The sign-in service is not available. Credential fields remain disabled; no password has been submitted.";
      }
    });
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (onGitHubPages || !backendAvailable) return;
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
        status.textContent = "Cannot reach the sign-in service. No sign-in was completed; please try again when the backend is available.";
        status.style.color = "#dc2626";
      }
    }
  });
}

/* One-time first-administrator setup. Public registration stays unavailable after first use. */
const setupForm = document.querySelector("#admin-setup-form");
if (setupForm) {
  const note = document.querySelector("#admin-setup-runtime-note");
  const status = document.querySelector("#admin-setup-message");
  const keyCard = document.querySelector("#setup-recovery-key-card");
  const keyValue = document.querySelector("#setup-recovery-key");
  const controls = [...setupForm.querySelectorAll("input, button")];
  const onGitHubPages = window.location.hostname.toLowerCase().endsWith(".github.io");
  controls.forEach((control) => { control.disabled = true; });

  if (onGitHubPages) {
    if (note) { note.dataset.state = "unavailable"; note.textContent = "One-time setup is unavailable on GitHub Pages because it only hosts static files. No credentials have been submitted."; }
  } else {
    fetch("/api/admin/setup/status", { credentials: "include", cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("The setup service is unavailable.");
      const setup = await response.json();
      if (setup.setupComplete) {
        window.location.replace(`${import.meta.env.BASE_URL}admin/login.html`);
        return;
      }
      controls.forEach((control) => { control.disabled = false; });
      if (note) note.textContent = "Setup is available for the first administrator only. After completion, this page will remain locked.";
    }).catch(() => {
      if (note) { note.dataset.state = "unavailable"; note.textContent = "The setup service is unavailable. Credential fields remain disabled; no details were submitted."; }
    });
  }

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (onGitHubPages || controls.some((control) => control.disabled)) return;
    const email = String(setupForm.elements.email.value || "").trim();
    const password = String(setupForm.elements.password.value || "");
    const confirmPassword = String(setupForm.elements.confirmPassword.value || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (status) status.textContent = "Enter a valid administrator email address."; return; }
    if (password.length < 12 || password.length > 128) { if (status) status.textContent = "Use a password between 12 and 128 characters."; return; }
    if (password !== confirmPassword) { if (status) status.textContent = "The passwords do not match."; return; }
    controls.forEach((control) => { control.disabled = true; });
    if (status) status.textContent = "Creating the first administrator account…";
    try {
      const response = await fetch("/api/admin/setup", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email, password, confirmPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "First-time setup could not be completed.");
      if (keyValue) keyValue.textContent = result.recoveryKey || "Sign in and open Account Settings to retrieve your recovery key.";
      setupForm.hidden = true;
      if (keyCard) keyCard.hidden = false;
      if (note) note.textContent = "Administrator setup is complete and permanently locked.";
      if (status) status.textContent = result.message || "Setup is complete. Save the emergency recovery key before continuing.";
    } catch (error) {
      if (status) status.textContent = error.message || "Setup failed. No account change was confirmed.";
      controls.forEach((control) => { control.disabled = false; });
    }
  });

  document.querySelector("[data-copy-setup-key]")?.addEventListener("click", async () => {
    const key = keyValue?.textContent || "";
    const copyStatus = document.querySelector("#setup-key-copy-status");
    try {
      if (!key.startsWith("DASPAR-")) throw new Error("Sign in and retrieve your key from Account Settings.");
      await navigator.clipboard.writeText(key);
      if (copyStatus) copyStatus.textContent = "Recovery key copied. Store it somewhere private.";
    } catch (error) {
      if (copyStatus) copyStatus.textContent = error.message || "Clipboard access failed. Select and copy the key manually.";
    }
  });
}

/* ---------------------------------------------------------
 * 2. Admin Dashboard Handler
 * --------------------------------------------------------- */
const body = document.querySelector("#admin-products-body");
if (body) {
  let liveProducts = [];
  let liveCategories = [];
  let liveInquiries = [];
  let targetDeleteId = null;

  const search = document.querySelector("#admin-search");
  const empty = document.querySelector("#admin-empty");
  const authStatus = document.querySelector("#admin-auth-status");
  const userNameEl = document.querySelector("#admin-user-name");
  const userAvatarEl = document.querySelector("#admin-user-avatar");
  const logoutBtn = document.querySelector("#admin-logout-button");
  const form = document.querySelector("#product-entry-form");
  const formStatus = document.querySelector("#admin-form-status");
  const editingIdInput = document.querySelector("#editing-product-id");
  const deleteDialog = document.querySelector("#delete-dialog");
  const confirmDeleteBtn = document.querySelector("#confirm-delete-button");
  const deleteDialogText = document.querySelector("#delete-dialog-text");
  const inquiriesBody = document.querySelector("#admin-inquiries-body");
  const inquiriesEmpty = document.querySelector("#admin-inquiries-empty");
  const currentEmailInput = document.querySelector("#admin-current-email");
  const emailForm = document.querySelector("#admin-email-form");
  const passwordForm = document.querySelector("#admin-password-form");
  const emailStatus = document.querySelector("#admin-email-status");
  const passwordStatus = document.querySelector("#admin-password-status");
  const recoveryKeyValue = document.querySelector("#admin-recovery-key-value");
  const recoveryKeyStatus = document.querySelector("#admin-recovery-key-status");
  const recoveryKeyViewForm = document.querySelector("#admin-recovery-key-view-form");
  const recoveryKeyRotateForm = document.querySelector("#admin-recovery-key-rotate-form");
  const recoveryKeyCopyButton = document.querySelector("[data-copy-dashboard-key]");
  const recoveryKeyHideButton = document.querySelector("[data-hide-dashboard-key]");

  // Populate category select dropdown
  const categorySelect = document.querySelector("#product-category");
  function showRecoveryKey(key) {
    if (recoveryKeyValue) recoveryKeyValue.textContent = key;
    if (recoveryKeyCopyButton) recoveryKeyCopyButton.disabled = false;
    if (recoveryKeyHideButton) recoveryKeyHideButton.disabled = false;
  }

  function hideRecoveryKey() {
    if (recoveryKeyValue) recoveryKeyValue.textContent = "Verify your current password below to view the recovery key.";
    if (recoveryKeyCopyButton) recoveryKeyCopyButton.disabled = true;
    if (recoveryKeyHideButton) recoveryKeyHideButton.disabled = true;
  }

  function updateCategoryDropdown(cats) {
    if (!categorySelect) return;
    categorySelect.innerHTML = '<option value="">Choose a category</option>' +
      cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join("");
  }
  updateCategoryDropdown(liveCategories);


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

  function renderInquiries() {
    if (!inquiriesBody) return;
    inquiriesBody.innerHTML = liveInquiries.map((item) => {
      const date = item.createdAt ? new Date(item.createdAt).toLocaleString() : "Date unavailable";
      const message = String(item.message || "");
      const safeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(item.email || "")) ? item.email : "";
      return `<tr><td>${escapeHtml(date)}</td><td><strong>${escapeHtml(item.name)}</strong><br><a href="mailto:${escapeHtml(safeEmail)}">${escapeHtml(safeEmail)}</a></td><td><strong>${escapeHtml(item.subject)}</strong><p class="admin-inquiry-message">${escapeHtml(message)}</p></td><td><a class="icon-action" href="mailto:${escapeHtml(safeEmail)}?subject=${encodeURIComponent(`Re: ${item.subject || "Website inquiry"}`)}">Reply by email</a></td></tr>`;
    }).join("");
    if (inquiriesEmpty) inquiriesEmpty.hidden = liveInquiries.length > 0;
  }

  // Load only verified administrator data; never fall back to public sample catalogue data.
  async function loadDashboardData() {
    const [prodsRes, catsRes, statsRes, inquiriesRes, accountRes] = await Promise.all([
      fetch("/api/admin/products", { credentials: "include", cache: "no-store" }),
      fetch("/api/public/categories", { cache: "no-store" }),
      fetch("/api/admin/stats", { credentials: "include", cache: "no-store" }),
      fetch("/api/admin/inquiries?limit=100", { credentials: "include", cache: "no-store" }),
      fetch("/api/admin/account", { credentials: "include", cache: "no-store" }),
    ]);
    if (prodsRes.status === 401 || statsRes.status === 401 || inquiriesRes.status === 401 || accountRes.status === 401) {
      window.location.replace(`${import.meta.env.BASE_URL}admin/login.html`);
      throw new Error("Your administrator session has expired. Please sign in again.");
    }
    if (!prodsRes.ok || !catsRes.ok || !statsRes.ok || !inquiriesRes.ok || !accountRes.ok) throw new Error("Protected dashboard data could not be loaded.");
    const [products, categories, stats, inquiries, account] = await Promise.all([prodsRes.json(), catsRes.json(), statsRes.json(), inquiriesRes.json(), accountRes.json()]);
    if (!Array.isArray(products) || !Array.isArray(categories) || !Array.isArray(inquiries) || !stats || !Number.isFinite(Number(stats.totalProducts)) || !account || typeof account.email !== "string") {
      throw new Error("The dashboard returned invalid data. Please contact support.");
    }
    liveProducts = products;
    liveCategories = categories;
    liveInquiries = inquiries;
    if (currentEmailInput) currentEmailInput.value = account.email;
    hideRecoveryKey();
    updateCategoryDropdown(liveCategories);
    const statProducts = document.querySelector("[data-stat-products]");
    const statStock = document.querySelector("[data-stat-stock]");
    const statPhotos = document.querySelector("[data-stat-photos]");
    if (statProducts) statProducts.textContent = String(stats.totalProducts);
    if (statStock) statStock.textContent = String(stats.inStock);
    if (statPhotos) statPhotos.textContent = String(stats.totalPhotos);
    renderRows();
    renderInquiries();
  }

  function showUnavailable(message) {
    document.body.classList.remove("admin-session-verified");
    if (authStatus) {
      authStatus.dataset.state = "unavailable";
      authStatus.textContent = message;
      authStatus.hidden = false;
      if (!authStatus.querySelector("a")) {
        const link = document.createElement("a");
        link.href = `${import.meta.env.BASE_URL}admin/login.html`;
        link.textContent = " Return to sign-in";
        authStatus.append(link);
      }
    }
  }

  // A dashboard is revealed only after the server confirms the session and protected data load.
  async function checkSession() {
    try {
      const res = await fetch("/api/admin/session", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("The authentication service is unavailable.");
      const data = await res.json();
      if (!data.authenticated) {
        window.location.replace(`${import.meta.env.BASE_URL}admin/login.html`);
        return;
      }
      if (userNameEl) userNameEl.textContent = data.user?.email || "Administrator";
      if (userAvatarEl) userAvatarEl.textContent = (data.user?.email?.[0] || "A").toUpperCase();
      await loadDashboardData();
      document.body.classList.add("admin-session-verified");
      if (authStatus) authStatus.hidden = true;
    } catch (error) {
      showUnavailable(error.message || "The backend could not verify administrator access. Dashboard data remains hidden.");
    }
  }

  checkSession();

  document.querySelector("[data-refresh-inquiries]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadDashboardData();
    } catch (error) {
      showUnavailable(error.message || "Customer inquiries could not be refreshed.");
    } finally {
      button.disabled = false;
    }
  });

  async function submitAccountChange(form, endpoint, status, payload) {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (status) { status.textContent = "Saving account change…"; status.style.color = "var(--color-primary, #0369a1)"; }
    try {
      const response = await fetch(endpoint, {
        method: endpoint.endsWith("/email") ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The account change could not be saved.");
      if (status) { status.textContent = `${result.message || "Account updated."} Redirecting to sign-in…`; status.style.color = "#15803d"; }
      form.reset();
      window.setTimeout(() => window.location.replace(`${import.meta.env.BASE_URL}admin/login.html`), 900);
    } catch (error) {
      if (status) { status.textContent = error.message || "The account change could not be saved."; status.style.color = "#dc2626"; }
      if (button) button.disabled = false;
    }
  }

  emailForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = String(emailForm.elements.email.value || "").trim();
    const currentPassword = String(emailForm.elements.currentPassword.value || "");
    if (!email || !currentPassword) { if (emailStatus) emailStatus.textContent = "Enter a new email address and your current password."; return; }
    submitAccountChange(emailForm, "/api/admin/account/email", emailStatus, { email, currentPassword });
  });

  passwordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const currentPassword = String(passwordForm.elements.currentPassword.value || "");
    const password = String(passwordForm.elements.password.value || "");
    const confirmPassword = String(passwordForm.elements.confirmPassword.value || "");
    if (!currentPassword || password.length < 12 || password.length > 128) { if (passwordStatus) passwordStatus.textContent = "Enter your current password and a new password between 12 and 128 characters."; return; }
    if (password !== confirmPassword) { if (passwordStatus) passwordStatus.textContent = "The new passwords do not match."; return; }
    submitAccountChange(passwordForm, "/api/admin/account/password", passwordStatus, { currentPassword, password, confirmPassword });
  });

  recoveryKeyViewForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = String(recoveryKeyViewForm.elements.currentPassword.value || "");
    const button = recoveryKeyViewForm.querySelector('button[type="submit"]');
    if (!currentPassword) { if (recoveryKeyStatus) recoveryKeyStatus.textContent = "Enter your current password to view the key."; return; }
    if (button) button.disabled = true;
    if (recoveryKeyStatus) recoveryKeyStatus.textContent = "Verifying your password…";
    try {
      const response = await fetch("/api/admin/account/recovery-key/view", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ currentPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.recoveryKey !== "string") throw new Error(result.error || "Recovery key verification failed.");
      showRecoveryKey(result.recoveryKey);
      recoveryKeyViewForm.reset();
      if (recoveryKeyStatus) { recoveryKeyStatus.textContent = result.message || "Password verified. Keep the recovery key private."; recoveryKeyStatus.style.color = "#15803d"; }
    } catch (error) {
      if (recoveryKeyStatus) { recoveryKeyStatus.textContent = error.message || "Recovery key verification failed."; recoveryKeyStatus.style.color = "#dc2626"; }
    } finally {
      if (button) button.disabled = false;
    }
  });

  recoveryKeyRotateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = String(recoveryKeyRotateForm.elements.currentPassword.value || "");
    const button = recoveryKeyRotateForm.querySelector('button[type="submit"]');
    if (!currentPassword) { if (recoveryKeyStatus) recoveryKeyStatus.textContent = "Enter your current password to create or rotate the key."; return; }
    if (button) button.disabled = true;
    if (recoveryKeyStatus) recoveryKeyStatus.textContent = "Creating a new recovery key…";
    try {
      const response = await fetch("/api/admin/account/recovery-key/rotate", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ currentPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Recovery key rotation failed.");
      showRecoveryKey(result.recoveryKey);
      recoveryKeyRotateForm.reset();
      recoveryKeyViewForm?.reset();
      if (recoveryKeyStatus) { recoveryKeyStatus.textContent = result.message || "Recovery key rotated. Store the new key privately."; recoveryKeyStatus.style.color = "#15803d"; }
    } catch (error) {
      if (recoveryKeyStatus) { recoveryKeyStatus.textContent = error.message || "Recovery key rotation failed."; recoveryKeyStatus.style.color = "#dc2626"; }
    } finally {
      if (button) button.disabled = false;
    }
  });

  recoveryKeyCopyButton?.addEventListener("click", async () => {
    const key = recoveryKeyValue?.textContent || "";
    try {
      if (!key.startsWith("DASPAR-")) throw new Error("Create a recovery key first by verifying your current password.");
      await navigator.clipboard.writeText(key);
      if (recoveryKeyStatus) { recoveryKeyStatus.textContent = "Recovery key copied. Keep it private."; recoveryKeyStatus.style.color = "#15803d"; }
    } catch (error) {
      if (recoveryKeyStatus) { recoveryKeyStatus.textContent = error.message || "Clipboard access failed. Select and copy the key manually."; recoveryKeyStatus.style.color = "#a16207"; }
    }
  });

  recoveryKeyHideButton?.addEventListener("click", () => {
    hideRecoveryKey();
    if (recoveryKeyStatus) recoveryKeyStatus.textContent = "Recovery key hidden.";
  });

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
        deleteDialogText.textContent = `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`;
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
        const deletionResult = await res.json().catch(() => ({}));
        liveProducts = liveProducts.filter((p) => p.id !== targetDeleteId);
        targetDeleteId = null;
        deleteDialog?.close();
        if (deletionResult.imageCleanupPending) {
          alert("The product was deleted, but one or more stored images remain queued for cleanup. The system will retry when image management runs again.");
        }
        try {
          await loadDashboardData();
        } catch {
          alert("The product was deleted, but the dashboard could not refresh. Reload the page to synchronize the latest data.");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to delete product.");
      }
    } catch {
      alert("Network error: Could not reach backend server.");
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.textContent = "Delete permanently";
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
      let photoUploadFailed = false;

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
      if (photoFiles && photoFiles.length > 0 && savedProduct?.id) {
        if (formStatus) formStatus.textContent = "Uploading product photos...";
        const formData = new FormData();
        for (let i = 0; i < photoFiles.length; i++) {
          formData.append("photos", photoFiles[i]);
        }

        const uploadRes = await fetch(`/api/admin/products/${encodeURIComponent(savedProduct.id)}/images`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!uploadRes.ok) {
          photoUploadFailed = true;
          await uploadRes.json().catch(() => ({}));
        }
      }

      if (formStatus) {
        formStatus.textContent = photoUploadFailed
          ? "Product details were saved, but photo upload failed. Check the image-storage setup and try the photos again."
          : "Product saved successfully.";
        formStatus.style.color = photoUploadFailed ? "#a16207" : "#15803d";
      }

      form.reset();
      if (editingIdInput) editingIdInput.value = "";
      document.querySelector("#add-title").textContent = "Add a product";

      try {
        await loadDashboardData();
        setTimeout(() => showView("overview"), 700);
      } catch {
        if (formStatus) {
          formStatus.textContent = photoUploadFailed
            ? "Product details were saved, but the photo upload or dashboard refresh needs attention. Reload the page before retrying."
            : "Product was saved successfully, but the dashboard could not refresh. Reload the page to verify it before retrying.";
          formStatus.style.color = "#a16207";
        }
      }
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
  if (name === "inquiries") window.location.hash = "inquiries";
  if (name === "account") window.location.hash = "account";
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

/* Emergency recovery-key reset, email-reset request, and one-time email reset forms. */
const emergencyRecoveryForm = document.querySelector("#admin-emergency-recovery-form");
if (emergencyRecoveryForm) {
  const status = document.querySelector("#admin-emergency-recovery-message");
  const controls = [...emergencyRecoveryForm.querySelectorAll("input, button")];
  const keyCard = document.querySelector("#replacement-recovery-key-card");
  const keyValue = document.querySelector("#replacement-recovery-key");
  const onGitHubPages = window.location.hostname.toLowerCase().endsWith(".github.io");
  controls.forEach((control) => { control.disabled = true; });
  if (onGitHubPages) {
    if (status) status.textContent = "Emergency recovery is unavailable on GitHub Pages. No details have been submitted.";
  } else {
    fetch("/api/admin/setup/status", { credentials: "include", cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Recovery service unavailable.");
      const setup = await response.json();
      if (!setup.setupComplete) {
        if (status) status.textContent = "No administrator has been set up yet. Complete first-time setup from the sign-in page.";
        return;
      }
      controls.forEach((control) => { control.disabled = false; });
      if (status) status.textContent = "Enter the owner email, saved recovery key, and a new password.";
    }).catch(() => {
      if (status) status.textContent = "The recovery service is unavailable. No email, key, or password has been submitted.";
    });
  }

  emergencyRecoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (onGitHubPages || controls.some((control) => control.disabled)) return;
    const email = String(emergencyRecoveryForm.elements.email.value || "").trim();
    const recoveryKey = String(emergencyRecoveryForm.elements.recoveryKey.value || "").trim();
    const password = String(emergencyRecoveryForm.elements.password.value || "");
    const confirmPassword = String(emergencyRecoveryForm.elements.confirmPassword.value || "");
    if (!email || !recoveryKey) { if (status) status.textContent = "Enter the administrator email and emergency recovery key."; return; }
    if (password.length < 12 || password.length > 128) { if (status) status.textContent = "Use a password between 12 and 128 characters."; return; }
    if (password !== confirmPassword) { if (status) status.textContent = "The new passwords do not match."; return; }
    controls.forEach((control) => { control.disabled = true; });
    if (status) status.textContent = "Verifying recovery details and updating password…";
    try {
      const response = await fetch("/api/admin/recovery-key/reset", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email, recoveryKey, password, confirmPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Emergency recovery failed. No password change was confirmed.");
      if (keyValue) keyValue.textContent = result.recoveryKey || "Sign in and retrieve the replacement key in Account Settings.";
      emergencyRecoveryForm.hidden = true;
      if (keyCard) keyCard.hidden = false;
      if (status) status.textContent = result.message || "Password updated and prior sessions signed out.";
    } catch (error) {
      if (status) status.textContent = error.message || "Emergency recovery failed. No password change was confirmed.";
      controls.forEach((control) => { control.disabled = false; });
    }
  });

  document.querySelector("[data-copy-replacement-key]")?.addEventListener("click", async () => {
    const key = keyValue?.textContent || "";
    const copyStatus = document.querySelector("#replacement-key-copy-status");
    try {
      if (!key.startsWith("DASPAR-")) throw new Error("Sign in and retrieve the key from Account Settings.");
      await navigator.clipboard.writeText(key);
      if (copyStatus) copyStatus.textContent = "Replacement key copied. Keep it private.";
    } catch (error) {
      if (copyStatus) copyStatus.textContent = error.message || "Clipboard access failed. Select and copy the key manually.";
    }
  });
}

const recoveryForm = document.querySelector("#admin-password-reset-request");
if (recoveryForm) {
  const status = document.querySelector("#admin-recovery-message");
  const button = recoveryForm.querySelector("button[type=submit]");
  const onGitHubPages = window.location.hostname.toLowerCase().endsWith(".github.io");
  const recoveryControls = [...recoveryForm.querySelectorAll("input, button")];
  recoveryControls.forEach((control) => { control.disabled = true; });
  if (onGitHubPages) {
    if (status) status.textContent = "Password recovery is unavailable on GitHub Pages. No email address was submitted.";
  } else {
    fetch("/api/admin/session", { credentials: "include", cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Recovery service unavailable.");
      recoveryControls.forEach((control) => { control.disabled = false; });
      if (status) status.textContent = "Enter the administrator email to request a one-time reset link.";
    }).catch(() => {
      if (status) status.textContent = "The recovery service is not available. No email address was submitted.";
    });
  }
  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (onGitHubPages || recoveryControls.some((control) => control.disabled)) return;
    const email = String(recoveryForm.elements.email.value || "").trim();
    if (!email) { if (status) status.textContent = "Enter the administrator email address."; return; }
    if (status) status.textContent = "Requesting recovery instructions…";
    if (button) button.disabled = true;
    try {
      const response = await fetch("/api/admin/password-reset/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Password recovery is unavailable. No password was changed.");
      if (status) status.textContent = result.message || "If this address belongs to the administrator, check its inbox for a one-time link.";
      recoveryForm.reset();
    } catch (error) {
      if (status) status.textContent = error.message || "Password recovery failed. No password was changed.";
    } finally {
      if (button) button.disabled = false;
    }
  });
}

const resetForm = document.querySelector("#admin-password-reset-form");
if (resetForm) {
  const status = document.querySelector("#admin-reset-message");
  const button = resetForm.querySelector("button[type=submit]");
  const onGitHubPages = window.location.hostname.toLowerCase().endsWith(".github.io");
  const resetControls = [...resetForm.querySelectorAll("input, button")];
  resetControls.forEach((control) => { control.disabled = true; });
  const token = new URLSearchParams(window.location.search).get("token") || "";
  if (!token && status) status.textContent = "This reset link is missing its one-time token. Request a new link.";
  if (onGitHubPages) {
    if (status) status.textContent = "Password reset is unavailable on GitHub Pages. No new password has been submitted.";
  } else {
    fetch("/api/admin/session", { credentials: "include", cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Reset service unavailable.");
      resetControls.forEach((control) => { control.disabled = false; });
    }).catch(() => {
      if (status) status.textContent = "The password-reset service is unavailable. No new password has been submitted.";
    });
  }
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (onGitHubPages || resetControls.some((control) => control.disabled)) return;
    const password = String(resetForm.elements.password.value || "");
    const confirmPassword = String(resetForm.elements.confirmPassword.value || "");
    if (!token) { if (status) status.textContent = "This reset link is invalid. Request a new link."; return; }
    if (password.length < 12 || password.length > 128) { if (status) status.textContent = "Use a password between 12 and 128 characters."; return; }
    if (password !== confirmPassword) { if (status) status.textContent = "The passwords do not match."; return; }
    if (status) status.textContent = "Updating password…";
    if (button) button.disabled = true;
    try {
      const response = await fetch("/api/admin/password-reset/complete", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Password reset failed.");
      if (status) status.textContent = result.message || "Password updated. Sign in using your new password.";
      resetForm.reset();
    } catch (error) {
      if (status) status.textContent = error.message || "Password reset failed. Request a new link if this one has expired.";
    } finally {
      if (button) button.disabled = false;
    }
  });
}
