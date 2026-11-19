import { EarningsRequestError } from '../earnings/session-request.ts';

export function retainAuthorizedStaffData(error:unknown,online:boolean) {
  return online && (error instanceof TypeError ||
    (error instanceof EarningsRequestError && (error.status>=500 || error.status===429)));
}
