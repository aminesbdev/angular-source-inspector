import { install } from './inspector';

describe('install', () => {
  let uninstall: () => void;
  let fetchMock: ReturnType<typeof vi.fn>;

  const click = (element: Element, init: MouseEventInit = {}) => {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      ...init,
    });
    element.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    (globalThis as any).ng = {
      getOwningComponent: () => ({}),
      getHostElement: () => document.createElement('app-card'),
    };
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    document.body.innerHTML =
      '<button data-ng-source-location="src/app/card.html@o:0,l:4,c:2">Buy</button>';
    uninstall = install(document);
  });

  afterEach(() => {
    uninstall();
    delete (globalThis as any).ng;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('opens the element in the editor on Alt+click', async () => {
    const onPageClick = vi.fn();
    document.body.addEventListener('click', onPageClick);

    const event = click(document.querySelector('button')!, { altKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onPageClick).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `/__open-in-editor?file=${encodeURIComponent('src/app/card.html:5:3')}`,
    );
  });

  it('keeps regular clicks untouched', () => {
    const onPageClick = vi.fn();
    document.body.addEventListener('click', onPageClick);

    const event = click(document.querySelector('button')!);

    expect(event.defaultPrevented).toBe(false);
    expect(onPageClick).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops pointer events from reaching the page while the key is held', () => {
    const onPointerDown = vi.fn();
    document.body.addEventListener('mousedown', onPointerDown);

    document
      .querySelector('button')!
      .dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, altKey: true }),
      );

    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it('copies the location to the clipboard when the editor endpoint is missing', async () => {
    fetchMock.mockResolvedValue(
      new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    click(document.querySelector('button')!, { altKey: true });
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('src/app/card.html:5:3'));

    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Copied src/app/card.html:5:3',
    );
  });

  it('can use another key', () => {
    uninstall();
    uninstall = install(document, { key: 'Shift' });

    click(document.querySelector('button')!, { altKey: true });
    expect(fetchMock).not.toHaveBeenCalled();

    click(document.querySelector('button')!, { shiftKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen instead of the editor endpoint when given', () => {
    uninstall();
    const onOpen = vi.fn();
    uninstall = install(document, { onOpen });

    click(document.querySelector('button')!, { altKey: true });

    expect(onOpen).toHaveBeenCalledWith({ file: 'src/app/card.html', line: 5, column: 3 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('installs only once and removes everything when uninstalled', () => {
    expect(install(document)).toBe(uninstall);
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBe(1);

    uninstall();

    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
    click(document.querySelector('button')!, { altKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
