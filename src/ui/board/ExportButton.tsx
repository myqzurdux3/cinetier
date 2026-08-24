import { useMemo, useState } from 'react';
import type { Film } from '@/domain/film';
import type { TierBoard } from '@/domain/tiers';
import { placedIds } from '@/domain/tiers';
import { pngFilename, readPalette, renderBoardPng } from './exportPng';
import { download } from './download';

interface ExportButtonProps {
  board: TierBoard;
  films: Film[];
}

type State = 'idle' | 'rendering' | 'failed';

/**
 * Saves the board as a PNG.
 *
 * Disabled while the board is empty: a picture of six empty rows is not
 * something anyone means to ask for, and the disabled state says why it is
 * not available better than an image of nothing would.
 */
export function ExportButton({ board, films }: ExportButtonProps) {
  const [state, setState] = useState<State>('idle');
  // Recomputed only when the board changes: `placedIds` walks every placement
  // and builds a set, and this runs on every render of the toolbar otherwise.
  const count = useMemo(() => placedIds(board).size, [board]);

  async function save() {
    setState('rendering');
    try {
      const blob = await renderBoardPng(board, films, readPalette(document.documentElement));
      if (!blob) {
        setState('failed');
        return;
      }
      download(blob, pngFilename(board.name));
      setState('idle');
    } catch {
      // Every step that can fail — a poster, the canvas, the encode — fails
      // the same way from here: no file. Saying so beats a button that looks
      // like it did nothing.
      setState('failed');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          void save();
        }}
        disabled={count === 0 || state === 'rendering'}
        className="rounded-card border border-line px-3 py-2 text-sm text-ink-dim hover:text-ink focus:ring-2 focus:ring-accent disabled:opacity-40"
      >
        {state === 'rendering' ? 'Saving…' : 'Save as PNG'}
      </button>
      <p aria-live="polite" className="text-sm text-ink-dim">
        {state === 'failed' ? 'The image could not be created.' : ''}
      </p>
    </div>
  );
}
