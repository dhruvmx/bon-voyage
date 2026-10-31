export async function api(path, options = {}) {
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
    const detail = data?.detail;
    const error = new Error(
      Array.isArray(detail)
        ? detail.map((x) => `${x.loc.at(-1)}: ${x.msg}`).join(" · ")
        : detail || `Request failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
export function download(data, filename = "tideway-voyage.json") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

