import type { ReactNode } from 'react';

/**
 * The product's whole icon set.
 *
 * It is deliberately one module: the repository previously carried five parallel sets at three
 * stroke weights, so a rail could show a 1.6 glyph beside a 1.8 one and a poster tile could draw a
 * hairline. Every mark here is on the same 24×24 grid at the same weight, and a concept has exactly
 * one glyph — `character` is the same drawing in the Studio rail and on a saved-asset tile.
 *
 * Two kinds of mark stay outside it, both single-use and both non-iconic: the filled dot/square
 * that indicates recording state in `RecordingAction`, which is a state light rather than an icon,
 * and the crop diagrams in `ExportPlacementChooser`, which are scale drawings of a frame.
 */
export type AppIconName =
  | 'assets'
  | 'camera'
  | 'cameraOff'
  | 'campaigns'
  | 'character'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'close'
  | 'collapse'
  | 'compare'
  | 'copy'
  | 'crop'
  | 'dashboard'
  | 'editVideo'
  | 'filters'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'history'
  | 'info'
  | 'lighting'
  | 'microphone'
  | 'microphoneOff'
  | 'more'
  | 'outfit'
  | 'pause'
  | 'pictureInPicture'
  | 'play'
  | 'plus'
  | 'privacy'
  | 'projects'
  | 'redo'
  | 'reset'
  | 'rotate'
  | 'save'
  | 'scissors'
  | 'source'
  | 'spark'
  | 'split'
  | 'stop'
  | 'switchCamera'
  | 'trash'
  | 'undo'
  | 'upload'
  | 'video'
  | 'wand';

type AppIconProps = Readonly<{
  name: AppIconName;
  width?: number | string;
  height?: number | string;
  className?: string;
  'data-nav-icon'?: boolean;
  'data-tool-icon'?: boolean;
}>;

/** The slash shared by every "…Off" mark, so the two never disagree about its angle. */
const offSlash = <path d="m4 4 16 16" />;

const cameraBody = (
  <>
    <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
    <path d="m15.5 10 4-2v8l-4-2" />
  </>
);

const microphoneBody = (
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" />
  </>
);

const iconPaths: Record<AppIconName, ReactNode> = {
  assets: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </>
  ),
  camera: cameraBody,
  cameraOff: (
    <>
      {cameraBody}
      {offSlash}
    </>
  ),
  campaigns: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  character: (
    <>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
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
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  editVideo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M8 5v14M16 5v14M3 10h5M16 10h5M3 15h5M16 15h5" />
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
  fullscreen: <path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" />,
  fullscreenExit: (
    <path d="M9 4v3a2 2 0 0 1-2 2H4m11-5v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4m11 5v-3a2 2 0 0 1 2-2h3" />
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  lighting: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      <path d="m4.93 4.93 1.41 1.41m11.32 11.32 1.41 1.41M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  microphone: microphoneBody,
  microphoneOff: (
    <>
      {microphoneBody}
      {offSlash}
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  outfit: <path d="m8.5 3-5 2.5L5 10l3-1.2V21h8V8.8l3 1.2 1.5-4.5-5-2.5a4 4 0 0 1-7 0Z" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  pictureInPicture: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3" />
      <rect x="8" y="8" width="8" height="8" rx="2.5" />
    </>
  ),
  play: <path d="m7 4 13 8-13 8V4Z" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  privacy: (
    <>
      <path d="M12 3 5 6v5c0 4.5 2.7 8.1 7 10 4.3-1.9 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
    </>
  ),
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
  source: (
    <>
      <path d="M4 4h16v16H4V4Z" />
      <path d="M8 4v5h8V4" />
      <path d="M8 16h8" />
    </>
  ),
  spark: (
    <path d="M12 3c.55 4.05 2.95 6.45 7 7-4.05.55-6.45 2.95-7 7-.55-4.05-2.95-6.45-7-7 4.05-.55 6.45-2.95 7-7Z" />
  ),
  split: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />,
  switchCamera: (
    <>
      <path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5" />
      <path d="m17 7 2.5 2.5M7 17l-2.5-2.5" />
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
  upload: (
    <>
      <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" />
      <path d="M4 14v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="m17 10 4-2v8l-4-2" />
    </>
  ),
  wand: (
    <>
      <path d="m15 4 5 5L8 21l-5-5L15 4Z" />
      <path d="m6 14 5 5" />
      <path d="M6 3v3" />
      <path d="M4.5 4.5h3" />
      <path d="M19 14v3" />
      <path d="M17.5 15.5h3" />
    </>
  ),
};

export const AppIcon = ({
  name,
  width,
  height,
  className,
  'data-nav-icon': dataNavIcon,
  'data-tool-icon': dataToolIcon,
}: AppIconProps) => (
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
    {...(dataNavIcon === undefined ? {} : { 'data-nav-icon': '' })}
    {...(dataToolIcon === undefined ? {} : { 'data-tool-icon': '' })}
  >
    {iconPaths[name]}
  </svg>
);
