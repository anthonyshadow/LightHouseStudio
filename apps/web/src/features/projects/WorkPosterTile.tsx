import { useTheme } from '@emotion/react';
import { useState, type ReactElement, type ReactNode } from 'react';
import {
  assetThumbnailFallbackStyles,
  assetThumbnailPlayStyles,
  assetThumbnailStyles,
} from './ProjectAssetsSection.styles';

/**
 * The one poster tile every surface that shows saved work renders through.
 *
 * It exists because four surfaces need the same three answers — a poster, a deliberate absence, and
 * a recovered broken image — and a second implementation of any of them would eventually disagree.
 * The tile owns only that: callers supply the icon and the words, because "no preview yet" on a
 * Video card and "Campaign" on a Campaign cover are the same treatment saying different things.
 *
 * `decorative` drops the `role="img"` label so the tile can sit inside a control that already names
 * itself from its own text content — otherwise the tile's label would be read twice.
 */
export const WorkPosterTile = ({
  icon,
  thumbnailUrl,
  emptyCaption,
  failedCaption,
  label,
  kindNoun,
  unavailable,
  decorative = false,
  playBadge = false,
  children,
}: {
  readonly icon: ReactElement;
  readonly thumbnailUrl: string | null;
  /** Said when there is no poster to show at all. */
  readonly emptyCaption: string;
  /** Said when a poster was expected and the image did not load. */
  readonly failedCaption: string;
  readonly label: string;
  readonly kindNoun: string;
  readonly unavailable: boolean;
  readonly decorative?: boolean;
  /** Whether a displayed poster is overlaid with the play affordance. Never on the fallback. */
  readonly playBadge?: boolean;
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
              : `${kindNoun} visual for ${label}`,
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
          {icon}
          <small>{thumbnailUrl === null ? emptyCaption : failedCaption}</small>
        </span>
      )}
      {playBadge && !unavailable && showThumbnail ? (
        <span aria-hidden="true" css={assetThumbnailPlayStyles(theme)}>
          {icon}
        </span>
      ) : null}
      {children}
    </div>
  );
};
