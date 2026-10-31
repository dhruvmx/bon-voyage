export const SIDEBAR_MIN = 216;
export const SIDEBAR_MAX = 320;
const key = "bon-voyage-sidebar";

export function readSidebar() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* Use defaults. */ }
  return {
    collapsed: typeof saved?.collapsed === "boolean" ? saved.collapsed : window.matchMedia("(max-width: 1150px)").matches,
    width: Number.isFinite(saved?.width) ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, saved.width)) : SIDEBAR_MIN,
  };
}

export function applySidebar(preference) {
  document.documentElement.dataset.sidebarCollapsed = String(preference.collapsed);
  document.documentElement.style.setProperty("--sidebar-width", `${preference.collapsed ? 76 : preference.width}px`);
}

export function saveSidebar(preference) {
  applySidebar(preference);
  try { localStorage.setItem(key, JSON.stringify(preference)); } catch { /* Resizing still works for this session. */ }
}
