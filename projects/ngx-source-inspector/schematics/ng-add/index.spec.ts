import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { beforeEach, describe, it } from 'node:test';

// Runs against the built collection, so build the library and the schematics first.
const collectionPath = resolve('dist/ngx-source-inspector/schematics/collection.json');
const runner = new SchematicTestRunner('ngx-source-inspector', collectionPath);
const angularRunner = new SchematicTestRunner(
  '@schematics/angular',
  // The package's export map would turn `collection.json` into `collection.json.js`.
  join(dirname(require.resolve('@schematics/angular/package.json')), 'collection.json'),
);

async function createApp(): Promise<UnitTestTree> {
  const workspace = await angularRunner.runSchematic('workspace', {
    name: 'workspace',
    newProjectRoot: 'projects',
    version: '22.2.0',
  });
  return angularRunner.runSchematic('application', { name: 'app', standalone: true }, workspace);
}

function readJson(tree: UnitTestTree, path: string) {
  // tsconfig files can have comments.
  const text = tree.readText(path).replace(/^\s*\/\*.*\*\/\s*$/gm, '');
  return JSON.parse(text);
}

function buildTarget(tree: UnitTestTree) {
  return readJson(tree, 'angular.json').projects.app.architect.build;
}

describe('ng-add', () => {
  let tree: UnitTestTree;

  beforeEach(async () => {
    tree = await createApp();
  });

  it('enables source locations for development builds only', async () => {
    const result = await runner.runSchematic('ng-add', { project: 'app' }, tree);

    const build = buildTarget(result);
    assert.equal(build.configurations.development.tsConfig, 'projects/app/tsconfig.dev.json');
    assert.equal(build.configurations.production.tsConfig, undefined);
    assert.equal(build.options.tsConfig, 'projects/app/tsconfig.app.json');

    const devTsConfig = readJson(result, 'projects/app/tsconfig.dev.json');
    assert.equal(devTsConfig.extends, './tsconfig.app.json');
    assert.equal(devTsConfig.angularCompilerOptions.enableTemplateSourceLocations, true);
    const appTsConfig = readJson(result, 'projects/app/tsconfig.app.json');
    assert.equal(appTsConfig.angularCompilerOptions?.enableTemplateSourceLocations, undefined);
  });

  it('adds provideSourceInspector() to the application providers', async () => {
    const result = await runner.runSchematic('ng-add', { project: 'app' }, tree);

    const appConfig = result.readText('projects/app/src/app/app.config.ts');
    assert.match(appConfig, /import \{ provideSourceInspector \} from 'ngx-source-inspector';/);
    assert.match(appConfig, /provideSourceInspector\(\)/);
  });

  it('can run twice without duplicating anything', async () => {
    const once = await runner.runSchematic('ng-add', { project: 'app' }, tree);
    const twice = await runner.runSchematic('ng-add', { project: 'app' }, once);

    const appConfig = twice.readText('projects/app/src/app/app.config.ts');
    assert.equal(appConfig.match(/provideSourceInspector\(\)/g)?.length, 1);
    assert.equal(
      buildTarget(twice).configurations.development.tsConfig,
      'projects/app/tsconfig.dev.json',
    );
  });

  it('turns the option on in an existing development tsconfig', async () => {
    tree.create(
      'projects/app/tsconfig.local.json',
      '// my dev settings\n{"extends": "./tsconfig.app.json", "compilerOptions": {"sourceMap": true}}',
    );
    const angularJson = readJson(tree, 'angular.json');
    angularJson.projects.app.architect.build.configurations.development.tsConfig =
      'projects/app/tsconfig.local.json';
    tree.overwrite('angular.json', JSON.stringify(angularJson, null, 2));

    const result = await runner.runSchematic('ng-add', { project: 'app' }, tree);

    assert.equal(result.exists('projects/app/tsconfig.dev.json'), false);
    const local = result.readText('projects/app/tsconfig.local.json');
    assert.match(local, /\/\/ my dev settings/);
    assert.match(local, /"enableTemplateSourceLocations": true/);
    assert.match(local, /"sourceMap": true/);
  });

  it('refuses to set up a project without a development configuration', async () => {
    const angularJson = readJson(tree, 'angular.json');
    delete angularJson.projects.app.architect.build.configurations.development;
    tree.overwrite('angular.json', JSON.stringify(angularJson, null, 2));

    await assert.rejects(
      runner.runSchematic('ng-add', { project: 'app' }, tree),
      /no "development" build configuration/,
    );
  });
});
