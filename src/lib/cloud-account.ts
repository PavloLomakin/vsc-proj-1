import type { Stats } from '../../Achievements-Engine';
import { isFirebaseConfigured } from './firebase-config';

export type CloudUser = {
  uid: string;
  email: string | null;
};

export { isFirebaseConfigured };

export function observeAccount(listener: (user: CloudUser | null) => void) {
  listener(null);
  return () => {};
}

export async function signInWithGoogle(): Promise<void> {
  throw new Error('Вход через Google недоступен на этой платформе.');
}

export async function signOutFromGoogle(): Promise<void> {}

export async function loadCloudProgress(_uid: string): Promise<unknown | null> {
  throw new Error('Firebase ещё не настроен.');
}

export async function saveCloudProgress(_uid: string, _stats: Stats): Promise<void> {
  throw new Error('Firebase ещё не настроен.');
}
