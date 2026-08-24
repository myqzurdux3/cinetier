/**
 * Hand a blob to the browser as a file.
 *
 * Shared by the two things this application produces: the exported image and
 * the `.json` that carries a library and a board. Both had the same six lines,
 * and the two details worth getting right were duplicated with them.
 */
export function download(blob: Blob, filename: string): void {
  const url = globalThis.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // In the document while it is clicked: a detached anchor works in Chrome and
  // has not always worked elsewhere, and the cost of being sure is two lines.
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next task rather than immediately: a browser that has not
  // started reading the object URL yet would be handed a dead one.
  setTimeout(() => {
    globalThis.URL.revokeObjectURL(url);
  }, 0);
}
