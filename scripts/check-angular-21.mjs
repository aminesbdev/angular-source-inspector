// Checks the package with Angular 21, which doesn't have the compiler option yet: sets up a new
// Angular 21 app with `ng add`, then checks that `ng serve` with the preload produces source
// locations and that a production build doesn't. Run after `npm run build:lib`.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const PRELOAD = '--import ngx-source-inspector/enable-source-locations';
const repository = process.cwd();
const workspace = mkdtempSync(join(tmpdir(), 'ngx-source-inspector-'));
const app = join(workspace, 'app');
const env = { ...process.env, NODE_OPTIONS: PRELOAD, NG_CLI_ANALYTICS: 'false' };

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Starts `ng serve` with the preload and returns the `main.js` that it serves. */
async function servedMainBundle() {
  const server = spawn('npx', ['ng', 'serve', '--port', '0'], { cwd: app, env, detached: true });
  try {
    const url = await new Promise((resolveUrl, reject) => {
      let output = '';
      server.stdout.on('data', (chunk) => {
        // The CLI colors its output in CI, in the middle of the URL too.
        output += stripVTControlCharacters(String(chunk));
        const match = /Local:\s+(http:\/\/[\w.:]+)/.exec(output);
        if (match) {
          resolveUrl(match[1]);
        }
      });
      server.stderr.pipe(process.stderr);
      server.on('exit', () => reject(new Error(`ng serve stopped:\n${output}`)));
      setTimeout(() => reject(new Error(`ng serve didn't start:\n${output}`)), 120_000).unref();
    });
    return await (await fetch(`${url}/main.js`)).text();
  } finally {
    // The whole process group: npx, the CLI and its workers.
    process.kill(-server.pid);
  }
}

try {
  const [{ filename }] = JSON.parse(
    run('npm', ['pack', './dist/ngx-source-inspector', '--pack-destination', workspace, '--json']),
  );
  run('npx', ['-y', '@angular/cli@21', 'new', 'app', '--defaults', '--skip-git', '--skip-tests'], {
    cwd: workspace,
  });
  const { version } = JSON.parse(
    readFileSync(join(app, 'node_modules/@angular/core/package.json'), 'utf8'),
  );
  console.log(`Checking with Angular ${version}.`);

  run('npx', ['ng', 'add', join(workspace, filename), '--skip-confirmation'], { cwd: app });
  check(
    readFileSync(join(app, 'src/app/app.config.ts'), 'utf8').includes('provideSourceInspector()'),
    "ng add didn't add provideSourceInspector().",
  );
  check(
    !existsSync(join(app, 'tsconfig.dev.json')),
    "ng add set up the compiler option, which this version of Angular doesn't have.",
  );

  check(
    (await servedMainBundle()).includes('attachSourceLocations("src/app/app.html"'),
    "ng serve with the preload didn't produce source locations.",
  );

  run('npx', ['ng', 'build'], { cwd: app, env });
  run(
    process.execPath,
    [resolve(repository, 'scripts/check-production-bundle.mjs'), 'dist/app/browser'],
    { cwd: app, stdio: 'inherit' },
  );
  console.log(`OK: ng add, source locations in ng serve and a clean production build.`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
