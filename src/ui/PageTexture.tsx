/**
 * The page's texture: film grain in salle obscure, scanlines in néon.
 *
 * One fixed element for the entire page. The tempting alternative — a texture
 * on each poster tile — multiplies the cost by the size of the library and is
 * the version of this that makes scrolling stutter.
 *
 * Which texture appears is entirely a matter of tokens; this component has no
 * idea which theme is active, and must not gain one.
 */
export function PageTexture() {
  return (
    <div
      data-texture
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 motion-reduce:hidden"
      style={{
        backgroundImage: 'var(--texture-image), var(--vignette)',
        opacity: 'var(--texture-opacity)',
        mixBlendMode: 'overlay',
      }}
    />
  );
}
