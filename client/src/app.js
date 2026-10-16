const menuToggle = document.querySelector("[data-menu-toggle]");
const primaryNav = document.querySelector("[data-primary-nav]");

function setMenuOpen(open) {
  if (!menuToggle || !primaryNav) return;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.querySelector(".sr-only").textContent = open ? "Close navigation" : "Open navigation";
  primaryNav.classList.toggle("is-open", open);
}

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  setMenuOpen(!isOpen);
});

primaryNav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});

const year = document.querySelector("[data-current-year]");
if (year) year.textContent = String(new Date().getFullYear());

/* ---------------------------------------------------------
 * Floating Admin Navigation Bar (Active for logged-in admin)
 * --------------------------------------------------------- */
async function checkAdminSession() {
  try {
    const res = await fetch("/api/admin/session", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    if (data.authenticated) {
      const banner = document.createElement("aside");
      banner.id = "admin-quick-bar";
      banner.setAttribute("aria-label", "Administrator quick navigation");
      banner.innerHTML = `
        <div style="position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;align-items:center;gap:12px;background:#0369a1;color:#ffffff;padding:10px 16px;border-radius:9999px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);font-size:13px;font-family:system-ui,-apple-system,sans-serif;font-weight:600;">
          <span style="display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;"></span>
            <span>Admin Active</span>
          </span>
          <a href="${import.meta.env.BASE_URL}admin/dashboard.html" style="color:#ffffff;background:rgba(255,255,255,0.22);padding:5px 12px;border-radius:9999px;text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:4px;">
            Dashboard <span aria-hidden="true">↗</span>
          </a>
        </div>
      `;
      document.body.appendChild(banner);
    }
  } catch {
    // Offline or static mode; silent fallback
  }
}

if (!window.location.pathname.includes("/admin/")) {
  checkAdminSession();
}

