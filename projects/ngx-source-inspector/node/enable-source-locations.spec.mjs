import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const preload = fileURLToPath(new URL('./enable-source-locations.mjs', import.meta.url));

// Stands in for the CLI: prints whether source locations are on in the main thread and in a worker
// thread, where the CLI compiles templates.
const CLI = `
import { Worker } from 'node:worker_threads';
const { enabled } = await import('@angular/compiler');
const worker = new Worker(new URL('./worker.mjs', import.meta.url));
worker.once('message', (inWorker) => console.log(JSON.stringify({ main: enabled(), worker: inWorker })));
`;
const WORKER = `
import { parentPort } from 'node:worker_threads';
const { enabled } = await import('@angular/compiler');
parentPort.postMessage(enabled());
`;

const OLD_COMPILER = `
let on = false;
export const setEnableTemplateSourceLocations = (value) => (on = value);
export const enabled = () => on;
`;
// Since 22.1.4 the setter is gone, replaced by the compiler option.
const NEW_COMPILER = 'export const enabled = () => false;';

describe('enable-source-locations preload', () => {
  let workspace;

  const useCompiler = (code) =>
    writeFileSync(join(workspace, 'node_modules/@angular/compiler/index.mjs'), code);

  const ng = (...args) => {
    const { NGX_SOURCE_INSPECTOR_SERVING, ...env } = process.env;
    const output = execFileSync(process.execPath, ['--import', preload, 'ng.mjs', ...args], {
      cwd: workspace,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  };

  before(() => {
    workspace = mkdtempSync(join(tmpdir(), 'ngx-source-inspector-'));
    mkdirSync(join(workspace, 'node_modules/@angular/compiler'), { recursive: true });
    writeFileSync(
      join(workspace, 'node_modules/@angular/compiler/package.json'),
      JSON.stringify({ name: '@angular/compiler', exports: { '.': { default: './index.mjs' } } }),
    );
    writeFileSync(join(workspace, 'package.json'), '{}');
    writeFileSync(join(workspace, 'ng.mjs'), CLI);
    writeFileSync(join(workspace, 'worker.mjs'), WORKER);
  });

  after(() => rmSync(workspace, { recursive: true, force: true }));

  it('turns source locations on for the dev server, worker threads included', () => {
    useCompiler(OLD_COMPILER);
    for (const args of [['serve'], ['s', '--port', '4201'], ['dev'], ['run', 'app:serve']]) {
      assert.deepEqual(ng(...args), { main: true, worker: true }, args.join(' '));
    }
  });

  it('leaves every other command alone', () => {
    useCompiler(OLD_COMPILER);
    for (const args of [['build'], ['build', '--configuration', 'production'], ['test'], []]) {
      assert.deepEqual(ng(...args), { main: false, worker: false }, args.join(' '));
    }
  });

  it('does nothing in Angular versions that have the compiler option', () => {
    useCompiler(NEW_COMPILER);
    assert.deepEqual(ng('serve'), { main: false, worker: false });
  });

  it('does nothing outside of an Angular workspace', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'ngx-source-inspector-'));
    try {
      writeFileSync(join(elsewhere, 'ng.mjs'), 'console.log("started")');
      const output = execFileSync(process.execPath, ['--import', preload, 'ng.mjs', 'serve'], {
        cwd: elsewhere,
        encoding: 'utf8',
      });
      assert.equal(output.trim(), 'started');
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});
