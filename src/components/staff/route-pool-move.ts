import { ToastAction } from '@/components/ui/toast';
import type { useToast } from '@/hooks/use-toast';
import type { RouteMetrics, SavedRoutePlan } from '@/lib/route-stop-mutations';
import { EarningsRequestError } from '@/lib/earnings/session-request';
import { RouteStructureConflictError } from '@/lib/route-stop-reconciliation';
import { getStopIdentityKey, removeStopWithSameIdentity, upsertStopInCollection } from '@/lib/route-stop-utils';
import type { PlaceValue } from '@/lib/types';
import { createElement } from 'react';
import type { useRouteEditor } from './use-route-editor';

type Move = ReturnType<typeof useRouteEditor>['movePoolStop'];

export async function commitRoutePoolMove(
  move: Move,
  input: Parameters<Move>,
  options: {
    toast: ReturnType<typeof useToast>['toast'];
    apply: (route: SavedRoutePlan, updatePool: (previous: PlaceValue[]) => PlaceValue[], metrics?: RouteMetrics) => void;
    notify: (route: SavedRoutePlan) => Promise<unknown>;
  },
) {
  const [kind, , stop] = input;
  try {
    const { route, unassignedStops, metrics } = await move(...input);
    const stopKey = getStopIdentityKey(stop);
    const available = unassignedStops.find(item => getStopIdentityKey(item) === stopKey);
    options.apply(route, previous => available
      ? upsertStopInCollection(previous, available)
      : removeStopWithSameIdentity(previous, stop), metrics);
    options.toast({ title: kind === 'allocate' ? 'Ponto salvo na rota' : 'Ponto devolvido aos avulsos' });
    void options.notify(route).catch(error => console.error('Erro ao notificar motorista:', error));
  } catch (error) {
    if (error instanceof RouteStructureConflictError) {
      options.toast({ variant: 'destructive', title: error.message,
        description: 'Confira a rota atual e repita a alteração.' });
      return;
    }
    if (error instanceof EarningsRequestError && error.status >= 400 && error.status < 500 &&
        ![408, 429].includes(error.status)) {
      options.toast({ variant: 'destructive', title: 'Movimento rejeitado',
        description: 'Confira o acesso e recarregue a rota antes de repetir a alteração.' });
      return;
    }
    if (error instanceof Error) console.error('Erro ao confirmar movimento de ponto:', error);
    options.toast({
      variant: 'destructive', title: 'Gravação pendente de confirmação',
      description: 'Tente novamente para verificar se o ponto foi salvo.',
      action: createElement(ToastAction, {
        altText: 'Tentar confirmar a gravação novamente',
        onClick: () => void commitRoutePoolMove(move, input, options),
      }, 'Tentar novamente'),
    });
  }
}
