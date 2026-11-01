# Google sign-in with Firebase


Bon Voyage supports Google login/signup through Firebase Authentication alongside existing email/password accounts. Firebase proves Google identity; Python verifies the signed ID token's signature, expiry, audience, issuer, Google provider and verified email, then issues the existing seven-day HttpOnly Bon Voyage session cookie. Voyages and fleet records stay in the existing database. Firebase tokens are kept only in memory during sign-in.

1. Create a Firebase project and register a web app. Enable **Authentication → Sign-in method → Google**, with a public app name and support email.
2. Under **Authentication → Settings → Authorized domains**, add `bon-voyage-eight.vercel.app` and any other deployed hostname you use. Add `localhost` and `127.0.0.1` for local development if needed. Preview hostnames must be explicitly authorized; wildcards are not supported.
3. Copy `.env.example` to `.env` locally and enter the Firebase web app's `apiKey`, `authDomain`, `projectId` and `appId` in the corresponding `FIREBASE_*` variables. Set the same four variables in Vercel and redeploy. These are public web configuration values, not service-account credentials; never add private keys to the browser or repository.
4. Run `python run.py`. Both **Log in** and **Sign up** offer **Continue with Google**. Existing password accounts must enter their current Bon Voyage password once to link Google; matching email alone never links an account. Later Google logins reopen the same workspace. Google-only accounts manage their password through Google.

If Firebase configuration is missing, email/password login remains available and the Google button reports unavailability. The SDK uses popup login to avoid cross-origin redirect-storage issues on Vercel. Allow popups for the site or open it in a regular browser if an embedded browser blocks Google OAuth. Logging out clears the Bon Voyage session; Firebase browser persistence is disabled.

Authentication checks: `python -m unittest backend.test_firebase_auth -v`. Tests use isolated databases and disposable signing keys; they never create live Google accounts.

## Authenticator-app 2FA

Upgrade Firebase Authentication to Identity Platform (Spark remains free, with a 3,000 daily-active-user limit) and enable TOTP in the project's MFA provider configuration. SMS is not needed. In Profile → Account security, select **Enable authenticator 2FA**, confirm the same Google account, add the displayed setup key as a time-based account in an authenticator app, and verify its six-digit code. If Firebase requires a fresh MFA sign-in after enrollment, select **Finish enabling 2FA** and complete Google sign-in and the code prompt once more.

Firebase generates and verifies all authenticator secrets/codes. Python stores only an enforcement flag and checks Firebase's signed `sign_in_second_factor: totp` claim before issuing a protected account's session. Enabling 2FA revokes older Bon Voyage sessions. Local password sign-in cannot bypass an enabled factor. A Firebase enrollment alone is not reported as fully enabled in Bon Voyage until a signed MFA token has been verified. No authenticator secret or code is stored in Bon Voyage's database.

After enrollment, Google sign-in prompts for the authenticator code. Keep the authenticator accessible: recovery requires the Firebase project administrator to verify the account owner, remove the lost Firebase factor, clear the account's `user_security.totp_required` flag and revoke all application sessions. There is no automatic email/password fallback or self-service disable flow.

