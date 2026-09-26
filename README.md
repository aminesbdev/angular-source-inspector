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
- `src/main.ts` only loads the inspector in development. It checks `ngDevMode` directly rather
  than calling `isDevMode()`: a production build replaces `ngDevMode` with `false`, so the import
  is dropped and no inspector chunk ends up in `dist/`. With `isDevMode()` the bundler can't do
  that, and the chunk was emitted (though never loaded).
- Only project-relative paths found on elements rendered by an Angular component are sent to the
  dev server, so injected markup can't be used to open a file outside the project.

## Things worth knowing

- If you turn the option on in `tsconfig.app.json` instead, the template paths end up in the
  production bundle. That's why it lives in a dev-only tsconfig here. Compare
  `ng build` (no paths) with a production build using `tsconfig.dev.json`.
- Clicking a component's host element opens the template where the component is *used*, not
  its own template.
- The demo covers an external template (`product-card`), an inline template (`price-tag.ts`) and
  content projection.

## Known limitations

- **Shadow DOM**: in a component using `ViewEncapsulation.ShadowDom`, the event target is the host,
  so you get the line where the component is used rather than the element inside it.
- **Paths**: the compiler makes paths relative to `rootDir`/`rootDirs` and may lowercase them on
  case-insensitive file systems, while `/__open-in-editor` resolves them from the directory where
  `ng serve` runs. With a custom `rootDir`, or in a multi-project workspace, Alt+click can point to
  the wrong place.
- **Alt key**: some Linux window managers use Alt+click themselves, and on Windows AltGr is
  reported as Alt. The modifier would need to be configurable in a real tool.
- Only `click` is intercepted, so `mousedown`/`pointerdown` handlers on the element still run.
