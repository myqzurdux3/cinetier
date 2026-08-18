import type { Film } from '@/domain/film';

export interface ParseResult {
  films: Film[];
  /** Rows deliberately ignored, such as TV series in an IMDb export. */
  skipped: number;
  /** Non-fatal problems worth surfacing to the user. */
  warnings: string[];
}

/**
 * A failure that stops the whole import, carrying a hint that tells the user
 * what to do about it rather than only what went wrong.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly hint: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export function requireColumns(headers: string[], required: string[], hint: string): void {
  const present = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = required.filter((column) => !present.has(column.toLowerCase()));
  if (missing.length > 0) {
    throw new ParseError(`This file is missing the column(s): ${missing.join(', ')}.`, hint);
  }
}
