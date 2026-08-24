import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useRef } from 'react';
import { IconButton } from './IconButton';
import { TextField } from './FormControls';
import type { ListSearch } from './useListSearch';

const searchFieldStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  '& input[type="search"]::-webkit-search-cancel-button': { display: 'none' },
  '& [data-field-end-adornment] button': {
    color: theme.colors.textMuted,
    borderRadius: theme.radii.small,
  },
});

interface ListSearchFieldProps {
  readonly label: string;
  readonly placeholder?: string;
  readonly search: ListSearch;
}

/**
 * The search input every list surface shares, so that finding a Project, a Campaign and a video
 * are the same gesture: one labelled field, one inline clear control when text exists, and one
 * statement of when a term starts being applied.
 */
export const ListSearchField = ({ label, placeholder, search }: ListSearchFieldProps) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div css={searchFieldStyles(theme)}>
      <TextField
        ref={inputRef}
        type="search"
        label={label}
        value={search.value}
        maxLength={search.maxLength}
        hint={search.hint}
        endAdornment={
          search.value === '' ? null : (
            <IconButton
              variant="quiet"
              label="Clear search"
              onClick={() => {
                search.clear();
                inputRef.current?.focus();
              }}
            >
              <span aria-hidden="true" css={{ fontSize: '1.25rem', lineHeight: 1 }}>
                ×
              </span>
            </IconButton>
          )
        }
        {...(placeholder === undefined ? {} : { placeholder })}
        onChange={(event) => search.setValue(event.target.value)}
      />
    </div>
  );
};
