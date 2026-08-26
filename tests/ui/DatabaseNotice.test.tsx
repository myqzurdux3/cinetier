import { describe, it, expect, vi, beforeEach } from 'vitest';
import { silenceConsoleError } from '../support/console';
import { render, screen, act } from '@testing-library/react';

// 'idb' is mocked so the open can be held unsettled on purpose. That is the
// whole point of the failure being tested: a blocked upgrade does not reject,
// it simply never answers, and no amount of waiting produces an error to show.
const openDBMock = vi.fn();

vi.mock('idb', () => ({
  openDB: (...args: unknown[]) => openDBMock(...args) as unknown,
  deleteDB: vi.fn(),
}));

interface Callbacks {
  blocked?: (currentVersion: number, blockedVersion: number | null) => void;
}

describe('DatabaseNotice', () => {
  beforeEach(() => {
    vi.resetModules();
    openDBMock.mockReset();
  });

  it('says nothing while the database is answering', async () => {
    openDBMock.mockImplementation(() => Promise.resolve({ close: vi.fn() }));
    const { DatabaseNotice } = await import('@/ui/DatabaseNotice');
    const { db } = await import('@/services/db');
    await db();

    render(<DatabaseNotice />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells a page that is out of date apart from one that is waiting', async () => {
    // Two different problems with the same symptom — the library is not there
    // — and two different things to do about them. Saying "close the other
    // tab" to someone running a stale bundle would send them nowhere.
    openDBMock.mockImplementation(() => Promise.resolve({ close: vi.fn() }));
    const { DatabaseNotice } = await import('@/ui/DatabaseNotice');
    const { reportDatabaseStall } = await import('@/services/db');

    render(<DatabaseNotice />);
    act(() => {
      reportDatabaseStall({ reason: 'newer', store: 'library' });
    });

    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toMatch(/out of date/i);
    expect(text).toMatch(/reload/i);
    expect(text).toMatch(/nothing has been lost/i);
    expect(text).not.toMatch(/another tab/i);
  });

  it('explains a blocked upgrade, and takes itself away once it goes through', async () => {
    silenceConsoleError();
    let callbacks: Callbacks = {};
    let letTheOpenFinish: (database: unknown) => void = () => undefined;

    openDBMock.mockImplementation((_name: unknown, _version: unknown, cb: unknown) => {
      callbacks = cb as Callbacks;
      return new Promise((resolve) => {
        letTheOpenFinish = resolve;
      });
    });

    const { DatabaseNotice } = await import('@/ui/DatabaseNotice');
    const { db } = await import('@/services/db');
    void db(); // deliberately not awaited: it does not settle yet

    render(<DatabaseNotice />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      callbacks.blocked?.(4, 5);
    });
    // The wording has to say the data is still there. The screen behind this
    // is the import screen, which is what a lost library looks like.
    expect(screen.getByRole('status').textContent).toMatch(/nothing has been lost/i);
    expect(screen.getByRole('status').textContent).toMatch(/another tab/i);

    // The other tab was closed and the upgrade went through. Nothing reloads
    // this page, so the notice has to withdraw itself.
    await act(async () => {
      letTheOpenFinish({ close: vi.fn() });
      await Promise.resolve();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
