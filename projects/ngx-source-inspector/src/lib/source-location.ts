/** Where a template element comes from. */
export interface SourceLocation {
  /** Path of the template file, relative to the project, as emitted by the Angular compiler. */
  file: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
}

/**
 * Attribute that the Angular compiler adds to every template element when the
 * `enableTemplateSourceLocations` compiler option is on.
 */
export const SOURCE_LOCATION_ATTRIBUTE = 'data-ng-source-location';

/**
 * Parses the value of the `data-ng-source-location` attribute: `<path>@o:<offset>,l:<line>,c:<column>`,
 * where line and column are 0-based. Returns `null` for anything else.
 */
export function parseSourceLocation(value: string): SourceLocation | null {
  // Greedy on the path, so a path that contains `@` or `,` still parses.
  const match = /^(.+)@o:\d+,l:(\d+),c:(\d+)$/.exec(value);
  if (!match) {
    return null;
  }
  return { file: match[1], line: Number(match[2]) + 1, column: Number(match[3]) + 1 };
}

/**
 * The path ends up being opened by the dev server, so only project-relative paths are accepted: an
 * attribute that didn't come from the compiler (injected HTML, a browser extension) can't be used to
 * open a file outside the project.
 */
export function isProjectRelativePath(file: string): boolean {
  const isAbsolute = /^([a-zA-Z]:)?[\\/]/.test(file);
  return !isAbsolute && !file.split(/[\\/]/).includes('..');
}

/** Like `Element.closest`, but keeps looking in the host's tree when it reaches a shadow root. */
export function closestAcrossShadowRoots(start: Element, selector: string): Element | null {
  let element: Element | null = start;
  while (element) {
    const found = element.closest(selector);
    if (found) {
      return found;
    }
    const root = element.getRootNode();
    element = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

/** Subset of Angular's global debugging utilities (the `ng` global) used here. */
interface AngularDebugGlobals {
  getOwningComponent?(element: Element): object | null;
  getHostElement?(component: object): Element | null;
}

function angularDebugGlobals(): AngularDebugGlobals | undefined {
  return (globalThis as { ng?: AngularDebugGlobals }).ng;
}

/** The template element that `element` belongs to, and its location. */
export interface ResolvedSource {
  /** Nearest element (possibly `element` itself) carrying a source location. */
  element: Element;
  location: SourceLocation;
  /** Tag name of the component whose template declares `element`, e.g. `app-product-card`. */
  componentTag: string | null;
}

/**
 * Finds the source location of `element`: the one on the element itself, or on its nearest ancestor
 * that has one. Only elements rendered by an Angular component are trusted.
 */
export function resolveSource(element: Element): ResolvedSource | null {
  const tagged = closestAcrossShadowRoots(element, `[${SOURCE_LOCATION_ATTRIBUTE}]`);
  if (!tagged) {
    return null;
  }
  const ng = angularDebugGlobals();
  const owner = ng?.getOwningComponent?.(tagged) ?? null;
  if (!owner) {
    return null;
  }
  const location = parseSourceLocation(tagged.getAttribute(SOURCE_LOCATION_ATTRIBUTE)!);
  if (!location || !isProjectRelativePath(location.file)) {
    return null;
  }
  const host = ng?.getHostElement?.(owner) ?? null;
  return { element: tagged, location, componentTag: host ? host.tagName.toLowerCase() : null };
}

/** `path:line:column`, the format editors and `launch-editor` understand. */
export function formatLocation({ file, line, column }: SourceLocation): string {
  return `${file}:${line}:${column}`;
}
