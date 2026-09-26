import { formatLocation, resolveSource, ResolvedSource, SourceLocation } from './source-location';

/** Modifier key that turns the inspector on while it's held. */
export type SourceInspectorKey = 'Alt' | 'Shift' | 'Control' | 'Meta';

export interface SourceInspectorOptions {
  /**
   * Key to hold to inspect elements. Defaults to `'Alt'` (Option on macOS). Some Linux window
   * managers use Alt+click themselves, pick another key there.
   */
  key?: SourceInspectorKey;
  /**
   * Dev server endpoint that opens a file in the editor. It receives the location as
   * `?file=<path>:<line>:<column>`. Defaults to `/__open-in-editor`, provided by Vite, which the
   * Angular CLI dev server uses.
   */
  openInEditorUrl?: string;
  /** Called instead of the default behavior when an element is clicked. */
  onOpen?: (location: SourceLocation) => void;
}

const MODIFIER_PROPERTY = {
  Alt: 'altKey',
  Shift: 'shiftKey',
  Control: 'ctrlKey',
  Meta: 'metaKey',
} as const;

// Pointer events that would otherwise reach the page when clicking an element to open it.
const SWALLOWED_POINTER_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const;

const ACCENT = '#e91e63';

let uninstallCurrent: (() => void) | null = null;

/**
 * Installs the inspector on the current document and returns a function that removes it. Calling it
 * again while it's installed returns the same function.
 *
 * Only call this in development: `provideSourceInspector()` does it for you and is removed from
 * production builds.
 */
export function install(doc: Document, options: SourceInspectorOptions = {}): () => void {
  if (uninstallCurrent) {
    return uninstallCurrent;
  }
  const key = options.key ?? 'Alt';
  const modifier = MODIFIER_PROPERTY[key];
  const openInEditorUrl = options.openInEditorUrl ?? '/__open-in-editor';
  const win = doc.defaultView ?? window;

  const overlay = doc.createElement('div');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483647;display:none;' +
    `outline:2px solid ${ACCENT};background:rgba(233,30,99,.08)`;
  const label = doc.createElement('div');
  label.style.cssText =
    'position:absolute;left:0;white-space:nowrap;font:12px/1.6 ui-monospace,monospace;' +
    `background:${ACCENT};color:#fff;padding:0 6px`;
  overlay.append(label);

  const toast = doc.createElement('div');
  toast.setAttribute('role', 'status');
  toast.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:2147483647;display:none;max-width:60ch;' +
    'font:12px/1.5 ui-monospace,monospace;background:#24292f;color:#fff;padding:6px 10px;' +
    'border-radius:6px;pointer-events:none';
  doc.body.append(overlay, toast);

  let current: ResolvedSource | null = null;
  let pendingTarget: Element | null = null;
  let frame = 0;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let warnedMissingLocations = false;

  const hide = () => {
    current = null;
    overlay.style.display = 'none';
  };

  const position = () => {
    if (!current) {
      return;
    }
    const rect = current.element.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    // Keep the label on screen for elements at the very top of the page.
    const labelBelow = rect.top < 20;
    label.style.top = labelBelow ? '100%' : '';
    label.style.bottom = labelBelow ? '' : '100%';
  };

  const inspect = (target: Element) => {
    const source = resolveSource(target);
    if (!source) {
      if (!warnedMissingLocations && !doc.querySelector('[data-ng-source-location]')) {
        warnedMissingLocations = true;
        console.warn(
          '[ngx-source-inspector] No element has a `data-ng-source-location` attribute. Is the ' +
            '`enableTemplateSourceLocations` compiler option on for this build? `ng add ngx-source-inspector` sets it up.',
        );
      }
      hide();
      return;
    }
    if (current?.element !== source.element) {
      const component = source.componentTag ? `<${source.componentTag}> · ` : '';
      label.textContent = component + formatLocation(source.location);
    }
    current = source;
    position();
  };

  const scheduleInspect = (target: Element) => {
    pendingTarget = target;
    if (!frame) {
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        if (pendingTarget) {
          inspect(pendingTarget);
        }
      });
    }
  };

  // The innermost element, including inside shadow roots.
  const targetOf = (event: Event): Element | null => {
    const target = event.composedPath()[0];
    return target instanceof Element ? target : null;
  };

  const showToast = (message: string) => {
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.style.display = 'none'), 4000);
  };

  const open = async (location: SourceLocation) => {
    if (options.onOpen) {
      options.onOpen(location);
      return;
    }
    const file = formatLocation(location);
    try {
      const response = await fetch(`${openInEditorUrl}?file=${encodeURIComponent(file)}`);
      // A dev server without the endpoint may answer with its index.html (SPA fallback).
      const isHtml = response.headers.get('content-type')?.includes('text/html') ?? false;
      if (response.ok && !isHtml) {
        return;
      }
    } catch {
      // Handled below.
    }
    let copied = false;
    try {
      await win.navigator.clipboard.writeText(file);
      copied = true;
    } catch {
      // Clipboard access can be denied, the location is still shown below.
    }
    showToast(
      `Couldn't open the editor through ${openInEditorUrl}. ` +
        (copied ? `Copied ${file} to the clipboard.` : file),
    );
  };

  const onMouseMove = (event: MouseEvent) => {
    const target = targetOf(event);
    if (event[modifier] && target) {
      scheduleInspect(target);
    } else if (current) {
      hide();
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === key || (key === 'Alt' && event.key === 'AltGraph')) {
      hide();
    }
  };

  const onScroll = () => {
    if (current) {
      position();
    }
  };

  const onVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') {
      hide();
    }
  };

  const swallowPointer = (event: MouseEvent) => {
    const target = targetOf(event);
    if (event[modifier] && target && resolveSource(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const onClick = (event: MouseEvent) => {
    const target = targetOf(event);
    if (!event[modifier] || !target) {
      return;
    }
    const source = resolveSource(target);
    if (!source) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    hide();
    void open(source.location);
  };

  const listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions]> = [
    [doc, 'mousemove', onMouseMove as EventListener, { capture: true, passive: true }],
    [doc, 'keyup', onKeyUp as EventListener, { capture: true }],
    [doc, 'click', onClick as EventListener, { capture: true }],
    [doc, 'scroll', onScroll, { capture: true, passive: true }],
    [doc, 'visibilitychange', onVisibilityChange, {}],
    [win, 'blur', hide, {}],
    ...SWALLOWED_POINTER_EVENTS.map(
      (type): [EventTarget, string, EventListener, AddEventListenerOptions] => [
        doc,
        type,
        swallowPointer as EventListener,
        { capture: true },
      ],
    ),
  ];
  for (const [target, type, listener, listenerOptions] of listeners) {
    target.addEventListener(type, listener, listenerOptions);
  }

  const uninstall = () => {
    for (const [target, type, listener, listenerOptions] of listeners) {
      target.removeEventListener(type, listener, listenerOptions);
    }
    win.cancelAnimationFrame(frame);
    clearTimeout(toastTimer);
    overlay.remove();
    toast.remove();
    uninstallCurrent = null;
  };
  uninstallCurrent = uninstall;

  const keyName = key === 'Alt' ? 'Alt (Option on macOS)' : key;
  console.info(
    `[ngx-source-inspector] Hold ${keyName} to see where an element comes from, click to open it in your editor.`,
  );
  return uninstall;
}
