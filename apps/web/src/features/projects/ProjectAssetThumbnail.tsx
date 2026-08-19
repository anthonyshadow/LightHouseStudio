import { useTheme } from '@emotion/react';
import type { ProjectAssetKindContract } from '@studio/contracts';
import { useState, type ReactElement, type ReactNode } from 'react';
import {
  assetThumbnailFallbackStyles,
  assetThumbnailPlayStyles,
  assetThumbnailStyles,
} from './ProjectAssetsSection.styles';

export const kindLabel = (kind: ProjectAssetKindContract): string =>
  kind === 'video' ? 'Video' : kind.charAt(0).toUpperCase() + kind.slice(1);

// Keyed rather than an if-chain so a new Asset kind fails to compile instead of silently
// rendering the voice icon.
const KIND_ICONS: Record<ProjectAssetKindContract, ReactElement> = {
  video: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  character: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" />
    </svg>
  ),
  outfit: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m8.5 3-5 2.5L5 10l3-1.2V21h8V8.8l3 1.2 1.5-4.5-5-2.5a4 4 0 0 1-7 0Z" />
    </svg>
  ),
  voice: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
    </svg>
  ),
};

/**
 * One poster tile for an Asset, with server thumbnail, icon fallback, and broken-image recovery.
 *
 * `decorative` drops the `role="img"` label so the tile can sit inside a control that already
 * names itself from its own text content — otherwise the tile's label would be read twice.
 */
export const ProjectAssetThumbnail = ({
  kind,
  label,
  thumbnailUrl,
  unavailable,
  decorative = false,
  children,
}: {
  readonly kind: ProjectAssetKindContract;
  readonly label: string;
  readonly thumbnailUrl: string | null;
  readonly unavailable: boolean;
  readonly decorative?: boolean;
  readonly children?: ReactNode;
}) => {
  const theme = useTheme();
  const [brokenThumbnailUrl, setBrokenThumbnailUrl] = useState<string | null>(null);
  const showThumbnail = thumbnailUrl !== null && brokenThumbnailUrl !== thumbnailUrl;

  return (
    <div
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'img',
            'aria-label': showThumbnail
              ? `Thumbnail for ${label}`
              : `${kindLabel(kind)} visual for ${label}`,
          })}
      css={assetThumbnailStyles(theme, unavailable)}
    >
      {showThumbnail ? (
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          css={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setBrokenThumbnailUrl(thumbnailUrl)}
        />
      ) : (
        <span aria-hidden="true" css={assetThumbnailFallbackStyles(theme)}>
          {KIND_ICONS[kind]}
          <small>{unavailable ? 'Asset unavailable' : `${kindLabel(kind)} preview`}</small>
        </span>
      )}
      {kind === 'video' && !unavailable && showThumbnail ? (
        <span aria-hidden="true" css={assetThumbnailPlayStyles(theme)}>
          {KIND_ICONS.video}
        </span>
      ) : null}
      {children}
    </div>
  );
};
