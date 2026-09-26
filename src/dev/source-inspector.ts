/**
 * Prototype: hold Alt, hover any element to see where it comes from, Alt+click to open that
 * exact spot in your editor.
 *
 * It relies on two things Angular already produces in development:
 *  - `data-ng-source-location` on every template element, emitted by the compiler when
 *    `enableTemplateSourceLocations` is on (exact template file, line and column);
 *  - the component debug info (`ClassDebugInfo`), always emitted in dev mode, used as a fallback
 *    (component class file and line).
 * Opening the editor is delegated to the dev server's `/__open-in-editor` endpoint (Vite's
 * launch-editor middleware), which detects the running editor or uses `LAUNCH_EDITOR`.
 */

export interface SourceLocation {
  /** Project-relative path, as emitted by the compiler. */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** Where the location came from. */
  kind: 'template' | 'component';
}

const SOURCE_LOCATION_ATTR = 'data-ng-source-location';

/** Parses `path@o:<offset>,l:<line>,c:<column>`, where line and column are 0-based. */
export function parseSourceLocation(value: string): SourceLocation | null {
  const match = /^(.+)@o:\d+,l:(\d+),c:(\d+)$/.exec(value);
  if (!match) return null;
  return {file: match[1], line: Number(match[2]) + 1, column: Number(match[3]) + 1, kind: 'template'};
}

/**
 * The path is sent to the dev server, which opens it in the editor. Only accept project-relative
 * paths, so an attribute that didn't come from the compiler (injected HTML, a browser extension)
 * can't be used to open an arbitrary file.
 */
function isProjectRelativePath(file: string): boolean {
  const isAbsolute = /^([a-zA-Z]:)?[\\/]/.test(file);
  return !isAbsolute && !file.split(/[\\/]/).includes('..');
}

export function findSourceLocation(element: Element): SourceLocation | null {
  const tagged = element.closest(`[${SOURCE_LOCATION_ATTR}]`);
  // Only trust the attribute on elements rendered by an Angular component.
  if (tagged && owningComponent(tagged)) {
    const location = parseSourceLocation(tagged.getAttribute(SOURCE_LOCATION_ATTR)!);
    return location && isProjectRelativePath(location.file) ? location : null;
  }

  // Fallback when template locations are off: the owning component's class.
  // Note: `ɵcmp` is private, a real implementation would need a public way to read this.
  const debugInfo = owningComponent(element)?.constructor?.ɵcmp?.debugInfo;
  if (debugInfo?.filePath) {
    return {file: debugInfo.filePath, line: debugInfo.lineNumber, column: 1, kind: 'component'};
  }
  return null;
}

function owningComponent(element: Element): any {
  return (globalThis as any).ng?.getOwningComponent?.(element) ?? null;
}

export function installSourceInspector() {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #e91e63;' +
    'background:rgba(233,30,99,.08);display:none';
  const label = document.createElement('div');
  label.style.cssText =
    'position:absolute;left:0;bottom:100%;white-space:nowrap;font:12px/1.6 monospace;' +
    'background:#e91e63;color:#fff;padding:0 6px;border-radius:3px 3px 0 0';
  overlay.append(label);
  document.body.append(overlay);

  const hide = () => {
    overlay.style.display = 'none';
  };

  const show = (element: Element) => {
    const location = findSourceLocation(element);
    if (!location) return hide();
    const rect = element.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    // Dev builds rename classes (e.g. `_App`), the debug info keeps the source name.
    const component = owningComponent(element)?.constructor?.ɵcmp?.debugInfo?.className;
    label.textContent =
      `${component ? component + ' · ' : ''}${location.file}:${location.line}:${location.column}`;
  };

  document.addEventListener(
    'mousemove',
    (event) => {
      if (event.altKey && event.target instanceof Element && !overlay.contains(event.target)) {
        show(event.target);
      } else if (!event.altKey) {
        hide();
      }
    },
    true,
  );
  document.addEventListener('keyup', (event) => event.key === 'Alt' && hide(), true);

  document.addEventListener(
    'click',
    (event) => {
      if (!event.altKey || !(event.target instanceof Element)) return;
      const location = findSourceLocation(event.target);
      if (!location) return;
      event.preventDefault();
      event.stopPropagation();

      // The dev server finds and opens the right editor, so the page needs to know neither the
      // editor nor the absolute path.
      const file = `${location.file}:${location.line}:${location.column}`;
      const notify = new CustomEvent('ng-open-source', {detail: {file, location}, cancelable: true});
      if (document.dispatchEvent(notify)) {
        fetch(`/__open-in-editor?file=${encodeURIComponent(file)}`);
      }
      hide();
    },
    true,
  );

  console.info('[source-inspector] Ready. Hold Alt and click an element to open it in your editor.');
}
