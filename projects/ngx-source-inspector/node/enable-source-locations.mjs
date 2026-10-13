// Turns on template source locations in Angular versions that don't have the
// `enableTemplateSourceLocations` compiler option yet (before 22.1.4). Preload it into `ng serve`:
//
//   NODE_OPTIONS="--import ngx-source-inspector/enable-source-locations" ng serve
//
// In those versions the only switch is `setEnableTemplateSourceLocations()`, a function that
// `@angular/compiler` exports for Angular's own tests. It has to be called in the process, or the
// worker thread, that compiles the templates, which is why this is a preload.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';

// Set by the process that runs the dev server, read by its worker threads and child processes,
// which don't get the command line.
const SERVING = 'NGX_SOURCE_INSPECTOR_SERVING';

// `ng serve`, `ng s`, `ng dev`, `ng run app:serve`, `nx serve app`...
const isServeCommand = (arg) => /^(serve|s|dev)$|(^|:)serve(:|$)/.test(arg);

// NODE_OPTIONS reaches every Node.js process started with it, `ng build` included. Template paths
// must not end up in production bundles, so this only does something for the dev server.
const startsDevServer = isMainThread && process.argv.slice(2).some(isServeCommand);
const alreadyServing = process.env[SERVING] === '1';

if (startsDevServer || alreadyServing) {
  process.env[SERVING] = '1';
  const compiler = await importWorkspaceCompiler();
  if (typeof compiler?.setEnableTemplateSourceLocations === 'function') {
    compiler.setEnableTemplateSourceLocations(true);
  } else if (compiler && !alreadyServing) {
    console.warn(
      '[ngx-source-inspector] This version of Angular has the `enableTemplateSourceLocations` ' +
        'compiler option, the `enable-source-locations` preload does nothing. Remove it and run ' +
        '`ng add ngx-source-inspector` to turn the option on for development builds.',
    );
  }
}

/** The copy of `@angular/compiler` that the CLI of the current workspace compiles with. */
async function importWorkspaceCompiler() {
  try {
    const require = createRequire(join(process.cwd(), 'package.json'));
    return await import(pathToFileURL(require.resolve('@angular/compiler')).href);
  } catch {
    // Not in an Angular workspace: another process that inherited NODE_OPTIONS.
    return null;
  }
}
