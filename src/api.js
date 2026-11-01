import { saveVoyagePdf } from './voyagePdf.js';

// Version requests by authentication lifecycle, including renewal for the same user.
let sessionVersion = 0;
export const getSessionVersion = () => sessionVersion;
const sessionActions = new Set(["/auth/login", "/auth/signup", "/auth/google", "/auth/google/mfa/enable", "/auth/logout", "/auth/password"]);

export async function api(path, options = {}) {
  const requestSession = sessionVersion;
  const method = (options.method || "GET").toUpperCase();
  // Bound reads and stateless planning. Never automatically retry a write:
  // a lost response can still belong to a successfully committed operation.
  const { timeoutMs = method === "GET" || path === "/plan" ? 30000 : 0, signal, ...request } = options;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; cancel(); }, timeoutMs) : null;
  const transportError = () => new Error(timedOut
    ? "The request timed out. Please try again."
    : controller.signal.aborted ? "Request cancelled."
      : "Cannot reach the Python backend. Check that the server is running and try again.");
  try {
    let response;
    try {
      response = await fetch("/api" + path, {
        credentials: "same-origin", ...request, signal: controller.signal,
        headers: { "Content-Type": "application/json", ...request.headers },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
    } catch { throw transportError(); }
    let data;
    try { data = await response.json(); }
    catch {
      if (controller.signal.aborted) throw transportError();
      data = null;
    }
    if (!response.ok) {
      const staleSession = requestSession !== sessionVersion;
      if (response.status === 401 && !staleSession && !["/auth/login", "/auth/signup", "/auth/google", "/auth/google/mfa/check", "/auth/google/mfa/enable", "/auth/me"].includes(path)) {
        ++sessionVersion;
        window.dispatchEvent(new Event("bon-voyage-session-expired"));
      }
      const detail = data?.detail;
      const error = new Error(Array.isArray(detail)
        ? detail.map((x) => `${x.loc.at(-1)}: ${x.msg}`).join(" · ")
        : (typeof detail === "object" ? detail?.message : detail) || `Request failed (${response.status}).`);
      error.status = response.status;
      error.code = typeof detail === "object" && !Array.isArray(detail) ? detail?.code : undefined;
      error.staleSession = staleSession;
      throw error;
    }
    if (data === null || typeof data !== "object") {
      throw new Error("The server returned an invalid response. Please try again.");
    }
    if (sessionActions.has(path)) ++sessionVersion;
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function download(data) {
  saveVoyagePdf(data);
}
