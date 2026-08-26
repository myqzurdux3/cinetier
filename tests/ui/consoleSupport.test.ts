import { describe, it, expect, vi } from 'vitest';
import { silenceConsoleError } from '../support/console';

/**
 * The two tests below are one test, and their order is the point.
 *
 * Every caller used to end with `consoleError.mockRestore()` as its last
 * statement — the one position that does not run when an assertion above it
 * throws. The spy then outlived its test and silenced `console.error` for
 * every test after it in the same file, which in a suite where several tests
 * deliberately provoke an error means a later failure can be reported without
 * the error that explains it.
 */
describe('silenceConsoleError', () => {
  it.fails('is used by a test that throws before it could restore anything', () => {
    silenceConsoleError();
    expect(vi.isMockFunction(console.error)).toBe(true);
    throw new Error('this test is meant to fail; the one after it is the assertion');
  });

  it('leaves the real console.error behind for the test after it', () => {
    expect(vi.isMockFunction(console.error)).toBe(false);
  });
});
