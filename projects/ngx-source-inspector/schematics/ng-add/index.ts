import {
  chain,
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
} from '@angular-devkit/schematics';
import { addRootProvider, readWorkspace, updateWorkspace } from '@schematics/angular/utility';
import { JSONFile } from '@schematics/angular/utility/json-file';
import { posix } from 'node:path';

export interface NgAddOptions {
  project?: string;
}

const PACKAGE_NAME = 'ngx-source-inspector';
const DEV_TSCONFIG_NAME = 'tsconfig.dev.json';
const COMPILER_OPTION = ['angularCompilerOptions', 'enableTemplateSourceLocations'];
// First Angular version that has the compiler option.
const COMPILER_OPTION_SINCE = [22, 1, 4];
const PRELOAD = `NODE_OPTIONS="--import ${PACKAGE_NAME}/enable-source-locations" ng serve`;

/**
 * - Turns on the `enableTemplateSourceLocations` compiler option for the `development` build
 *   configuration only, so template paths never end up in production bundles. Angular versions
 *   that don't have the option need a preload when starting `ng serve` instead.
 * - Adds `provideSourceInspector()` to the application providers.
 */
export function ngAdd(options: NgAddOptions): Rule {
  return async (tree, context) => {
    const workspace = await readWorkspace(tree);
    const projectName = options.project ?? singleApplication(workspace);
    const project = workspace.projects.get(projectName);
    if (!project || project.extensions['projectType'] !== 'application') {
      throw new SchematicsException(`"${projectName}" isn't an application in this workspace.`);
    }
    const usePreload = !hasCompilerOption(tree);
    const rules: Rule[] = usePreload
      ? []
      : enableForDevelopment(tree, projectName, project, context);

    const sourceRoot = project.sourceRoot ?? posix.join(project.root, 'src');
    if (containsProviderCall(tree, sourceRoot)) {
      context.logger.info('provideSourceInspector() is already in the application providers.');
    } else {
      rules.push(
        addRootProvider(
          projectName,
          ({ code, external }) => code`${external('provideSourceInspector', PACKAGE_NAME)}()`,
        ),
      );
    }

    rules.push(() => {
      context.logger.info(
        usePreload
          ? 'Done. This version of Angular has no compiler option for template source locations, ' +
              'start the dev server with the preload that turns them on:\n' +
              `  ${PRELOAD}\n` +
              'Then hold Alt (Option on macOS) and hover the page, Alt+click to open the element ' +
              'in your editor.'
          : 'Done. Run `ng serve`, hold Alt (Option on macOS) and hover the page, Alt+click to ' +
              'open the element in your editor.\n' +
              'Keep `enableTemplateSourceLocations` out of the tsconfig used for production ' +
              'builds, or template paths will end up in your bundles.',
      );
    });
    return chain(rules);
  };
}

type Workspace = Awaited<ReturnType<typeof readWorkspace>>;
type Project = NonNullable<ReturnType<Workspace['projects']['get']>>;

/** Whether the workspace's Angular has the compiler option. */
function hasCompilerOption(tree: Tree): boolean {
  // The installed version, or else the lowest one that package.json allows.
  const installed = 'node_modules/@angular/core/package.json';
  const version = tree.exists(installed)
    ? new JSONFile(tree, installed).get(['version'])
    : new JSONFile(tree, 'package.json').get(['dependencies', '@angular/core']);
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  if (!match) {
    return true;
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  const [sinceMajor, sinceMinor, sincePatch] = COMPILER_OPTION_SINCE;
  if (major !== sinceMajor) {
    return major > sinceMajor;
  }
  return minor !== sinceMinor ? minor > sinceMinor : patch >= sincePatch;
}

/** Turns the compiler option on in the tsconfig of the `development` build configuration. */
function enableForDevelopment(
  tree: Tree,
  projectName: string,
  project: Project,
  context: SchematicContext,
): Rule[] {
  const build = project.targets.get('build');
  const appTsConfig = build?.options?.['tsConfig'];
  if (!build || typeof appTsConfig !== 'string') {
    throw new SchematicsException(
      `Project "${projectName}" has no build target with a "tsConfig" option.`,
    );
  }
  const development = build.configurations?.['development'];
  if (!development) {
    throw new SchematicsException(
      `Project "${projectName}" has no "development" build configuration. ` +
        'The compiler option has to be limited to development builds, add that configuration first.',
    );
  }

  const rules: Rule[] = [];
  const currentDevTsConfig = development['tsConfig'];
  if (typeof currentDevTsConfig === 'string' && currentDevTsConfig !== appTsConfig) {
    // The development configuration already has its own tsconfig: turn the option on there.
    rules.push(enableCompilerOption(currentDevTsConfig));
  } else {
    const devTsConfig = posix.join(posix.dirname(appTsConfig), DEV_TSCONFIG_NAME);
    if (tree.exists(devTsConfig)) {
      throw new SchematicsException(
        `${devTsConfig} already exists but isn't used by the "development" configuration. ` +
          `Set "tsConfig" to it there and run ng add again.`,
      );
    }
    tree.create(devTsConfig, devTsConfigContent(posix.basename(appTsConfig)));
    rules.push(
      updateWorkspace((updated) => {
        const target = updated.projects.get(projectName)!.targets.get('build')!;
        target.configurations!['development']!['tsConfig'] = devTsConfig;
      }),
    );
    context.logger.info(`Created ${devTsConfig}, used by the "development" build configuration.`);
  }
  return rules;
}

function singleApplication(workspace: Workspace): string {
  const applications = [...workspace.projects]
    .filter(([, project]) => project.extensions['projectType'] === 'application')
    .map(([name]) => name);
  if (applications.length !== 1) {
    throw new SchematicsException(
      'Could not tell which application to set up. Run it again with --project=<name>.',
    );
  }
  return applications[0];
}

function devTsConfigContent(appTsConfigName: string): string {
  const config = {
    extends: `./${appTsConfigName}`,
    angularCompilerOptions: { enableTemplateSourceLocations: true },
  };
  return (
    '/* Used by the "development" build configuration only. */\n' +
    '/* enableTemplateSourceLocations adds the template file and line of every element to the DOM, */\n' +
    '/* used by ngx-source-inspector. Keep it out of production builds. */\n' +
    JSON.stringify(config, null, 2) +
    '\n'
  );
}

function enableCompilerOption(tsConfigPath: string): Rule {
  return (tree: Tree) => {
    if (!tree.exists(tsConfigPath)) {
      throw new SchematicsException(`Cannot find ${tsConfigPath}.`);
    }
    const file = new JSONFile(tree, tsConfigPath);
    if (file.get(COMPILER_OPTION) !== true) {
      file.modify(COMPILER_OPTION, true);
    }
  };
}

function containsProviderCall(tree: Tree, sourceRoot: string): boolean {
  let found = false;
  tree.getDir(sourceRoot).visit((path) => {
    if (!found && path.endsWith('.ts') && !path.endsWith('.spec.ts')) {
      found = tree.readText(path).includes('provideSourceInspector(');
    }
  });
  return found;
}
