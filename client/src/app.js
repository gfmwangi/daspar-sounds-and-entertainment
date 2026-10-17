const menuToggle = document.querySelector("[data-menu-toggle]");
const primaryNav = document.querySelector("[data-primary-nav]");

function setMenuOpen(open) {
  if (!menuToggle || !primaryNav) return;
  menuToggle.setAttribute("aria-expanded", String(open));
  const label = menuToggle.querySelector(".sr-only");
  if (label) label.textContent = open ? "Close navigation" : "Open navigation";
  primaryNav.classList.toggle("is-open", open);
}

menuToggle?.addEventListener("click", () => setMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true"));
primaryNav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenuOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenuOpen(false);
});

const year = document.querySelector("[data-current-year]");
if (year) year.textContent = String(new Date().getFullYear());

async function showAdminReturnLink() {
  if (window.location.pathname.includes("/admin/")) return;
  try {
    const response = await fetch("/api/admin/session", { credentials: "include", cache: "no-store" });
    if (!response.ok) return;
    const session = await response.json();
    if (!session.authenticated) return;

    const notice = document.createElement("aside");
    notice.className = "admin-session-bar";
    notice.setAttribute("aria-label", "Administrator session navigation");
    const label = document.createElement("span");
    label.textContent = "Administrator session active";
    const link = document.createElement("a");
    link.href = `${import.meta.env.BASE_URL}admin/dashboard.html`;
    link.textContent = "Back to admin dashboard";
    notice.append(label, link);
    document.body.append(notice);
  } catch {
    // The public website remains usable when the backend is unavailable.
  }
}

showAdminReturnLink();
