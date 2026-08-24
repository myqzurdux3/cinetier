import type { Plugin } from 'vite';
import { FAVICON_COLOURS, logoSvgMarkup, type LogoRole } from '../src/ui/logoMark';

/**
 * Writes the favicon into index.html from the same description the component
 * renders. It used to be pasted in by hand, and the copy had already drifted
 * from the component without anyone noticing.
 */
export function faviconPlugin(): Plugin {
  return {
    name: 'cinetier-favicon',
    transformIndexHtml(html) {
      const markup = logoSvgMarkup((role: LogoRole) => FAVICON_COLOURS[role], 32);
      const href = `data:image/svg+xml,${encodeURIComponent(markup)}`;
      return html.replace('%FAVICON%', href);
    },
  };
}
