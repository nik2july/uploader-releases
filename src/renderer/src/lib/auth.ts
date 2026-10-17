import {
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
} from 'firebase/auth';
import app from './firebase';

/**
 * Shadow email/password authentication.
 *
 * The studio identifies people by phone number and password, not email, and phone-OTP
 * sign-in turned out to need Firebase's paid Blaze plan just to send an SMS. This
 * gives every phone+password login a *real* Firebase account and uid — the only thing
 * Firestore security rules can check — without SMS, without billing, and without
 * changing what anyone types in.
 *
 * A synthetic address is derived from the phone number (`919888928886@…`) purely as
 * an account key; no email is ever sent, read, or shown anywhere. `ensureShadowAccount`
 * signs in if the account exists, silently creates it on first use otherwise, so the
 * studio never sees a migration step — each account appears the first time that
 * person logs in after this ships.
 */

export const auth = getAuth(app);

const SHADOW_EMAIL_DOMAIN = 'baawaray-auth.internal';

/** Turns comparable phone digits into the synthetic account key. Never displayed. */
export function shadowEmailFor(phoneDigits: string): string {
  return `${phoneDigits}@${SHADOW_EMAIL_DOMAIN}`;
}

/**
 * Comparable form of a phone number, for matching a Firebase identity to a studio
 * record.
 *
 * Records were entered by hand and are inconsistent: crew are stored bare
 * ("6284427987") while clients are a mix of E.164 ("+919822233445"), a German number,
 * and more bare digits. Reducing to the last ten digits bridges the formats without
 * assuming every number is Indian.
 */
export function phoneKey(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Firebase rejects passwords under 6 characters; several seeded studio passwords are shorter. */
export function shadowPassword(rawPassword: string): string {
  const pad = '000000';
  return rawPassword.length >= 6 ? rawPassword : rawPassword + pad.slice(rawPassword.length);
}

/**
 * Sign in to the shadow account for this phone+password, creating it on first use.
 *
 * Called only after the studio's own phone+password check has already succeeded, so a
 * create here mirrors a credential just proven correct — it does not grant access on
 * its own, and cannot be used to probe for valid accounts.
 */
export async function ensureShadowAccount(
  phoneDigits: string,
  rawPassword: string
): Promise<{ ok: boolean; uid?: string; idToken?: string; message?: string }> {
  const email = shadowEmailFor(phoneDigits);
  const password = shadowPassword(rawPassword);

  const withToken = async (user: User) => ({
    ok: true as const,
    uid: user.uid,
    // Used to authenticate the one-time REST stamp write below; Auth's own token
    // fetch is a plain HTTPS call, unaffected by whatever makes some networks
    // handle Firestore's persistent write channel poorly.
    idToken: await user.getIdToken().catch(() => undefined),
  });

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return await withToken(cred.user);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
      try {
        const created = await createUserWithEmailAndPassword(auth, email, password);
        return await withToken(created.user);
      } catch (createErr: any) {
        // Another tab/device raced this one and created it first; sign in instead.
        if (createErr?.code === 'auth/email-already-in-use') {
          try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            return await withToken(cred.user);
          } catch (raceErr: any) {
            return { ok: false, message: friendlyAuthError(raceErr) };
          }
        }
        return { ok: false, message: friendlyAuthError(createErr) };
      }
    }
    return { ok: false, message: friendlyAuthError(err) };
  }
}

/**
 * Ask the server to verify a phone+password and, if it holds, sign this browser in
 * with the custom token it returns.
 *
 * This is the path that works on a device with nothing cached. The local check in
 * `login()` can't run there — the roster it matches against is empty until a
 * session exists to load it, and a session used to require passing that very check
 * (see api/login.ts). Verifying server-side and signing in with a custom token
 * establishes the session first, after which the listeners populate the app.
 *
 * Returns the caller's own record on success so the app can sign them in
 * immediately rather than waiting for the first snapshot to land.
 */
export async function serverLogin(
  phone: string,
  password: string
): Promise<
  | { ok: true; accountType: 'owner' | 'team' | 'client'; record: any }
  | { ok: false; message?: string }
> {
  try {
    const res = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      return { ok: false, message: body?.error };
    }
    await signInWithCustomToken(auth, body.customToken);
    return { ok: true, accountType: body.accountType, record: body.record };
  } catch (err) {
    console.warn('Server login note:', err);
    return { ok: false };
  }
}

export function subscribeAuth(onChange: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onChange);
}

export async function signOutFirebase(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch {}
}

function friendlyAuthError(err: any): string {
  const code = String(err?.code || '');
  if (code.includes('network-request-failed')) {
    return 'Could not reach the studio’s cloud service. Check your connection.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Wait a few minutes and retry.';
  }
  return err?.message || 'Cloud sign-in failed; continuing with local access.';
}

/**
 * Keeps the shadow Firebase Auth password in sync when a person changes their
 * OWN password (self-service — `changePassword`, `completeFirstTimePasswordSetup`,
 * `updateUserProfile` in AppContext.tsx). No server round-trip: they already hold
 * a live Firebase session as themselves at this point (the same one that got them
 * signed into the app), and updating *your own currently-signed-in* account's
 * password is exactly what the client SDK's `updatePassword` is for.
 *
 * If `auth.currentUser` is null — their shadow session was never established, or
 * expired — there is nothing to update yet; their *next* login runs the normal
 * `ensureShadowAccount` flow with the password they just set, which creates the
 * account correctly since nothing stale exists to conflict with it. Failure here
 * is swallowed the same way `linkShadowAuth` swallows its own: a password change
 * inside the app must never be blocked by a cloud-auth hiccup.
 */
export async function syncOwnShadowPassword(newRawPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await updatePassword(user, shadowPassword(newRawPassword));
  } catch (err) {
    console.warn('Shadow auth self-sync note:', err);
  }
}

/**
 * Keeps a *different* person's shadow password in sync when the owner resets it
 * for them (`resetTeamMemberPassword`, `resetClientPassword`). The owner can't do
 * this the way `syncOwnShadowPassword` does — they are signed in as themselves,
 * not as the person whose password just changed — so it goes through
 * /api/sync-password, which verifies the owner's own ID token server-side and
 * uses the Admin SDK to set the target account's password directly. See
 * api/_lib/shadowAuth.ts for what this fixes and why it can only be done server-side.
 */
export async function syncOtherShadowPassword(
  collection: 'team' | 'clients',
  id: number,
  phone: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    // The owner's own shadow session is itself broken. Nothing this call can do
    // about that — it needs the owner's token to authorize as the owner at all.
    console.warn('Shadow auth admin-sync skipped: no signed-in owner session to authorize with.');
    return;
  }
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/sync-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, collection, id, phone, newPassword }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn(`Shadow auth admin-sync failed (${res.status}):`, body?.error || res.statusText);
    }
  } catch (err) {
    console.warn('Shadow auth admin-sync note:', err);
  }
}
