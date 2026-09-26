import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {App} from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    // Checking `ngDevMode` directly rather than calling `isDevMode()`: production builds replace it
    // with `false`, so the bundler drops the import and the inspector chunk isn't emitted at all.
    if (typeof ngDevMode !== 'undefined' && ngDevMode) {
      import('./dev/source-inspector').then((m) => m.installSourceInspector());
    }
  })
  .catch((err) => console.error(err));
