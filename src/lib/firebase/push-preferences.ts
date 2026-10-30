import { doc, getDoc, runTransaction, deleteField, serverTimestamp, type Firestore } from 'firebase/firestore';
export type PushPreference = { enabled: boolean; revision: number };
export type PushRegistrationContext = { explicit: boolean; preferenceRevision: number };
export async function readDriverPushPreference(database: Firestore, uid: string): Promise<PushPreference> {
  const snapshot = await getDoc(doc(database, 'users', uid, 'settings', 'preferences'));
  return { enabled: snapshot.data()?.notifications !== false, revision: snapshot.data()?.pushRevision ?? 0 };
}
export async function persistDriverPushToken(database: Firestore, uid: string, token: string, context: PushRegistrationContext, assertSession = () => {}) {
  const preferenceRef = doc(database, 'users', uid, 'settings', 'preferences');
  await runTransaction(database, async transaction => {
    const preference = await transaction.get(preferenceRef);
    const revision = preference.data()?.pushRevision ?? 0;
    if (revision !== context.preferenceRevision || (!context.explicit && preference.data()?.notifications === false)) {
      throw { code: preference.data()?.notifications === false ? 'push-disabled' : 'preference-changed' };
    }
    assertSession();
    transaction.update(doc(database, 'users', uid), { fcmToken: token, fcmTokenUpdatedAt: serverTimestamp() });
    transaction.set(preferenceRef, { notifications: true, pushRevision: revision + (context.explicit ? 1 : 0) }, { merge: true });
  });
}
export async function disableDriverPushToken(database: Firestore, uid: string, assertSession = () => {}) {
  const preferenceRef = doc(database, 'users', uid, 'settings', 'preferences');
  await runTransaction(database, async transaction => {
    const preference = await transaction.get(preferenceRef);
    assertSession();
    transaction.update(doc(database, 'users', uid), { fcmToken: deleteField(), fcmTokenUpdatedAt: serverTimestamp() });
    transaction.set(preferenceRef, { notifications: false, pushRevision: (preference.data()?.pushRevision ?? 0) + 1 }, { merge: true });
  });
}
