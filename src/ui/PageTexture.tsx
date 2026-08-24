/**
 * The page's texture: film grain in salle obscure, scanlines in néon, plus a
 * vignette falling from the top edge.
 *
 * One fixed element for the entire page. The tempting alternative — a texture
 * on each poster tile — multiplies the cost by the size of the library and is
 * the version of this that makes scrolling stutter.
 *
 * Which texture appears is entirely a matter of tokens; this component has no
 * idea which theme is active, and must not gain one.
 *
 * The grain and the vignette are two separate children, not two background
 * images on one element: --texture-opacity is deliberately faint (the grain
 * has to stay a texture, not a wash), and stacking the vignette as a second
 * background image on that same low-opacity element multiplied the two
 * alphas together, leaving the vignette at roughly 0.003–0.005 — invisible.
 * The vignette gets its own layer at full strength so it actually reads as a
 * vignette; the grain keeps --texture-opacity so it stays a texture.
 *
 * Plain opacity, not a blend mode: `mixBlendMode: 'overlay'` on a full-viewport
 * fixed layer is the usual culprit when scrolling stutters, and its cost could
 * not be measured in this environment, so it is not shipped unmeasured.
 */
export function PageTexture() {
  return (
    <div data-texture aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'var(--vignette)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'var(--texture-image)',
          opacity: 'var(--texture-opacity)',
        }}
      />
    </div>
  );
}
