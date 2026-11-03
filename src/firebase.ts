import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  browserPopupRedirectResolver,
  User,
} from 'firebase/auth';
import { initializeFirestore, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence non-fatal offline notices in sandboxed / iframe environments
setLogLevel('silent');

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

// Pre-warm the popup/redirect resolver on load so gapi.iframes and origin validation
// are already resolved before the user clicks Sign In / Link Drive.
if (typeof window !== 'undefined') {
  try {
    const internalAuth = auth as any;
    const resolver = internalAuth._popupRedirectResolver;
    if (resolver) {
      resolver._initialize?.(internalAuth)?.catch(() => {});
      resolver._originValidation?.(internalAuth)?.catch(() => {});
    }
  } catch {
    // Ignore pre-warm errors in restricted environments
  }
}

let cachedAccessToken: string | null = null;
let activeSignInPromise: Promise<{ user: User; accessToken: string | null }> | null = null;

export const getCachedAccessToken = (): string | null => cachedAccessToken;
export const clearCachedAccessToken = (): void => {
  cachedAccessToken = null;
};

/**
 * Mutex-guarded Google Sign-In with Popup.
 * Prevents concurrent PopupOperation instances in @firebase/auth v12.15.0 which otherwise
 * cancel the in-flight operation before `pendingPromise` is assigned and trigger
 * `INTERNAL ASSERTION FAILED: Pending promise was never set`.
 */
export const signInWithGooglePopupSafe = async (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  activeSignInPromise = (async () => {
    try {
      const internalAuth = auth as any;
      const resolver = internalAuth._popupRedirectResolver;
      if (resolver && typeof resolver._initialize === 'function') {
        await resolver._initialize(internalAuth);
      }

      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      return {
        user: result.user,
        accessToken: credential?.accessToken || cachedAccessToken,
      };
    } finally {
      setTimeout(() => {
        activeSignInPromise = null;
      }, 300);
    }
  })();

  return activeSignInPromise;
};
