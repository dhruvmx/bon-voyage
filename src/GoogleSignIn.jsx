import { useEffect, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth, GoogleAuthProvider, signInWithPopup, signOut,
  inMemoryPersistence, browserPopupRedirectResolver,
} from "firebase/auth";
import { api } from "./api";

let googleAuth;
function configure(config) {
  if (!googleAuth) {
    const app = getApps().find((item) => item.name === "bon-voyage-google")
      || initializeApp(config, "bon-voyage-google");
    googleAuth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  return googleAuth;
}

const messages = {
  "auth/popup-blocked": "Your browser blocked Google sign-in. Allow popups for this site and try again.",
  "auth/network-request-failed": "Google sign-in could not connect. Check your connection and try again.",
  "auth/unauthorized-domain": "Google sign-in is unavailable on this address. Please use the main Bon Voyage website.",
  "auth/operation-not-allowed": "Google sign-in is currently unavailable. Please use email and password.",
};

export default function GoogleSignIn({ busy, setBusy, onSuccess }) {
  const [auth, setAuth] = useState(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState(false);
  const token = useRef(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    api("/auth/config", { signal: controller.signal }).then(({ google }) => {
      if (!mounted.current) return;
      if (google?.enabled) setAuth(configure(google.config));
      else setError("Google sign-in is currently unavailable. You can use email and password.");
    }).catch(() => {
      if (mounted.current && !controller.signal.aborted) setError("Google sign-in could not load. You can use email and password.");
    });
    return () => { mounted.current = false; token.current = null; controller.abort(); };
  }, []);

  async function exchange(password) {
    const user = await api("/auth/google", {
      method: "POST", body: { id_token: token.current, ...(password ? { password } : {}) },
    });
    token.current = null;
    if (mounted.current) onSuccess(user);
  }
  function showError(err) {
    if (!mounted.current) return;
    if (err.code === "account_link_required") { setLink(true); setError(""); }
    else if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code)) {
      setError(messages[err.code] || (err.status ? err.message : "Google sign-in failed. Please try again."));
    }
  }
  async function signIn() {
    if (!auth || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      if (!mounted.current) return;
      token.current = await result.user.getIdToken();
      if (mounted.current) await exchange();
    } catch (err) { showError(err); }
    finally {
      // Firebase only proves identity; Bon Voyage's HttpOnly cookie owns the session.
      await signOut(auth).catch(() => {});
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <div className="google-signin">
    <button type="button" className="button secondary full" disabled={!auth || busy} onClick={signIn}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4ZM12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22ZM6.4 13.7a6 6 0 0 1 0-3.4V7.7H3.1a10 10 0 0 0 0 8.6l3.3-2.6ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.7l3.3 2.6A5.9 5.9 0 0 1 12 6.1Z" /></svg>
      Continue with Google
    </button>
    {link && <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy || inFlight.current) return;
      const password = new FormData(event.currentTarget).get("password");
      inFlight.current = true; setBusy(true); setError("");
      try { await exchange(password); }
      catch (err) { showError(err); }
      finally { inFlight.current = false; if (mounted.current) setBusy(false); }
    }}>
      <p className="fine-print">An account already uses your Google email. Enter its Bon Voyage password once to connect Google and keep your saved voyages.</p>
      <label className="field"><span>Existing account password</span><input name="password" type="password" autoComplete="current-password" required maxLength="128" disabled={busy} /></label>
      <button className="button full" disabled={busy}>Connect Google account</button>
      <button type="button" className="small-button" disabled={busy} onClick={() => { token.current = null; setLink(false); setError(""); }}>Cancel linking</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    <p className="fine-print">Or continue with email</p>
  </div>;
}
