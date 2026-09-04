import { RouteStructureConflictError } from '@/lib/route-stop-reconciliation';

export type RoutePlanBatchConflictOutcome<Result> =
  | { status: 'saved'; result: Result }
  | { status: 'conflict' };

export async function saveRoutePlanBatchWithConflictHandling<Input, Result>({
  buildInput,
  save,
  onConflict,
}: {
  buildInput: () => Input;
  save: (input: Input) => Promise<Result>;
  onConflict: (error: RouteStructureConflictError) => void;
}): Promise<RoutePlanBatchConflictOutcome<Result>> {
  try {
    return { status: 'saved', result: await save(buildInput()) };
  } catch (error) {
    if (error instanceof RouteStructureConflictError) {
      onConflict(error);
      return { status: 'conflict' };
    }
    throw error;
  }
}
