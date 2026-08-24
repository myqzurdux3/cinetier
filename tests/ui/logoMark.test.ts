import { describe, it, expect } from 'vitest';
import { LOGO_SHAPES, LOGO_VIEW_BOX, FAVICON_COLOURS } from '@/ui/logoMark';

describe('the logo mark', () => {
  it('has no detail thinner than a quarter of its height', () => {
    // The mark has to survive a 16px favicon. Anything finer disappears there,
    // and disappears first on a low-resolution screen.
    const height = Number(LOGO_VIEW_BOX.split(' ')[3]);
    expect(height).toBe(32);

    for (const shape of LOGO_SHAPES) {
      const ys = [...shape.d.matchAll(/-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)].map((m) =>
        Number(m[1]),
      );
      expect(ys.length).toBeGreaterThanOrEqual(4);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(height / 4);
    }
  });

  it('carries no meaning in a grey', () => {
    // A grey mark is what an inverting extension turns into a single blob.
    const greys = Object.values(FAVICON_COLOURS).filter((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) < 24;
    });
    expect(greys).toEqual([]);
  });

  it('gives every shape a colour', () => {
    for (const shape of LOGO_SHAPES) {
      expect(FAVICON_COLOURS[shape.fill]).toBeDefined();
    }
  });
});
