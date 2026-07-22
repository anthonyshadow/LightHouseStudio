import { useTheme, type CSSObject } from '@emotion/react';
import type { ReactNode } from 'react';
import {
  heroPreviewStyles,
  previewLabelStyles,
  previewPanelStyles,
  summaryChipStyles,
  thumbnailStripStyles,
} from './formStyles';

const previewMontageStyles: CSSObject = {
  width: '100%',
  height: '100%',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
  gap: '2px',
  '& > img': {
    display: 'block',
    width: '100%',
    height: '100%',
    minWidth: 0,
    objectFit: 'contain',
  },
};

export interface CharacterDirectionPreviewSelection {
  readonly category: string;
  readonly label: string;
  readonly imageSrc: string | null;
  readonly swatch?: string | undefined;
}

export interface CharacterDirectionPreviewProps {
  readonly characterLabel: string;
  readonly profile: string;
  readonly starterLabel: string;
  readonly previewSource?: string | undefined;
  readonly montageSources: readonly string[];
  readonly showMontage: boolean;
  readonly generated: boolean;
  readonly stale: boolean;
  readonly busy: boolean;
  readonly status?: string | null;
  readonly actions?: ReactNode;
  readonly settings?: ReactNode;
  readonly error?: ReactNode;
  readonly selections: readonly CharacterDirectionPreviewSelection[];
  readonly summary: readonly string[];
}

export const CharacterDirectionPreview = ({
  characterLabel,
  profile,
  starterLabel,
  previewSource,
  montageSources,
  showMontage,
  generated,
  stale,
  busy,
  status,
  actions,
  settings,
  error,
  selections,
  summary,
}: CharacterDirectionPreviewProps) => {
  const theme = useTheme();
  return (
    <aside
      aria-labelledby="direction-preview-heading"
      css={[
        previewPanelStyles(theme),
        {
          gridColumn: '2',
          gridRow: '1 / span 30',
          '@media (max-width: 64rem)': { gridColumn: '1', gridRow: 'auto' },
        },
      ]}
    >
      <h3 id="direction-preview-heading">Character Direction Preview</h3>
      <div css={heroPreviewStyles(theme)} aria-busy={busy || undefined}>
        {showMontage ? (
          <div
            role="img"
            aria-label={`${characterLabel} direction preview, diverse adult presentation montage`}
            css={previewMontageStyles}
          >
            {montageSources.map((source) => (
              <img
                key={source}
                src={source}

                alt=""
                aria-hidden="true"
              />
            ))}
          </div>
        ) : previewSource ? (
          <img
            src={previewSource}
            style={{ objectFit: 'cover', height: '100%', width: '100%' }}
            alt={`${characterLabel} direction preview`}
          />
        ) : null}
        <span css={previewLabelStyles(theme)}>
          {generated
            ? stale
              ? 'Previous reference — changes need a new image'
              : 'Generated reference image'
            : 'Direction artwork — not an exact composite'}
        </span>
        {busy ? (
          <div
            css={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              padding: theme.space.md,
              color: theme.colors.text,
              background: 'rgba(5, 8, 14, 0.76)',
              textAlign: 'center',
              fontWeight: 760,
              zIndex: 2,
            }}
          >
            <span css={{ display: 'grid', gap: theme.space.sm, justifyItems: 'center' }}>
              <span
                aria-hidden="true"
                css={{
                  width: '2rem',
                  height: '2rem',
                  border: `3px solid ${theme.colors.borderStrong}`,
                  borderBlockStartColor: theme.colors.accent,
                  borderRadius: '50%',
                  animation: 'character-preview-spin 0.9s linear infinite',
                  '@keyframes character-preview-spin': {
                    to: { transform: 'rotate(360deg)' },
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                    borderBlockStartColor: theme.colors.borderStrong,
                    background: theme.colors.accent,
                  },
                }}
              />
              {status ?? 'Generating preview…'}
            </span>
          </div>
        ) : null}
      </div>
      {error}
      {actions}
      {settings}
      <div aria-label="Selected direction details" css={thumbnailStripStyles(theme)}>
        {selections.map((item) => (
          <div
            key={item.category}
            style={
              item.swatch
                ? { background: item.swatch }
                : item.imageSrc
                  ? {
                      backgroundImage: `linear-gradient(180deg, transparent, rgba(0,0,0,.78)), url("${item.imageSrc}")`,
                    }
                  : undefined
            }
          >
            {item.label}
          </div>
        ))}
      </div>
      {summary.length ? (
        <ul aria-label="Character summary" css={summaryChipStyles(theme)}>
          {summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>Choose at least one character detail to build a direction.</p>
      )}
      <details>
        <summary
          css={{
            minHeight: '2.75rem',
            display: 'flex',
            alignItems: 'center',
            paddingInline: theme.space.xs,
            cursor: 'pointer',
            fontWeight: 720,
            '&:focus-visible': {
              outline: `2px solid ${theme.colors.focus}`,
              outlineOffset: '2px',
            },
          }}
        >
          See how this character was built
        </summary>
        <dl>
          <dt>Profile</dt>
          <dd>{profile}</dd>
          <dt>Starter</dt>
          <dd>{starterLabel}</dd>
          <dt>Canonical fields</dt>
          <dd>
            Role, appearance, skin tone, body shape, hair, color, outfit, expression, mood, and
            constraints
          </dd>
        </dl>
      </details>
    </aside>
  );
};
