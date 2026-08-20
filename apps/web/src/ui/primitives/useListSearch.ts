import { LIST_SEARCH_MAX_LENGTH, LIST_SEARCH_MIN_LENGTH } from '@studio/contracts';
import { useCallback, useEffect, useState } from 'react';

/** Long enough that a term settles between deliberate keystrokes, short enough to feel immediate. */
const DEBOUNCE_MS = 300;

export interface ListSearch {
  /** What the input shows. Updated on every keystroke. */
  readonly value: string;
  /** The settled term to query with, or `undefined` for "no search". */
  readonly term: string | undefined;
  readonly hint: string;
  readonly maxLength: number;
  readonly setValue: (value: string) => void;
  readonly clear: () => void;
}

/**
 * The typed-term half of a searchable list: what the operator is typing, and the settled term the
 * list should actually ask for.
 *
 * The two are deliberately different values. Every keystroke would otherwise be a request, and a
 * term shorter than the server will accept would be a rejected one — so the term only moves once
 * typing pauses, and a term still being typed leaves the list showing the last thing it asked for
 * rather than flickering back to everything.
 */
export const useListSearch = (): ListSearch => {
  const [value, setTypedValue] = useState('');
  const [term, setTerm] = useState<string | undefined>(undefined);
  const trimmed = value.trim();
  const belowMinimum = trimmed.length > 0 && trimmed.length < LIST_SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (trimmed === '' || belowMinimum) return undefined;
    const timer = window.setTimeout(() => setTerm(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [belowMinimum, trimmed]);

  const setValue = useCallback((next: string) => {
    setTypedValue(next);
    // Clearing is not a search. It restores the full list from the event that cleared it rather
    // than a debounce later, which is why it belongs here and not in the effect above.
    if (next.trim() === '') setTerm(undefined);
  }, []);

  const clear = useCallback(() => setValue(''), [setValue]);

  return {
    value,
    term,
    hint: `Search begins after ${LIST_SEARCH_MIN_LENGTH} characters.`,
    maxLength: LIST_SEARCH_MAX_LENGTH,
    setValue,
    clear,
  };
};
