import assert from 'node:assert/strict';
import test from 'node:test';
import { staffOperationAllowed } from '../src/lib/staff/access.ts';

const open = { pagePermissions: {}, inactivePages: [] as string[] };
const actor = (role: 'admin' | 'socio' | 'gestor') => ({ role, policy: open, rotaPolicy: open });

test('operar o app do motorista é liberado só para admin e sócio', () => {
  assert.equal(staffOperationAllowed(actor('admin'), 'driver:operate'), true);
  assert.equal(staffOperationAllowed(actor('socio'), 'driver:operate'), true);
  assert.equal(staffOperationAllowed(actor('gestor'), 'driver:operate'), false);
});

test('operar o app do motorista exige a página Motoristas ativa', () => {
  const inactive = { ...actor('admin'), rotaPolicy: { pagePermissions: {}, inactivePages: ['/drivers'] } };
  assert.equal(staffOperationAllowed(inactive, 'driver:operate'), false);
});
