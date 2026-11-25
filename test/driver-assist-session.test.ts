import assert from 'node:assert/strict';
import test from 'node:test';
import { ASSIST_STORAGE_KEY, assistEntryPath, clearAssistGrant, readAssistGrant, writeAssistGrant } from '../src/lib/driver/assist-session.ts';

const GRANT = '3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c';
function memory() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
}

test('o acesso gravado na aba é lido de volta', () => {
  const storage = memory();
  writeAssistGrant(GRANT, storage);
  assert.equal(storage.values.get(ASSIST_STORAGE_KEY), GRANT);
  assert.equal(readAssistGrant(storage), GRANT);
});

test('valor que não é um acesso válido é descartado', () => {
  const storage = memory();
  storage.setItem(ASSIST_STORAGE_KEY, '../routes');
  assert.equal(readAssistGrant(storage), null);
  assert.equal(storage.values.has(ASSIST_STORAGE_KEY), false);
  assert.throws(() => writeAssistGrant('nao-e-uuid', storage));
});

test('encerrar apaga o acesso da aba', () => {
  const storage = memory();
  writeAssistGrant(GRANT, storage);
  clearAssistGrant(storage);
  assert.equal(readAssistGrant(storage), null);
});

test('fora do navegador não há acesso', () => {
  assert.equal(readAssistGrant(null), null);
});

test('a entrada do modo operador leva só o identificador do acesso', () => {
  assert.equal(assistEntryPath(GRANT), '/impersonate-driver?grant=' + GRANT);
});
