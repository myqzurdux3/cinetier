/**
 * The page's texture: film grain in salle obscure, scanlines in néon.
 *
 * One fixed element for the entire page. The tempting alternative — a texture
 * on each poster tile — multiplies the cost by the size of the library and is
 * the version of this that makes scrolling stutter.
 *
 * Which texture appears is entirely a matter of tokens; this component has no
 * idea which theme is active, and must not gain one.
 *
 * Plain opacity, not a blend mode: `mixBlendMode: 'overlay'` on a full-viewport
 * fixed layer is the usual culprit when scrolling stutters, and its cost could
 * not be measured in this environment, so it is not shipped unmeasured.
 */
export function PageTexture() {
  return (
    <div
      data-texture
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage: 'var(--texture-image), var(--vignette)',
        opacity: 'var(--texture-opacity)',
      }}
    />
  );
}
