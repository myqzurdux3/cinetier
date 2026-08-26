import { describe, it, expect, vi, beforeEach } from 'vitest';
import { silenceConsoleError, silenceConsoleWarn } from '../support/console';

// The same approach as dbTerminated.test.ts, and for the same reason:
// fake-indexeddb cannot be made to reject an open, and it fires `blocking`
// only in a two-connection dance that says less about this module than
// invoking the callback does. 'idb' is mocked, the callbacks db() hands to
// openDB are captured, and each one is called directly.
const openDBMock = vi.fn();
const deleteDBMock = vi.fn();

vi.mock('idb', () => ({
  openDB: (...args: unknown[]) => openDBMock(...args) as unknown,
  deleteDB: (...args: unknown[]) => deleteDBMock(...args) as unknown,
}));

interface Callbacks {
  blocked?: (currentVersion: number, blockedVersion: number | null) => void;
  blocking?: (currentVersion: number, blockedVersion: number | null) => void;
}

describe('db() when the open fails', () => {
  beforeEach(() => {
    vi.resetModules();
    openDBMock.mockReset();
    deleteDBMock.mockReset();
  });

  it('does not memoise the failure, so the next call tries again', async () => {
    const handle = { marker: 'second' };
    openDBMock.mockImplementationOnce(() => Promise.reject(new Error('quota exceeded')));
    openDBMock.mockImplementationOnce(() => Promise.resolve(handle));

    const { db } = await import('@/services/db');

    // The failure still reaches the caller — this is not swallowed.
    await expect(db()).rejects.toThrow('quota exceeded');

    // And the session is not poisoned by it. A memoised rejected promise made
    // every later read and write fail for as long as the tab stayed open.
    await expect(db()).resolves.toBe(handle);
    expect(openDBMock).toHaveBeenCalledTimes(2);
  });
});

describe('db() when this tab is the one in the way', () => {
  beforeEach(() => {
    vi.resetModules();
    openDBMock.mockReset();
    deleteDBMock.mockReset();
  });

  it('closes its connection so the other tab can upgrade, and reopens on the next call', async () => {
    const consoleWarn = silenceConsoleWarn();
    const close = vi.fn();
    const first = { marker: 'first', close };
    const second = { marker: 'second', close: vi.fn() };
    let callbacks: Callbacks = {};

    openDBMock.mockImplementationOnce((_name: unknown, _version: unknown, cb: unknown) => {
      callbacks = cb as Callbacks;
      return Promise.resolve(first);
    });

    const { db } = await import('@/services/db');
    await db();

    callbacks.blocking?.(4, 5);
    // The close is awaited through the memoised promise, so it lands a
    // microtask later than the call.
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);

    // Closing without forgetting the promise would leave every later call
    // reusing a handle that is now shut.
    openDBMock.mockImplementationOnce(() => Promise.resolve(second));
    await expect(db()).resolves.toBe(second);
    expect(openDBMock).toHaveBeenCalledTimes(2);

    expect(consoleWarn.mock.calls[0]?.[0]).toMatch(/reload/i);
  });

  it('names an unknown blocked version rather than printing "null"', async () => {
    const consoleError = silenceConsoleError();
    let callbacks: Callbacks = {};
    openDBMock.mockImplementationOnce((_name: unknown, _version: unknown, cb: unknown) => {
      callbacks = cb as Callbacks;
      return Promise.resolve({ close: vi.fn() });
    });

    const { db } = await import('@/services/db');
    await db();

    // idb types the blocked version `number | null`, and a delete request
    // arrives here with null.
    callbacks.blocked?.(4, null);
    const message = String(consoleError.mock.calls[0]?.[0]);
    expect(message).not.toMatch(/null/);
    expect(message).toMatch(/unknown version/);
  });
});

describe('resetDatabase when another tab holds the database open', () => {
  beforeEach(() => {
    vi.resetModules();
    openDBMock.mockReset();
    deleteDBMock.mockReset();
  });

  it('says so instead of hanging silently', async () => {
    const consoleError = silenceConsoleError();
    deleteDBMock.mockImplementation(() => Promise.resolve());

    const { resetDatabase } = await import('@/services/db');
    await resetDatabase();

    const options = deleteDBMock.mock.calls[0]?.[1] as
      { blocked?: (currentVersion: number) => void } | undefined;
    // Without a handler here the delete's promise never settles, and "start
    // over" looks like a button that does nothing.
    expect(options?.blocked).toBeTypeOf('function');

    options?.blocked?.(4);
    expect(String(consoleError.mock.calls[0]?.[0])).toMatch(/blocked/i);
  });
});
