import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { OverlayPanel } from './OverlayPanel';

export interface ReferenceImagePreviewProps {
  assetId: string;
  alt: string;
  label?: string;
  size?: 'thumbnail' | 'panel';
  onUnavailable?: (() => void) | undefined;
}

const referenceImageContentUrl = (assetId: string) =>
  `/api/reference-images/${encodeURIComponent(assetId)}/content`;

const frameStyles = (theme: Theme, size: 'thumbnail' | 'panel'): CSSObject => ({
  position: 'relative',
  width: size === 'thumbnail' ? '4.25rem' : 'min(100%, 19rem)',
  aspectRatio: '1',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  padding: 0,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
  cursor: 'zoom-in',
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '& img': {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'contain',
  },
});

const placeholderStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  gap: theme.space.xs,
  padding: theme.space.sm,
  color: theme.colors.textMuted,
  background: `linear-gradient(110deg, ${theme.colors.surfaceSoft}, ${theme.colors.canvasRaised}, ${theme.colors.surfaceSoft})`,
  textAlign: 'center',
  fontSize: theme.fontSizes.caption,
});

const largePreviewStyles = (theme: Theme): CSSObject => ({
  width: 'min(82vw, 42rem)',
  maxWidth: '100%',
  aspectRatio: '1',
  display: 'block',
  objectFit: 'contain',
  margin: '0 auto',
  borderRadius: theme.radii.medium,
  background: theme.colors.canvas,
});

/** Stable local-asset thumbnail with a keyboard-accessible shared larger preview. */
export const ReferenceImagePreview = ({
  assetId,
  alt,
  label = 'Open larger reference preview',
  size = 'thumbnail',
  onUnavailable,
}: ReferenceImagePreviewProps) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const contentUrl = `${referenceImageContentUrl(assetId)}?preview=${revision}`;

  useEffect(() => {
    setFailed(false);
    setRevision(0);
    setOpen(false);
  }, [assetId]);

  const retry = () => {
    setFailed(false);
    setRevision((value) => value + 1);
  };

  return (
    <>
      {failed ? (
        <div css={[frameStyles(theme, size), { cursor: 'default' }]} role="group" aria-label={alt}>
          <div css={placeholderStyles(theme)}>
            <span>Reference unavailable</span>
            <Button size="small" variant="quiet" onClick={retry}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={label}
          css={frameStyles(theme, size)}
          onClick={() => setOpen(true)}
        >
          <img
            key={revision}
            src={contentUrl}
            alt={alt}
            onError={() => {
              setFailed(true);
              onUnavailable?.();
            }}
          />
        </button>
      )}

      <OverlayPanel
        open={open && !failed}
        onClose={() => setOpen(false)}
        title="Character reference"
        description="Immutable local reference used by this recipe version."
        placement="fullscreen"
        size="wide"
        closeLabel="Close larger reference preview"
      >
        <img
          src={contentUrl}
          alt={alt}
          css={largePreviewStyles(theme)}
          onError={() => setFailed(true)}
        />
      </OverlayPanel>
    </>
  );
};
