export type DriverDeliveryUpdate<Reference> = {
  reference: Reference;
  totalDeliveries: number;
};

export type DriverDeliveryBatch<Reference> = {
  update: (reference: Reference, data: { totalDeliveries: number }) => void;
  commit: () => Promise<unknown>;
};

export async function commitDriverDeliveryUpdates<Reference>(input: {
  updates: DriverDeliveryUpdate<Reference>[];
  shouldApply: boolean;
  createBatch: () => DriverDeliveryBatch<Reference>;
  maxWritesPerBatch?: number;
}): Promise<{ updateCount: number; commitCount: number }> {
  const maxWritesPerBatch = input.maxWritesPerBatch ?? 450;
  if (!Number.isInteger(maxWritesPerBatch) || maxWritesPerBatch < 1 || maxWritesPerBatch > 450) {
    throw new Error('O limite por batch deve ser um inteiro entre 1 e 450.');
  }
  if (!input.shouldApply || input.updates.length === 0) {
    return { updateCount: input.updates.length, commitCount: 0 };
  }

  let commitCount = 0;
  for (let start = 0; start < input.updates.length; start += maxWritesPerBatch) {
    const batch = input.createBatch();
    input.updates.slice(start, start + maxWritesPerBatch).forEach((update) => {
      batch.update(update.reference, { totalDeliveries: update.totalDeliveries });
    });
    await batch.commit();
    commitCount++;
  }

  return { updateCount: input.updates.length, commitCount };
}
