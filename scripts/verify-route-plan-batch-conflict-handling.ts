import assert from 'node:assert/strict';
import type { PlaceValue } from '../src/lib/types';
import {
  buildRouteStopTransferIntents,
  saveRoutePlanBatchWithConflictHandling,
} from '../src/lib/route-plan-batch-conflict-handling';

async function main() {
  let gatewayWrites = 0;
  let handledConflicts = 0;
  let escapedError: unknown;
  let outcome: Awaited<ReturnType<typeof saveRoutePlanBatchWithConflictHandling>> | undefined;

  try {
    outcome = await saveRoutePlanBatchWithConflictHandling({
      buildInput: () => buildRouteStopTransferIntents({
        targetRouteKeys: ['target'],
        pendingEdits: {
          target: [{ id: '', placeId: '', address: '', customerName: '', _movedFromRoute: 'source' } as unknown as PlaceValue],
        },
        existingRouteIdsByKey: new Map([['source', 'route-source']]),
        targetRouteIdsByKey: new Map([['target', 'route-target']]),
      }),
      save: async (_input) => {
        gatewayWrites++;
        return 'saved';
      },
      onConflict: (error) => {
        handledConflicts++;
        assert.equal(error.message, 'Uma transferência pendente está sem identidade estável.');
      },
    });
  } catch (error) {
    escapedError = error;
  }

  assert.equal(escapedError, undefined, 'conflito de construção não pode escapar do tratamento controlado');
  assert.deepEqual(outcome, { status: 'conflict' });
  assert.equal(gatewayWrites, 0, 'conflito de transferência não pode chamar o gateway de escrita');
  assert.equal(handledConflicts, 1, 'conflito deve seguir o tratamento controlado uma única vez');

  assert.deepEqual(
    buildRouteStopTransferIntents({
      targetRouteKeys: ['target'],
      pendingEdits: {
        target: [{
          id: 'stop-1',
          placeId: 'place-1',
          address: 'Rua 1',
          lat: -16.7,
          lng: -49.2,
          customerName: 'Cliente',
          _movedFromRoute: 'source',
        } as PlaceValue],
      },
      existingRouteIdsByKey: new Map([['source', 'route-source']]),
      targetRouteIdsByKey: new Map([['target', 'route-target']]),
    }),
    [{ sourceRouteId: 'route-source', targetRouteId: 'route-target', stopKey: 'id:stop-1' }],
    'movimento válido deve manter uma intenção explícita um-para-um',
  );

  console.log('OK: conflito ao construir transferência não escreve e é tratado.');
}

void main();
