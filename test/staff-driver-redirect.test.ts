import assert from 'node:assert/strict';
import test from 'node:test';
import { deniedStaffDestination } from '../src/lib/staff/driver-redirect.ts';
import { EarningsRequestError } from '../src/lib/earnings/session-request.ts';

const driverProfile = async (path: string) => {
  assert.equal(path, '/api/driver/runtime?resource=profile');
  return { profile: { id: 'driver-1' } };
};
const notDriver = async () => { throw new EarningsRequestError(403, 'route_access_denied'); };

test('conta de motorista recusada pelo painel vai para Minhas rotas', async () => {
  assert.equal(await deniedStaffDestination(driverProfile, 403, 'staff_access_denied'), '/my-routes');
});

test('conta que não é de motorista continua vendo a recusa do painel', async () => {
  assert.equal(await deniedStaffDestination(notDriver, 403, 'staff_access_denied'), null);
});

test('falha ao conferir o cadastro de motorista mantém a recusa do painel', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await deniedStaffDestination(offline, 403, 'staff_access_denied'), null);
});

test('só confere o cadastro de motorista quando o painel recusou a conta', async () => {
  let calls = 0;
  const counting = async (path: string) => { calls++; return driverProfile(path); };
  for (const [status, code] of [[401, 'staff_unauthorized'], [403, 'platform_password_change_required'], [503, 'staff_unavailable']] as const) {
    assert.equal(await deniedStaffDestination(counting, status, code), null, `${status} ${code}`);
  }
  assert.equal(calls, 0);
});
