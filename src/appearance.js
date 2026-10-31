export const themes = [
  { id: "ocean", name: "Ocean", colors: ["#eaf3f5", "#397e91", "#183d4b"] },
  { id: "forest", name: "Forest", colors: ["#eef2e9", "#52734c", "#263b2b"] },
  { id: "walnut", name: "Walnut", colors: ["#f4ece3", "#8b6347", "#453326"] },
  { id: "sandstone", name: "Sandstone", colors: ["#f8f0e5", "#a25c3b", "#503c32"] },
  { id: "slate", name: "Slate", colors: ["#edf0f6", "#626d9d", "#30364e"] },
];
export const modes = ["light", "dark", "system"];
const storageKey = "bon-voyage-appearance";

export function readAppearance() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch { /* Storage may be unavailable or contain older data. */ }
  return {
    theme: themes.some((theme) => theme.id === saved?.theme) ? saved.theme : "ocean",
    mode: modes.includes(saved?.mode) ? saved.mode : "light",
  };
}

export function applyAppearance(preference) {
  const root = document.documentElement;
  root.dataset.theme = preference.theme;
  root.dataset.mode = preference.mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference.mode;
  const color = getComputedStyle(root).getPropertyValue("--background").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export function saveAppearance(preference) {
  applyAppearance(preference);
  try {
    localStorage.setItem(storageKey, JSON.stringify(preference));
  } catch { /* Keep the selection working for this session. */ }
}
