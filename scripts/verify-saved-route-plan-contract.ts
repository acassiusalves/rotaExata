import type { SavedRoutePlan } from '../src/lib/firebase/route-stop-mutations';

function readPreviousStatus(plan: SavedRoutePlan): string {
  return plan.previousStatus;
}

void readPreviousStatus;
