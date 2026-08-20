import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button } from './Button';
import { TextField } from './FormControls';
import type { ListSearch } from './useListSearch';

const searchFieldStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  // Bottom-aligned, the way the filter rows already align a control beside a field: the label sits
  // above the input, so anything else would depend on the label's rendered height and break at
  // 200% text.
  alignItems: 'end',
  gap: theme.space.sm,
  '& > div': { flex: '1 1 14rem', minWidth: 0 },
  '& > button': { minHeight: '2.75rem' },
});

interface ListSearchFieldProps {
  readonly label: string;
  readonly placeholder?: string;
  readonly search: ListSearch;
}

/**
 * The search input every list surface shares, so that finding a Project, a Campaign and a video
 * are the same gesture: one labelled field, one clear control, and one statement of when a term
 * starts being applied.
 */
export const ListSearchField = ({ label, placeholder, search }: ListSearchFieldProps) => {
  const theme = useTheme();
  return (
    <div css={searchFieldStyles(theme)}>
      <TextField
        type="search"
        label={label}
        value={search.value}
        maxLength={search.maxLength}
        hint={search.hint}
        {...(placeholder === undefined ? {} : { placeholder })}
        onChange={(event) => search.setValue(event.target.value)}
      />
      <Button variant="secondary" disabled={search.value === ''} onClick={search.clear}>
        Clear search
      </Button>
    </div>
  );
};
