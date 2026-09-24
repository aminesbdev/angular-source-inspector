# Angular template source inspector (prototype)

Hold Alt (Option on macOS), hover any element to see which component and which template line it
comes from, and Alt+click to open that exact line in your editor.

This is a small experiment to see how far the pieces already in Angular get us. It goes with
[angular/angular#70927](https://github.com/angular/angular/issues/70927), it's not a library.

## Try it

Requires Node.js 22.22.3+ or 24.15+.

```sh
npm install
npm start
```

Open http://localhost:4200, hold Alt and move the mouse over the page, then Alt+click something.

The editor is opened by the dev server's `/__open-in-editor` endpoint (Vite's `launch-editor`
middleware). It detects the editor that's currently running. If yours isn't detected, point
`LAUNCH_EDITOR` to it. It gets called with `<file> <line> <column>`:

```sh
LAUNCH_EDITOR=code npm start
```

## How it works

- `tsconfig.dev.json` turns on the `enableTemplateSourceLocations` compiler option. It's only used
  by the `development` configuration in `angular.json`. With it, the compiler adds a
  `data-ng-source-location="src/app/app.html@o:9,l:1,c:2"` attribute to every template element.
- `src/dev/source-inspector.ts` reads that attribute on hover and click. It falls back to the
  component's debug info (class file and line) when the attribute isn't there. That fallback reads
  the private `ɵcmp`.
- `src/main.ts` only loads the inspector when `isDevMode()` is true.

## Things worth knowing

- If you turn the option on in `tsconfig.app.json` instead, the template paths end up in the
  production bundle. That's why it lives in a dev-only tsconfig here. Compare
  `ng build` (no paths) with a production build using `tsconfig.dev.json`.
- Clicking a component's host element opens the template where the component is *used*, not
  its own template.
- The demo covers an external template (`product-card`), an inline template (`price-tag.ts`) and
  content projection.
