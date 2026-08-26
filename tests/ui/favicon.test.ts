import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Nothing else pins this pipeline together. Deleting `faviconPlugin()` from
 * vite.config.ts leaves every other test green — the plugin has no consumer
 * inside the app — while the tab icon silently 404s, because
 * transformIndexHtml is the only thing that ever replaces the %FAVICON%
 * placeholder with real markup.
 */
describe('favicon pipeline', () => {
  it('leaves the placeholder in index.html for the plugin to replace', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('%FAVICON%');
  });

  it('registers the plugin that replaces it', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toMatch(/faviconPlugin\(\)/);
    expect(config).toMatch(/from ['"]\.\/vite-plugins\/favicon(\.ts)?['"]/);
  });
});
