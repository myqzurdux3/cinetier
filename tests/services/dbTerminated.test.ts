import { describe, it, expect, vi, beforeEach } from 'vitest';
import { silenceConsoleError } from '../support/console';

// fake-indexeddb has no way to simulate the browser abnormally dropping a
// connection — there is no real process to crash — so 'terminated' cannot be
// provoked the way 'blocked' can in db.test.ts. Tested directly instead: mock
// 'idb' entirely, capture the callbacks db() hands to openDB, and invoke
// `terminated` ourselves.
const openDBMock = vi.fn();

vi.mock('idb', () => ({
  openDB: (...args: unknown[]) => openDBMock(...args) as unknown,
  deleteDB: vi.fn(),
}));

describe('db() when the connection is terminated', () => {
  beforeEach(() => {
    vi.resetModules();
    openDBMock.mockReset();
  });

  it('logs it and forgets the memoised connection, so the next call reopens rather than reusing a dead one', async () => {
    const consoleError = silenceConsoleError();
    const firstHandle = { marker: 'first' };
    const secondHandle = { marker: 'second' };
    let callbacks: { terminated?: () => void } = {};

    openDBMock.mockImplementationOnce((_name: unknown, _version: unknown, cb: unknown) => {
      callbacks = cb as typeof callbacks;
      return Promise.resolve(firstHandle);
    });

    const { db } = await import('@/services/db');
    const opened = await db();
    expect(opened).toBe(firstHandle);
    expect(openDBMock).toHaveBeenCalledTimes(1);

    // The browser drops the connection out from under us — not db.close().
    callbacks.terminated?.();
    expect(consoleError).toHaveBeenCalled();

    openDBMock.mockImplementationOnce(() => Promise.resolve(secondHandle));
    const reopened = await db();

    expect(reopened).toBe(secondHandle);
    expect(openDBMock).toHaveBeenCalledTimes(2);
  });
});
