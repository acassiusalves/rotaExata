import assert from 'node:assert/strict';
import { RouteStructureConflictError } from '../src/lib/route-stop-reconciliation';
import { saveRoutePlanBatchWithConflictHandling } from '../src/lib/route-plan-batch-conflict-handling';

async function main() {
  let gatewayWrites = 0;
  let handledConflicts = 0;

  const outcome = await saveRoutePlanBatchWithConflictHandling({
    buildInput: () => {
      throw new RouteStructureConflictError('Uma transferência pendente está sem identidade estável.');
    },
    save: async (_input: never) => {
      gatewayWrites++;
      return 'saved';
    },
    onConflict: (error) => {
      handledConflicts++;
      assert.equal(error.message, 'Uma transferência pendente está sem identidade estável.');
    },
  });

  assert.deepEqual(outcome, { status: 'conflict' });
  assert.equal(gatewayWrites, 0, 'conflito de transferência não pode chamar o gateway de escrita');
  assert.equal(handledConflicts, 1, 'conflito deve seguir o tratamento controlado uma única vez');

  console.log('OK: conflito ao construir transferência não escreve e é tratado.');
}

void main();
