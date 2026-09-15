import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/types/medical-records.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { snapshotToWire, wireToSnapshotMap } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('dental chart payload preserves FDI keys, status and notes', () => {
  const teeth = { '16': { status: 'filled', notes: 'Review restoration' }, '55': { status: 'cavity' } };
  const payload = JSON.parse(JSON.stringify(snapshotToWire(teeth, 'CHILD')));
  assert.deepEqual(payload, { patientType: 'CHILD', teeth });
  assert.equal(Array.isArray(payload.teeth), false);
  const restored = wireToSnapshotMap(Object.entries(payload.teeth).map(([number, entry]) => ({ number, ...entry })));
  assert.deepEqual(restored['16'], teeth['16']);
  assert.equal(restored['55'].status, 'cavity');
});
