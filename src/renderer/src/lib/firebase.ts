import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, setLogLevel } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Suppress raw SDK internal backoff logging during quota exhaustion
try {
  setLogLevel('silent');
} catch {}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(
    app,
    { ignoreUndefinedProperties: true },
    firebaseConfig.firestoreDatabaseId || '(default)'
  );
} catch {
  firestoreInstance = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
}

export const db = firestoreInstance;
export default app;

