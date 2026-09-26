// Copies the non-TypeScript files of the schematics next to the compiled code.
import { cpSync, globSync } from 'node:fs';
import { join } from 'node:path';

const source = 'projects/ngx-source-inspector/schematics';
const destination = 'dist/ngx-source-inspector/schematics';

for (const file of globSync('**/*.json', { cwd: source })) {
  cpSync(join(source, file), join(destination, file));
}
