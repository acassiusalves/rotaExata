import assert from 'node:assert/strict';
import { commitDriverDeliveryUpdates } from './driver-delivery-repair';

type Reference = { id: string };

async function verifySize(size: number, expectedChunkSizes: number[]) {
  const committedChunks: Array<Array<{ reference: Reference; totalDeliveries: number }>> = [];
  let currentChunk: Array<{ reference: Reference; totalDeliveries: number }> | null = null;
  const updates = Array.from({ length: size }, (_, index) => ({
    reference: { id: `driver-${index}` },
    totalDeliveries: index + 10,
  }));

  const result = await commitDriverDeliveryUpdates({
    updates,
    shouldApply: true,
    createBatch: () => {
      currentChunk = [];
      return {
        update: (reference, data) => {
          assert.deepEqual(data, {
            totalDeliveries: Number(reference.id.replace('driver-', '')) + 10,
          });
          currentChunk!.push({ reference, totalDeliveries: data.totalDeliveries });
        },
        commit: async () => {
          committedChunks.push(currentChunk!);
        },
      };
    },
  });

  assert.deepEqual(committedChunks.map((chunk) => chunk.length), expectedChunkSizes);
  assert.equal(result.updateCount, size);
  assert.equal(result.commitCount, expectedChunkSizes.length);
}

async function main() {
  await verifySize(0, []);
  await verifySize(1, [1]);
  await verifySize(450, [450]);
  await verifySize(451, [450, 1]);
  await verifySize(901, [450, 450, 1]);

  let dryRunBatchCreations = 0;
  const dryRun = await commitDriverDeliveryUpdates({
    updates: Array.from({ length: 501 }, (_, index) => ({
      reference: { id: `dry-${index}` },
      totalDeliveries: index,
    })),
    shouldApply: false,
    createBatch: () => {
      dryRunBatchCreations++;
      return {
        update: () => undefined,
        commit: async () => undefined,
      };
    },
  });
  assert.equal(dryRunBatchCreations, 0);
  assert.deepEqual(dryRun, { updateCount: 501, commitCount: 0 });

  console.log('OK: reparo divide lotes em até 450 writes e dry-run não cria commits.');
}

void main();
