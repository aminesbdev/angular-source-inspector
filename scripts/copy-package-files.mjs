// The repository README and license are also the package's.
import { cpSync } from 'node:fs';

for (const file of ['README.md', 'LICENSE']) {
  cpSync(file, `dist/ngx-source-inspector/${file}`);
}
