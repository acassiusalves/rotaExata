import { adminApp,adminDb } from '../../firebase/admin';
import { EarningsError } from '../earnings/transport';
import type { StaffActor } from './actor';

export function staffSourceDb(actor:Pick<StaffActor,'sourceProject'>) {
  if (!adminDb || adminApp?.options.projectId!==actor.sourceProject) throw new EarningsError(503,'staff_unavailable');
  return adminDb;
}
