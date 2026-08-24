import { describe, it, expect } from 'vitest';
import { mayAutoScroll } from '@/ui/board/autoScroll';

describe('mayAutoScroll', () => {
  it('refuses the pool and anything inside it', () => {
    // dnd-kit auto-scrolls the scroll ancestors of the dragged card, and for a
    // card picked up in the pool that includes the pool's virtualised grid.
    // Scrolling it unmounts the card being dragged, which loses the pointer
    // capture and kills the drag with no highlight and no drop. See
    // autoScroll.ts on why this is kept despite no browser check failing
    // without it.
    document.body.innerHTML = `
      <section data-pool="true"><div id="grid"><div id="card"></div></div></section>
      <div id="page"></div>`;
    expect(mayAutoScroll(document.querySelector('#grid')!)).toBe(false);
    expect(mayAutoScroll(document.querySelector('#card')!)).toBe(false);
  });

  it('allows everything else, the page included', () => {
    // Page auto-scroll is how a row further down is reached mid-drag.
    document.body.innerHTML = `<section data-pool="true"></section><div id="page"></div>`;
    expect(mayAutoScroll(document.documentElement)).toBe(true);
    expect(mayAutoScroll(document.querySelector('#page')!)).toBe(true);
  });
});
