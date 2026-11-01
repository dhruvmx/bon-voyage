// Version requests by authentication lifecycle, including renewal for the same user.
let sessionVersion = 0;
export const getSessionVersion = () => sessionVersion;
const sessionActions = new Set(["/auth/login", "/auth/signup", "/auth/logout", "/auth/password"]);

export async function api(path, options = {}) {
  const requestSession = sessionVersion;
  let response;
  try {
    response = await fetch("/api" + path, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      "Cannot reach the Python backend. Check that the server is running and try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const staleSession = requestSession !== sessionVersion;
    if (response.status === 401 && !staleSession && !["/auth/login", "/auth/signup", "/auth/me"].includes(path)) {
      ++sessionVersion;
      window.dispatchEvent(new Event("bon-voyage-session-expired"));
    }
    const detail = data?.detail;
    const error = new Error(
      Array.isArray(detail)
        ? detail.map((x) => `${x.loc.at(-1)}: ${x.msg}`).join(" · ")
        : detail || `Request failed (${response.status}).`,
    );
    error.status = response.status;
    error.staleSession = staleSession;
    throw error;
  }
  if (sessionActions.has(path)) ++sessionVersion;
  return data;
}
export function download(data, filename = "bon-voyage.json") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

