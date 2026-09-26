import {
  closestAcrossShadowRoots,
  isProjectRelativePath,
  parseSourceLocation,
  resolveSource,
} from './source-location';

describe('parseSourceLocation', () => {
  it('turns the 0-based line and column into 1-based ones', () => {
    expect(parseSourceLocation('src/app/app.html@o:9,l:1,c:2')).toEqual({
      file: 'src/app/app.html',
      line: 2,
      column: 3,
    });
  });

  it('keeps paths that contain @ or commas', () => {
    expect(parseSourceLocation('src/@shared/a,b.html@o:0,l:0,c:0')?.file).toBe(
      'src/@shared/a,b.html',
    );
  });

  it('returns null for anything else', () => {
    expect(parseSourceLocation('src/app/app.html')).toBeNull();
    expect(parseSourceLocation('src/app/app.html@l:1,c:2')).toBeNull();
    expect(parseSourceLocation('')).toBeNull();
  });
});

describe('isProjectRelativePath', () => {
  it('accepts project-relative paths', () => {
    expect(isProjectRelativePath('src/app/app.html')).toBe(true);
    expect(isProjectRelativePath('projects/lib/src/card.ts')).toBe(true);
  });

  it('rejects absolute paths and parent segments', () => {
    expect(isProjectRelativePath('/etc/hosts')).toBe(false);
    expect(isProjectRelativePath('C:\\Users\\me\\file.txt')).toBe(false);
    expect(isProjectRelativePath('\\\\server\\share')).toBe(false);
    expect(isProjectRelativePath('../../.ssh/config')).toBe(false);
    expect(isProjectRelativePath('src/../../outside.html')).toBe(false);
  });
});

describe('closestAcrossShadowRoots', () => {
  afterEach(() => document.body.replaceChildren());

  it('continues in the host tree when it reaches a shadow root', () => {
    document.body.innerHTML = '<section data-x><div id="host"></div></section>';
    const host = document.getElementById('host')!;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p><span>inner</span></p>';
    const span = shadow.querySelector('span')!;

    expect(closestAcrossShadowRoots(span, '[data-x]')).toBe(document.querySelector('section'));
  });

  it('prefers a match inside the shadow root', () => {
    document.body.innerHTML = '<section data-x><div id="host"></div></section>';
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p data-x><span>inner</span></p>';

    expect(closestAcrossShadowRoots(shadow.querySelector('span')!, '[data-x]')).toBe(
      shadow.querySelector('p'),
    );
  });
});

describe('resolveSource', () => {
  const component = {};
  const host = document.createElement('app-card');

  beforeEach(() => {
    (globalThis as any).ng = {
      getOwningComponent: () => component,
      getHostElement: () => host,
    };
  });

  afterEach(() => {
    delete (globalThis as any).ng;
    document.body.replaceChildren();
  });

  it('uses the nearest element that has a location', () => {
    document.body.innerHTML =
      '<button data-ng-source-location="src/app/card.html@o:0,l:4,c:2"><b>Buy</b></button>';

    const source = resolveSource(document.querySelector('b')!);

    expect(source?.element).toBe(document.querySelector('button'));
    expect(source?.location).toEqual({ file: 'src/app/card.html', line: 5, column: 3 });
    expect(source?.componentTag).toBe('app-card');
  });

  it('ignores elements that no Angular component owns', () => {
    (globalThis as any).ng.getOwningComponent = () => null;
    document.body.innerHTML = '<a data-ng-source-location="src/app/card.html@o:0,l:0,c:0">x</a>';

    expect(resolveSource(document.querySelector('a')!)).toBeNull();
  });

  it('ignores locations outside the project', () => {
    document.body.innerHTML = '<a data-ng-source-location="../../.ssh/config@o:0,l:0,c:0">x</a>';

    expect(resolveSource(document.querySelector('a')!)).toBeNull();
  });

  it('returns null when there is no location at all', () => {
    document.body.innerHTML = '<p>no location</p>';

    expect(resolveSource(document.querySelector('p')!)).toBeNull();
  });
});
