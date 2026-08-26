import { onTestFinished, vi, type MockInstance } from 'vitest';

/**
 * A silenced `console.error` that is put back even when the test fails.
 *
 * Every caller used to end with `consoleError.mockRestore()` as its last
 * statement, which is exactly the position that does not run when an
 * assertion above it throws. The spy then outlived its test and silenced
 * `console.error` for every test after it in the same file — so a second
 * failure could be reported without the error that explains it, in a suite
 * where several tests deliberately provoke one.
 *
 * `onTestFinished` runs whichever way the test ends.
 */
export function silenceConsoleError(): MockInstance<typeof console.error> {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  onTestFinished(() => {
    spy.mockRestore();
  });
  return spy;
}

/** The same, for `console.warn`. */
export function silenceConsoleWarn(): MockInstance<typeof console.warn> {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  onTestFinished(() => {
    spy.mockRestore();
  });
  return spy;
}
