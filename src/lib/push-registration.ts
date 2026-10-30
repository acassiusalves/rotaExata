export type PushRegistrationState = 'needs_permission' | 'enabled' | 'blocked' | 'unsupported' | 'error' | 'impersonating' | 'disabled';
export type PushRegistrationResult = { state: PushRegistrationState; permission: NotificationPermission; errorCode?: string };
export type PushRegistrationContext = { explicit: boolean; preferenceRevision: number };
type Dependencies = {
  isSupported: () => Promise<boolean>;
  getPermission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  getCurrentUid: () => string | null;
  isImpersonating: () => boolean;
  isEnabled?: () => Promise<boolean>;
  getPreference?: () => Promise<{ enabled: boolean; revision: number }>;
  getToken: () => Promise<string | null>;
  saveToken: (uid: string, token: string, context: PushRegistrationContext) => Promise<void>;
  disableToken?: (uid: string) => Promise<void>;
};
export function createPushRegistrar(dependencies: Dependencies) {
  const pending = new Map<string, Promise<PushRegistrationResult>>();
  const versions = new Map<string, number>();
  function assertSession(uid: string, version: number) {
    if (dependencies.isImpersonating() || dependencies.getCurrentUid() !== uid) throw { code: 'session-changed' };
    if ((versions.get(uid) ?? 0) !== version) throw { code: 'push-disabled' };
  }
  async function execute(uid: string, ask: boolean, version: number): Promise<PushRegistrationResult> {
    try {
      assertSession(uid, version);
      if (!await dependencies.isSupported()) return { state: 'unsupported', permission: 'default' };
      let permission = dependencies.getPermission();
      const preference = dependencies.getPreference ? await dependencies.getPreference()
        : { enabled: dependencies.isEnabled ? await dependencies.isEnabled() : true, revision: 0 };
      if (!ask && !preference.enabled) return { state: 'disabled', permission };
      if (permission === 'default' && ask) permission = await dependencies.requestPermission();
      if (permission !== 'granted') return { state: permission === 'denied' ? 'blocked' : 'needs_permission', permission };
      const token = await dependencies.getToken();
      if (!token) throw { code: 'token-unavailable' };
      assertSession(uid, version);
      await dependencies.saveToken(uid, token, { explicit: ask, preferenceRevision: preference.revision });
      assertSession(uid, version);
      return { state: 'enabled', permission };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      return { state: code === 'push-disabled' ? 'disabled' : 'error', permission: dependencies.getPermission(), errorCode: typeof code === 'string' ? code : 'registration-failed' };
    }
  }
  return {
    register(uid: string, ask: boolean): Promise<PushRegistrationResult> {
      if (dependencies.isImpersonating()) return Promise.resolve({ state: 'impersonating', permission: dependencies.getPermission() });
      // A passive mount must not consume a subsequent explicit permission request.
      if (!ask && dependencies.getPermission() === 'default') return Promise.resolve({ state: 'needs_permission', permission: 'default' });
      const existing = pending.get(uid);
      if (existing) return existing;
      const result = execute(uid, ask, versions.get(uid) ?? 0).finally(() => { if (pending.get(uid) === result) pending.delete(uid); });
      pending.set(uid, result);
      return result;
    },
    async disable(uid: string) {
      const version = (versions.get(uid) ?? 0) + 1;
      versions.set(uid, version);
      pending.delete(uid);
      assertSession(uid, version);
      if (!dependencies.disableToken) throw new Error('Desativação de notificações indisponível.');
      await dependencies.disableToken(uid);
    },
  };
}
