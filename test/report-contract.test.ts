import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getReportCapabilities, normalizeReport, readSubmission, selectReportPage } from '../src/lib/reporting/report-contract.ts';

test('usa host oficial para apresentar origem histórica e aplica escopo por origem persistida', () => {
  const legacy = normalizeReport('old', { context: { url: 'https://rota-exata.vercel.app/caminho' }, user: { uid: 'author' } });
  const current = normalizeReport('new', { originSystem: 'rota_exata', user: { uid: 'author' } });
  const manager = { uid: 'manager', role: 'gestor' };
  assert.equal(legacy.originSystem, 'rota_exata');
  assert.equal(legacy.category, 'error');
  assert.equal(getReportCapabilities(manager, legacy).view, false);
  assert.equal(getReportCapabilities(manager, current).manage, true);
  assert.equal(getReportCapabilities({ uid: 'author', role: 'motorista' }, legacy).view, true);
  assert.equal(getReportCapabilities({ uid: 'admin', role: 'admin' }, legacy).manage, true);
  assert.equal(normalizeReport('local', { context: { url: 'http://localhost:3000' } }).originSystem, 'unknown');
});

test('mantém a melhoria completa com resumo compatível', () => {
  const improvement = { goal: 'g'.repeat(2000), currentProcess: 'p'.repeat(2000), blocker: 'b'.repeat(2000) };
  const result = readSubmission({ category: 'improvement', improvement });
  assert.deepEqual(result?.improvement, improvement);
  assert.equal(result?.description.length, 5000);
  assert.equal(readSubmission({ category: 'improvement', improvement: { ...improvement, blocker: ' ' } }), null);
});

test('filtra, conta e pagina o mesmo conjunto autorizado', () => {
  const input = (id: string, category = 'error') => normalizeReport(id, {
    originSystem: 'luna', status: 'pending', category, description: 'exemplo',
    createdAt: { _seconds: 1794330000 }, user: { uid: 'user' },
  });
  const rows = [input('a'), input('b'), input('c', 'improvement')];
  const params = new URLSearchParams('category=error&limit=1&from=2026-11-10&to=2026-11-10');
  const actor = { uid: 'user', role: 'user' };
  const first = selectReportPage(rows, actor, params);
  assert.equal(first.counts.total, 2);
  assert.equal(first.reports[0].id, 'b');
  assert.ok(first.nextCursor);
  params.set('cursor', first.nextCursor);
  assert.equal(selectReportPage(rows, actor, params).reports[0].id, 'a');
  params.set('category', 'improvement');
  assert.equal(selectReportPage(rows, actor, params).reports[0].id, 'c');
});
