import type { ReactNode } from 'react';

export type VideoEditIconName =
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'collapse'
  | 'compare'
  | 'crop'
  | 'filters'
  | 'history'
  | 'lighting'
  | 'pause'
  | 'play'
  | 'redo'
  | 'reset'
  | 'rotate'
  | 'save'
  | 'scissors'
  | 'split'
  | 'trash'
  | 'undo';

type VideoEditIconProps = Readonly<{
  name: VideoEditIconName;
  width?: number | string;
  height?: number | string;
  className?: string;
}>;

const iconPaths: Record<VideoEditIconName, ReactNode> = {
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  collapse: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
      <path d="m11 9-3 3 3 3" />
    </>
  ),
  compare: (
    <>
      <path d="M7 3H5a2 2 0 0 0-2 2v2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M17 21h2a2 2 0 0 0 2-2v-2" />
      <path d="M12 7v10" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </>
  ),
  filters: (
    <>
      <circle cx="13.5" cy="6.5" r="1.5" />
      <circle cx="17.5" cy="10.5" r="1.5" />
      <circle cx="8.5" cy="7.5" r="1.5" />
      <path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-1.2a2 2 0 0 1-1.8-2.8l.5-1A2.2 2.2 0 0 0 14.5 3H12Z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lighting: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      <path d="m4.93 4.93 1.41 1.41m11.32 11.32 1.41 1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  play: <path d="m7 4 13 8-13 8V4Z" />,
  redo: (
    <>
      <path d="m15 7 4-4 4 4" />
      <path d="M19 3v9a7 7 0 0 1-7 7H5" />
    </>
  ),
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  rotate: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h12l2 2v16H5V3Z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 21v-7h8v7" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="7" r="3" />
      <circle cx="6" cy="17" r="3" />
      <path d="m8.6 8.5 12.4 7.5M8.6 15.5 21 8" />
    </>
  ),
  split: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  undo: (
    <>
      <path d="m9 7-4-4-4 4" />
      <path d="M5 3v9a7 7 0 0 0 7 7h7" />
    </>
  ),
};

export const VideoEditIcon = ({ name, width, height, className }: VideoEditIconProps) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...(width === undefined ? {} : { width })}
    {...(height === undefined ? {} : { height })}
    {...(className === undefined ? {} : { className })}
  >
    {iconPaths[name]}
  </svg>
);
