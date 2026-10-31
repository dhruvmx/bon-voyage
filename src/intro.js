export function shouldShowIntro() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
