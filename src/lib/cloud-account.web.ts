import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import type { Stats } from '../../Achievements-Engine';
import type { CloudUser } from './cloud-account';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config';
import { mergeStats, normalizeStats } from './progress-sync';

export { isFirebaseConfigured };

const app = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;
const auth = app === null ? null : getAuth(app);
const firestore = app === null ? null : getFirestore(app);

export function observeAccount(listener: (user: CloudUser | null) => void) {
  if (auth === null) {
    listener(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) =>
    listener(user === null ? null : { uid: user.uid, email: user.email }),
  );
}

export async function signInWithGoogle() {
  if (auth === null) throw new Error('Сначала настройте Firebase для входа через Google.');
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutFromGoogle() {
  if (auth === null) return;
  await signOut(auth);
}

export async function loadCloudProgress(uid: string): Promise<unknown | null> {
  if (firestore === null) throw new Error('Firebase ещё не настроен.');
  const snapshot = await getDoc(doc(firestore, 'users', uid, 'private', 'progress'));
  return snapshot.exists() ? snapshot.data().stats ?? null : null;
}

export async function saveCloudProgress(uid: string, stats: Stats): Promise<void> {
  if (firestore === null) throw new Error('Firebase ещё не настроен.');
  const progressDocument = doc(firestore, 'users', uid, 'private', 'progress');
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(progressDocument);
    const mergedStats = snapshot.exists()
      ? mergeStats(stats, normalizeStats(snapshot.data().stats))
      : stats;
    transaction.set(progressDocument, {
      stats: mergedStats,
      updatedAt: serverTimestamp(),
    });
  });
}
