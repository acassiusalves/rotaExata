export type DriverRoutesState = 'loading' | 'ready' | 'empty' | 'offline' | 'error';
export type DriverRoutesSnapshot<Route> = {
  routes: Route[];
  state: DriverRoutesState;
  lastServerSyncAt: number | null;
  errorCode: string | null;
  isRefreshing: boolean;
};
type InputSnapshot<Route> = { routes: Route[]; fromCache: boolean };
type Dependencies<Route> = {
  uid: string | null;
  observeRoutes: (next: (snapshot: InputSnapshot<Route>) => void, error: (error: unknown) => void) => () => void;
  readServer: () => Promise<InputSnapshot<Route>>;
  lifecycle: { document: EventTarget; window: EventTarget; isVisible: () => boolean; isOnline: () => boolean };
  now?: () => number;
  onDiagnostic?: (entry: { state: DriverRoutesState; errorCode: string | null; lastServerSyncAt: number | null }) => void;
};

export function createDriverRoutesSync<Route extends { status: 'dispatched' | 'in_progress' }>(dependencies: Dependencies<Route>) {
  const initial: DriverRoutesSnapshot<Route> = { routes: [], state: 'loading', lastServerSyncAt: null, errorCode: null, isRefreshing: false };
  let snapshot = initial;
  const observers = new Set<() => void>();
  const now = dependencies.now ?? Date.now;
  const { lifecycle } = dependencies;
  let active = false;
  let unsubscribe: (() => void) | null = null;
  let listenerVersion = 0;
  let listenerFailed = false;
  let serverRevision = 0;
  let listenerErrorRevision = 0;
  let requestVersion = 0;
  let inFlight: Promise<void> | null = null;
  let cancelRead: (() => void) | null = null;
  let lastRefreshAttemptAt: number | null = null;
  let scheduledRefresh: ReturnType<typeof setTimeout> | null = null;

  function publish(changes: Partial<DriverRoutesSnapshot<Route>>) {
    if (!active) return;
    snapshot = { ...snapshot, ...changes };
    dependencies.onDiagnostic?.({ state: snapshot.state, errorCode: snapshot.errorCode, lastServerSyncAt: snapshot.lastServerSyncAt });
    observers.forEach(observer => observer());
  }

  function clearScheduledRefresh() {
    if (scheduledRefresh !== null) clearTimeout(scheduledRefresh);
    scheduledRefresh = null;
  }

  function hasPermanentError() {
    return ['permission-denied', 'failed-precondition', 'unauthenticated'].includes(snapshot.errorCode ?? '');
  }

  function reportError(error: unknown) {
    const code = (error as { code?: unknown } | null)?.code;
    const errorCode = typeof code === 'string' ? code.split('/').at(-1)! : 'unknown';
    publish({ state: lifecycle.isOnline() ? 'error' : 'offline', errorCode });
    if (hasPermanentError()) clearScheduledRefresh();
  }

  function receive(input: InputSnapshot<Route>) {
    if (input.fromCache) {
      // An empty local cache must never erase a last known server result.
      publish({
        ...(snapshot.lastServerSyncAt === null ? { routes: sortRoutes(input.routes) } : {}),
        state: !lifecycle.isOnline() ? 'offline' : snapshot.errorCode ? 'error' : 'loading',
      });
      return;
    }
    serverRevision++;
    publish({
      routes: sortRoutes(input.routes),
      state: !lifecycle.isOnline() ? 'offline' : input.routes.length ? 'ready' : 'empty',
      lastServerSyncAt: now(),
      errorCode: null,
    });
  }

  function sortRoutes(routes: Route[]) {
    return [...routes].sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress'));
  }

  function detachListener() {
    listenerVersion++;
    unsubscribe?.();
    unsubscribe = null;
  }

  function attachListener() {
    detachListener();
    listenerFailed = false;
    const version = listenerVersion;
    const cleanup = dependencies.observeRoutes(
      input => { if (active && version === listenerVersion) receive(input); },
      error => {
        if (!active || version !== listenerVersion) return;
        listenerFailed = true;
        listenerErrorRevision++;
        detachListener();
        reportError(error);
      },
    );
    if (active && version === listenerVersion) unsubscribe = cleanup;
    else cleanup();
  }

  function refresh(automatic = false): Promise<void> {
    if (!active || !dependencies.uid) return Promise.resolve();
    if (automatic && (!lifecycle.isVisible() || hasPermanentError())) return Promise.resolve();
    if (!lifecycle.isOnline()) {
      publish({ state: 'offline' });
      return Promise.resolve();
    }
    if (inFlight) return inFlight;
    const remaining = lastRefreshAttemptAt === null ? 0 : 30_000 - (now() - lastRefreshAttemptAt);
    if (automatic && remaining > 0) {
      if (scheduledRefresh === null) {
        scheduledRefresh = setTimeout(() => {
          scheduledRefresh = null;
          void refresh(true);
        }, remaining);
      }
      return Promise.resolve();
    }

    clearScheduledRefresh();
    lastRefreshAttemptAt = now();
    const version = ++requestVersion;
    const revision = serverRevision;
    const errorRevision = listenerErrorRevision;
    const cancelled = Symbol('cancelled');
    let timeout: ReturnType<typeof setTimeout>;
    const cancellation = new Promise<typeof cancelled>(resolve => { cancelRead = () => resolve(cancelled); });
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject({ code: 'deadline-exceeded' }), 15_000);
    });
    publish({ isRefreshing: true });

    inFlight = Promise.resolve().then(async () => {
      try {
        const input = await Promise.race([dependencies.readServer(), deadline, cancellation]);
        if (input === cancelled || !active || version !== requestVersion) return;
        // A server snapshot received while this read was pending is newer.
        if (revision === serverRevision && errorRevision === listenerErrorRevision) receive(input);
        if (listenerFailed && !hasPermanentError()) attachListener();
      } catch (error) {
        if (active && version === requestVersion && revision === serverRevision && errorRevision === listenerErrorRevision) reportError(error);
      } finally {
        clearTimeout(timeout!);
        if (active && version === requestVersion) {
          inFlight = null;
          cancelRead = null;
          publish({ isRefreshing: false });
        }
      }
    });
    return inFlight;
  }

  const resume = () => { void refresh(true); };
  const visibilityChanged = () => { if (lifecycle.isVisible()) resume(); else clearScheduledRefresh(); };
  const offline = () => { clearScheduledRefresh(); publish({ state: 'offline' }); };

  function start() {
    if (active || !dependencies.uid) return;
    active = true;
    lastRefreshAttemptAt = null;
    lifecycle.document.addEventListener('visibilitychange', visibilityChanged);
    lifecycle.window.addEventListener('focus', resume);
    lifecycle.window.addEventListener('pageshow', resume);
    lifecycle.window.addEventListener('online', resume);
    lifecycle.window.addEventListener('offline', offline);
    attachListener();
    void refresh(true);
  }

  function stop() {
    active = false;
    requestVersion++;
    cancelRead?.();
    cancelRead = null;
    inFlight = null;
    clearScheduledRefresh();
    detachListener();
    lifecycle.document.removeEventListener('visibilitychange', visibilityChanged);
    lifecycle.window.removeEventListener('focus', resume);
    lifecycle.window.removeEventListener('pageshow', resume);
    lifecycle.window.removeEventListener('online', resume);
    lifecycle.window.removeEventListener('offline', offline);
  }

  return {
    start, stop,
    subscribe(listener: () => void) { observers.add(listener); return () => { observers.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    refresh: () => refresh(false),
  };
}
