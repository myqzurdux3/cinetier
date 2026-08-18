import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom's Blob implements arrayBuffer() but not stream(), which every browser
// has and which zip.js reads an archive through. Without this, a test that puts
// a real .zip through the import path would fail on the environment rather than
// on the code under test. One chunk is faithful enough: an export archive is a
// few kilobytes, and zip.js only asks for bytes in order.
if (typeof Blob.prototype.stream !== 'function') {
  Blob.prototype.stream = function stream(this: Blob): ReadableStream<Uint8Array<ArrayBuffer>> {
    const bytes = this.arrayBuffer();
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        controller.enqueue(new Uint8Array(await bytes));
        controller.close();
      },
    });
  };
}

afterEach(() => {
  cleanup();
});
