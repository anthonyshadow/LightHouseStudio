import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/** The three characters `LIKE` reads as syntax rather than as text. */
const likeSyntax = /[\\%_]/gu;

/**
 * The SQL half of the domain's `matchesSearchTerm`: case-insensitive containment.
 *
 * The term never becomes part of the statement — it travels as a bound parameter — and the
 * characters `LIKE` treats as syntax are escaped first, so searching for `50%` looks for those
 * three characters instead of matching everything.
 */
export const searchTermMatches = (column: PgColumn, term: string): SQL =>
  sql`${column} ilike ${`%${term.replace(likeSyntax, (character) => `\\${character}`)}%`} escape '\\'`;
