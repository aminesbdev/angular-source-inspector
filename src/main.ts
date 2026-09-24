import {isDevMode} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {App} from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    if (isDevMode()) {
      import('./dev/source-inspector').then((m) => m.installSourceInspector());
    }
  })
  .catch((err) => console.error(err));
