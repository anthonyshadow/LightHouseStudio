import { Button } from './Button';

/**
 * The one "search matched nothing" presentation that pairs with `ListSearchField`: the term
 * echoed back, the same recovery advice, and a clear-search action. Owned here so list surfaces
 * cannot drift apart on the wording.
 */
export const SearchEmptyState = ({
  noun,
  term,
  onClear,
}: {
  /** What the list holds, already qualified — e.g. "Projects" or "archived Campaigns". */
  readonly noun: string;
  readonly term: string;
  readonly onClear: () => void;
}) => (
  <>
    <strong>
      No {noun} match “{term}”
    </strong>
    <p>Try a shorter term, or clear the search to see everything again.</p>
    <Button size="small" onClick={onClear}>
      Clear search
    </Button>
  </>
);
