'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { collection, getDocsFromServer, onSnapshot, query, where, type DocumentData, type QuerySnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { createDriverRoutesSync } from '@/lib/driver-routes-sync';
import { createLogger } from '@/lib/logger';

export type DriverRouteDocument = {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress';
  stops: any[];
  distanceMeters: number;
};

const log = createLogger('DriverRoutes');

function readSnapshot(snapshot: QuerySnapshot<DocumentData>) {
  return {
    routes: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DriverRouteDocument)),
    fromCache: snapshot.metadata.fromCache,
  };
}

export function useDriverRoutes(uid: string | null) {
  // Each UID owns its own store. Old requests cannot publish into another session.
  const sync = useMemo(() => {
    const routesQuery = uid ? query(
      collection(db, 'routes'),
      where('driverId', '==', uid),
      where('status', 'in', ['dispatched', 'in_progress']),
    ) : null;

    return createDriverRoutesSync<DriverRouteDocument>({
      uid,
      observeRoutes: (next, error) => routesQuery
        ? onSnapshot(routesQuery, { includeMetadataChanges: true }, snapshot => next(readSnapshot(snapshot)), error)
        : () => {},
      readServer: async () => routesQuery
        ? readSnapshot(await getDocsFromServer(routesQuery))
        : { routes: [], fromCache: false },
      lifecycle: {
        document: typeof document === 'undefined' ? new EventTarget() : document,
        window: typeof window === 'undefined' ? new EventTarget() : window,
        isVisible: () => typeof document !== 'undefined' && document.visibilityState === 'visible',
        isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
      },
      onDiagnostic: entry => {
        const details = { uid, buildId: process.env.NEXT_PUBLIC_BUILD_ID, ...entry };
        if (entry.errorCode) log.warn('Falha ao sincronizar rotas', details);
        else log.debug('Estado da sincronização', details);
      },
    });
  }, [uid]);

  useEffect(() => {
    sync.start();
    return sync.stop;
  }, [sync]);

  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getServerSnapshot);
  return { ...snapshot, refresh: sync.refresh };
}
