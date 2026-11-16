import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
} from '@react-native-firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

import type { Stats } from '../../Achievements-Engine';
import type { CloudUser } from './cloud-account';
import { isFirebaseConfigured } from './firebase-config';
import { mergeStats, normalizeStats } from './progress-sync';

export { isFirebaseConfigured };

if (isFirebaseConfigured) {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

const nativeAuth = isFirebaseConfigured ? getAuth() : null;
const firestore = isFirebaseConfigured ? getFirestore() : null;

export function observeAccount(listener: (user: CloudUser | null) => void) {
  if (nativeAuth === null) {
    listener(null);
    return () => {};
  }
  return onAuthStateChanged(nativeAuth, (user) =>
    listener(user === null ? null : { uid: user.uid, email: user.email }),
  );
}

export async function signInWithGoogle() {
  if (nativeAuth === null) throw new Error('Сначала настройте Firebase для входа через Google.');

  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return;

  const idToken = response.data.idToken;
  if (idToken === null) {
    throw new Error('Google не вернул токен входа. Проверьте настройки OAuth-клиента.');
  }
  await signInWithCredential(nativeAuth, GoogleAuthProvider.credential(idToken));
}

export async function signOutFromGoogle() {
  if (nativeAuth === null) return;
  await signOut(nativeAuth);
  await GoogleSignin.signOut();
}

export async function loadCloudProgress(uid: string): Promise<unknown | null> {
  if (firestore === null) throw new Error('Firebase ещё не настроен.');
  const snapshot = await getDoc(doc(firestore, 'users', uid, 'private', 'progress'));
  return snapshot.exists() ? snapshot.data()?.stats ?? null : null;
}

export async function saveCloudProgress(uid: string, stats: Stats): Promise<void> {
  if (firestore === null) throw new Error('Firebase ещё не настроен.');
  const progressDocument = doc(firestore, 'users', uid, 'private', 'progress');
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(progressDocument);
    const mergedStats = snapshot.exists()
      ? mergeStats(stats, normalizeStats(snapshot.data()?.stats))
      : stats;
    transaction.set(progressDocument, {
      stats: mergedStats,
      updatedAt: serverTimestamp(),
    });
  });
}
