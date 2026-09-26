// Fails if anything from the inspector or the template source locations made it into the
// production build of the demo app. Run after `ng build inspector-demo --configuration production`.
import { globSync, readFileSync } from 'node:fs';

const outputDir = 'dist/inspector-demo/browser';
const forbidden = [
  // The inspector itself.
  'ngx-source-inspector',
  '__open-in-editor',
  // The compiler option's output: the instruction, the attribute and the template paths.
  'attachSourceLocations',
  'data-ng-source-location',
  'src/app/',
];

const files = globSync('**/*.js', { cwd: outputDir });
if (files.length === 0) {
  console.error(`No JavaScript files in ${outputDir}, build the demo app for production first.`);
  process.exit(1);
}

const problems = [];
for (const file of files) {
  const code = readFileSync(`${outputDir}/${file}`, 'utf8');
  for (const needle of forbidden) {
    if (code.includes(needle)) {
      problems.push(`${file} contains "${needle}"`);
    }
  }
}

if (problems.length > 0) {
  console.error('The production build contains development-only code:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(
  `OK: none of ${files.length} production files contain inspector code or source locations.`,
);
