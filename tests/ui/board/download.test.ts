import { describe, it, expect, vi, afterEach } from 'vitest';
import { download } from '@/ui/board/download';

/**
 * jsdom implements neither `createObjectURL` nor `revokeObjectURL`, and a real
 * click on an anchor with a `download` attribute does nothing there either. So
 * what is checked is the sequence: the two details the comments in that module
 * call load-bearing are both about *when* things happen, not about the file.
 */
function stubObjectUrls() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn((blob: Blob) => {
      created.push(blob);
      return `blob:test/${String(created.length)}`;
    }),
    revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
  });
  return { created, revoked };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('download', () => {
  it('names the file and points it at the blob', () => {
    stubObjectUrls();
    let named = '';
    let href = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      // Read here rather than captured: the anchor leaves the document as soon
      // as this returns.
      named = this.download;
      href = this.href;
    });

    download(new Blob(['x']), 'cinetier-mine.png');

    expect(click).toHaveBeenCalledOnce();
    expect(named).toBe('cinetier-mine.png');
    expect(href).toBe('blob:test/1');
    click.mockRestore();
  });

  it('has the anchor in the document at the moment it is clicked', () => {
    // A detached anchor works in Chrome and has not always worked elsewhere.
    // Asserted from inside the click, because by the time `download` returns
    // the anchor is gone either way.
    stubObjectUrls();
    let wasConnected: boolean | null = null;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      wasConnected = this.isConnected;
    });

    download(new Blob(['x']), 'f.png');

    expect(wasConnected).toBe(true);
    click.mockRestore();
  });

  it('leaves nothing behind in the document', () => {
    stubObjectUrls();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const before = document.body.childElementCount;

    download(new Blob(['x']), 'f.png');

    expect(document.body.childElementCount).toBe(before);
    click.mockRestore();
  });

  it('revokes the url on the next task, not before the browser has read it', () => {
    // Revoking immediately hands a browser that has not started reading yet a
    // dead url, and the download silently produces nothing.
    vi.useFakeTimers();
    const { revoked } = stubObjectUrls();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    download(new Blob(['x']), 'f.png');
    expect(revoked).toEqual([]);

    vi.runAllTimers();
    expect(revoked).toEqual(['blob:test/1']);
    click.mockRestore();
  });
});
