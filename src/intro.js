const key = "bon-voyage-intro-seen";
let seenThisPage = false;

export function shouldShowIntro() {
  if (seenThisPage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  for (const storage of ["localStorage", "sessionStorage"]) {
    try { if (window[storage].getItem(key)) return false; } catch { /* Storage can be restricted. */ }
  }
  return true;
}

export function markIntroSeen() {
  seenThisPage = true;
  for (const storage of ["localStorage", "sessionStorage"]) {
    try { window[storage].setItem(key, "1"); } catch { /* The intro still works without storage. */ }
  }
}
