import { useEffect, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth, GoogleAuthProvider, signInWithPopup, signOut,
  inMemoryPersistence, browserPopupRedirectResolver,
  multiFactor, getMultiFactorResolver, TotpMultiFactorGenerator,
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
  "auth/invalid-verification-code": "That code is invalid or expired. Try the current code from your authenticator.",
  "auth/code-expired": "That sign-in expired. Cancel and start Google sign-in again.",
  "auth/requires-recent-login": "Please start Google sign-in again before setting up your authenticator.",
};

export default function GoogleSignIn({ busy, setBusy, onSuccess, enrollFor = null }) {
  const [auth, setAuth] = useState(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState(false);
  const [resolver, setResolver] = useState(null);
  const [secret, setSecret] = useState(null);
  const [notice, setNotice] = useState("");
  const enrollmentUser = useRef(null);
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
    return () => {
      mounted.current = false; token.current = null; controller.abort();
      if (enrollmentUser.current && googleAuth) signOut(googleAuth).catch(() => {});
      enrollmentUser.current = null;
    };
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
    if (err.code === "auth/multi-factor-auth-required") {
      const next = getMultiFactorResolver(auth, err);
      if (next.hints.some((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID)) {
        setResolver(next); setError("");
      } else setError("This account needs a different verification method. Contact your administrator.");
    }
    else if (err.code === "mfa_verification_required") {
      setSecret(null); enrollmentUser.current = null;
      setNotice("Authenticator added. Select Finish enabling 2FA and sign in with Google again to verify your code."); setError("");
    }
    else if (err.code === "account_link_required") { setLink(true); setError(""); }
    else if (!["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(err.code)) {
      setError(messages[err.code] || (err.status ? err.message : "Google sign-in failed. Please try again."));
    }
  }
  async function complete(result) {
    token.current = await result.user.getIdToken(true);
    if (!mounted.current) return false;
    if (!enrollFor) { await exchange(); return false; }
    if (!multiFactor(result.user).enrolledFactors.some((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID)) {
      await api("/auth/google/mfa/check", { method: "POST", body: { id_token: token.current } });
      const session = await multiFactor(result.user).getSession();
      const nextSecret = await TotpMultiFactorGenerator.generateSecret(session);
      if (mounted.current) { enrollmentUser.current = result.user; setSecret(nextSecret); setResolver(null); }
      return mounted.current;
    }
    const account = await api("/auth/google/mfa/enable", { method: "POST", body: { id_token: token.current } });
    token.current = null;
    if (mounted.current) onSuccess(account);
    return false;
  }
  async function signIn() {
    if (!auth || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    let retainSession = false;
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      if (!mounted.current) return;
      retainSession = await complete(result);
    } catch (err) { showError(err); retainSession = err.code === "auth/multi-factor-auth-required"; }
    finally {
      // Firebase only proves identity; Bon Voyage's HttpOnly cookie owns the session.
      if (!retainSession) await signOut(auth).catch(() => {});
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <div className="google-signin">
    <button type="button" className="button secondary full" disabled={!auth || busy || !!secret || !!resolver} onClick={signIn}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4ZM12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22ZM6.4 13.7a6 6 0 0 1 0-3.4V7.7H3.1a10 10 0 0 0 0 8.6l3.3-2.6ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.7l3.3 2.6A5.9 5.9 0 0 1 12 6.1Z" /></svg>
      {enrollFor ? (notice ? "Finish enabling 2FA" : "Enable authenticator 2FA") : "Continue with Google"}
    </button>
    {notice && <p className="fine-print" role="status">{notice}</p>}
    {(resolver || secret) && <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy || inFlight.current) return;
      const code = String(new FormData(event.currentTarget).get("code") || "").trim();
      inFlight.current = true; setBusy(true); setError("");
      let retainSession = !!secret;
      try {
        if (secret) {
          await multiFactor(enrollmentUser.current).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), "Bon Voyage authenticator");
          const account = await api("/auth/google/mfa/enable", { method: "POST", body: { id_token: await enrollmentUser.current.getIdToken(true) } });
          retainSession = false;
          if (mounted.current) { setSecret(null); enrollmentUser.current = null; onSuccess(account); }
        } else {
          const factor = resolver.hints.find((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID);
          const result = await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(factor.uid, code));
          if (mounted.current) setResolver(null);
          retainSession = await complete(result);
        }
      } catch (err) { showError(err); if (err.code === "mfa_verification_required") retainSession = false; }
      finally {
        if (!retainSession) await signOut(auth).catch(() => {});
        inFlight.current = false; if (mounted.current) setBusy(false);
      }
    }}>
      {secret && <>
        <p className="fine-print">In Google Authenticator or another authenticator app, add a time-based account named Bon Voyage using this setup key. Keep this key private.</p>
        <label className="field"><span>Authenticator setup key</span><input readOnly value={secret.secretKey} autoComplete="off" spellCheck="false" /></label>
      </>}
      <label className="field"><span>Six-digit authenticator code</span><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength="6" maxLength="6" required disabled={busy} /></label>
      <button className="button full" disabled={busy}>{busy ? "Verifying…" : secret ? "Verify and enable 2FA" : "Verify code"}</button>
      <button type="button" className="small-button" disabled={busy} onClick={async () => {
        setResolver(null); setSecret(null); setError(""); token.current = null; enrollmentUser.current = null;
        await signOut(auth).catch(() => {});
      }}>Cancel verification</button>
    </form>}
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
    {!enrollFor && <p className="fine-print">Or continue with email</p>}
  </div>;
}
