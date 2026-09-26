import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideAppInitializer,
} from '@angular/core';

import { install, SourceInspectorOptions } from './inspector';

/**
 * Hold Alt and hover an element to see which template and line it comes from, Alt+click to open that
 * line in your editor.
 *
 * Add it to your application providers. It only does something in development builds: production
 * builds replace `ngDevMode` with `false`, so this becomes an empty provider list and the inspector
 * code is removed from the bundle. It also does nothing during server-side rendering.
 *
 * The template locations come from the `enableTemplateSourceLocations` compiler option, which must
 * only be enabled for development builds. `ng add ngx-source-inspector` sets that up.
 */
export function provideSourceInspector(options: SourceInspectorOptions = {}): EnvironmentProviders {
  return typeof ngDevMode !== 'undefined' && ngDevMode
    ? makeEnvironmentProviders([provideAppInitializer(() => installInBrowser(options))])
    : makeEnvironmentProviders([]);
}

function installInBrowser(options: SourceInspectorOptions): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return;
  }
  const uninstall = install(inject(DOCUMENT), options);
  inject(DestroyRef).onDestroy(uninstall);
}
