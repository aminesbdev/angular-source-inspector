# ngx-source-inspector

Hold Alt (Option on macOS) and hover any element of your Angular app to see which component and
which template line it comes from. Alt+click opens that line in your editor.

It only runs in development builds.

> **Experimental.** This relies on `enableTemplateSourceLocations`, a compiler option that Angular
> doesn't document and doesn't cover by semver. It could change or go away in any release. Tested
> with Angular 22.2. This isn't an official Angular package. The proposal to support this in Angular
> itself is [angular/angular#70927](https://github.com/angular/angular/issues/70927).

## Install

```sh
ng add ngx-source-inspector
```

This:

- creates a `tsconfig.dev.json` that turns on `enableTemplateSourceLocations`, and uses it for the
  `development` build configuration only (or turns the option on in the tsconfig that configuration
  already uses);
- adds `provideSourceInspector()` to your application providers.

Then run `ng serve`, hold Alt and move the mouse over the page.

### Manual setup

1. Create a tsconfig for development builds, next to your app's tsconfig:

   ```json
   {
     "extends": "./tsconfig.app.json",
     "angularCompilerOptions": {
       "enableTemplateSourceLocations": true
     }
   }
   ```

2. Use it in the `development` configuration of your build target in `angular.json`:

   ```json
   "development": {
     "tsConfig": "tsconfig.dev.json"
   }
   ```

3. Add the provider:

   ```ts
   import { provideSourceInspector } from 'ngx-source-inspector';

   export const appConfig: ApplicationConfig = {
     providers: [provideSourceInspector()],
   };
   ```

## Options

```ts
provideSourceInspector({ key: 'Shift' });
```

| Option            | Default               | Description                                                                                         |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `key`             | `'Alt'`               | Key to hold: `'Alt'`, `'Shift'`, `'Control'` or `'Meta'`. Some Linux window managers use Alt+click. |
| `openInEditorUrl` | `'/__open-in-editor'` | Dev server endpoint that opens a file. It gets `?file=<path>:<line>:<column>`.                      |
| `onOpen`          |                       | `(location) => void`, called instead of opening the editor.                                         |

## Opening the editor

The Angular CLI dev server runs on Vite, which serves `/__open-in-editor` (the `launch-editor`
middleware). It detects the editor that's running: VS Code, Cursor, WebStorm, Zed and others. If
yours isn't detected, set `LAUNCH_EDITOR`, which gets called with `<file> <line> <column>`:

```sh
LAUNCH_EDITOR=code ng serve
```

That endpoint comes from Vite and isn't documented by the Angular CLI. If it's missing, the
inspector copies `path:line:column` to the clipboard and tells you so.

## Production builds

Nothing ends up in production bundles, as long as the compiler option stays out of the tsconfig used
for production:

- `provideSourceInspector()` checks `ngDevMode`, which production builds replace with `false`, so it
  becomes an empty provider list and the inspector code is dropped from the bundle.
- The template paths come from the compiler option. If you turn it on in `tsconfig.app.json`, every
  template path ships in your production bundle. That's why it goes in a development-only tsconfig.

This repository's CI builds the demo app for production and fails if the bundle contains any
inspector code, `data-ng-source-location` attribute or template path. To check your own app, build
it for production and search the output for `data-ng-source-location`.

The inspector only sends project-relative paths (no absolute paths, no `..`) found on elements
rendered by an Angular component to the dev server, so injected markup can't be used to open an
arbitrary file.

## Known limitations

- The compiler makes paths relative to `rootDir`/`rootDirs`, while `/__open-in-editor` resolves them
  from the directory where `ng serve` runs. With a custom `rootDir`, or in some multi-project
  workspaces, Alt+click can open the wrong path.
- A component's host element points to the template where the component is used, not to its own
  template.
- Elements inside closed shadow roots can't be inspected. Open shadow roots work.
- Elements rendered by libraries compiled without the option (such as UI component libraries) have
  no location. The inspector uses the nearest element from your own templates instead.

## How it works

With `enableTemplateSourceLocations`, the Angular compiler adds a
`data-ng-source-location="src/app/app.html@o:9,l:1,c:2"` attribute to every element of your
templates. The inspector reads it on hover, uses Angular's `ng.getOwningComponent()` debugging
utility to find the component, and calls the dev server to open the file.

## Developing

Requires Node.js 22.22.3+ or 24.15+.

```sh
npm install
npm run build:lib         # library and ng-add schematic, in dist/ngx-source-inspector
npm start                 # demo app with the inspector
npm test                  # unit tests and schematic tests
npm run check:production  # production build of the demo, checked for leftovers
```

The first prototype, linked from the Angular issue, is tagged
[`prototype`](https://github.com/aminesbdev/angular-source-inspector/tree/prototype).

## License

MIT
