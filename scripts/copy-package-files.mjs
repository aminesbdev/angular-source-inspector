// The repository README and license are also the package's.
import { cpSync } from 'node:fs';

const destination = 'dist/ngx-source-inspector';

for (const file of ['README.md', 'LICENSE']) {
  cpSync(file, `${destination}/${file}`);
}

// The preload for `ng serve` is plain JavaScript for Node.js, there's nothing to compile.
const preload = 'node/enable-source-locations.mjs';
cpSync(`projects/ngx-source-inspector/${preload}`, `${destination}/${preload}`);
