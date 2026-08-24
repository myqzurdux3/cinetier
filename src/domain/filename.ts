/**
 * A file name for a board, safe on every platform and recognisable in a
 * downloads folder.
 *
 * Windows rejects \ / : * ? " < > | outright, and a name that reduces to
 * nothing — a board called "???" — has to fall back to something rather than
 * produce a file called ".png".
 *
 * Shared by the two things a board can be saved as. They had the same seven
 * lines twice, differing in the extension, which is the shape a rule takes
 * just before the two copies stop agreeing.
 */
export function boardFilename(boardName: string, extension: string): string {
  const slug = boardName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `cinetier-${slug === '' ? 'tier-list' : slug}.${extension}`;
}
