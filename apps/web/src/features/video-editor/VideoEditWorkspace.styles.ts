import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../../ui/media';

export const editorWorkspaceStyles = (): CSSObject => ({ display: 'contents' });

const activeEditorSelector =
  '[data-video-edit-active="true"]:not([hidden])[data-video-edit-active]';
const activeProjectEditorSelector =
  '[data-video-edit-active="true"][data-project-context="true"]:not([hidden])[data-video-edit-active]';
const activeEditorSelectors = `${activeEditorSelector}, ${activeProjectEditorSelector}`;

/**
 * The frame-first grid belongs to the lazy editor, not the always-loaded capture workspace. The
 * persistent MediaStage is already a direct child of this grid; the editor contributes its chrome
 * through a display:contents wrapper when editing is active.
 */
export const videoEditStageLayoutStyles = (theme: Theme): CSSObject => ({
  [activeEditorSelectors]: {
    gridTemplateColumns: 'minmax(0, 1fr) 19rem',
    gridTemplateRows: `auto auto calc((100vw - var(--studio-shell-rail-width) - 19rem - ${theme.space.xxl} - ${theme.space.lg}) * 0.5625) auto auto auto`,
    gridTemplateAreas: [
      '"header header"',
      '"tools inspector"',
      '"stage inspector"',
      '"history inspector"',
      '"timeline inspector"',
      '"actions actions"',
    ].join(' '),
    alignContent: 'start',
    alignItems: 'start',
    columnGap: theme.space.lg,
    rowGap: theme.space.sm,
    padding: `${theme.space.lg} ${theme.space.lg} 0`,
    background: theme.colors.canvas,
    overflowX: 'hidden',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'thin',
    '& > [data-media-stage-layout]': {
      gridArea: 'stage',
      width: '100%',
      height: 'auto',
      aspectRatio: '16 / 9',
      alignSelf: 'start',
    },
    '& > [data-media-stage-layout] > [data-stage-frame]': {
      width: '100%',
      height: 'auto',
      maxHeight: 'none',
      aspectRatio: '16 / 9',
    },
    '&:has([data-video-edit-settings][data-expanded="false"])': {
      gridTemplateColumns: 'minmax(0, 1fr) 4.35rem',
      gridTemplateRows: `auto auto calc((100vw - var(--studio-shell-rail-width) - 4.35rem - ${theme.space.xxl} - ${theme.space.lg}) * 0.5625) auto auto auto`,
    },
  },
  '[data-video-edit-active="true"][data-project-context="true"]': {
    gridColumn: '1 / -1',
    gridRow: '1 / -1',
    width: '100%',
    height: '100%',
    padding: `${theme.space.lg} ${theme.space.lg} 0`,
  },
  [media.between('laptop', 'desktop')]: {
    [activeEditorSelectors]: {
      gridTemplateRows: `auto auto calc((100vw - var(--studio-shell-rail-width) - 19rem - ${theme.space.xl} - ${theme.space.md}) * 0.5625) auto auto auto`,
      columnGap: theme.space.md,
      padding: `${theme.space.md} ${theme.space.md} 0`,
      '&:has([data-video-edit-settings][data-expanded="false"])': {
        gridTemplateRows: `auto auto calc((100vw - var(--studio-shell-rail-width) - 4.35rem - ${theme.space.xl} - ${theme.space.md}) * 0.5625) auto auto auto`,
      },
    },
  },
  [media.down('laptop')]: {
    [activeEditorSelectors]: {
      width: '100%',
      height: '100%',
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: `auto auto calc((100vw - var(--studio-shell-rail-width) - ${theme.space.xl}) * 0.5625) auto auto auto auto`,
      gridTemplateAreas: [
        '"header"',
        '"tools"',
        '"stage"',
        '"history"',
        '"timeline"',
        '"inspector"',
        '"actions"',
      ].join(' '),
      padding: `${theme.space.md} ${theme.space.md} 0`,
      overflow: 'auto',
      '& > [data-media-stage-layout]': { width: '100%', height: 'auto' },
    },
  },
  [media.down('compact')]: {
    [activeEditorSelectors]: {
      minHeight: '100%',
      height: 'auto',
      gridTemplateRows: `auto auto calc((100vw - var(--studio-shell-rail-width) - ${theme.space.lg}) * 0.5625) auto auto auto auto`,
      gap: theme.space.sm,
      padding: `${theme.space.sm} ${theme.space.sm} calc(40dvh + 9rem)`,
      overflowX: 'hidden',
      overflowY: 'auto',
      '&:has([data-video-edit-settings][data-expanded="false"])': {
        paddingBlockEnd: 'calc(12.75rem + env(safe-area-inset-bottom))',
      },
    },
  },
});

export const editorHeaderStyles = (theme: Theme): CSSObject => ({
  gridArea: 'header',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.md,
  '& h1': {
    margin: 0,
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.section,
    fontWeight: 660,
    letterSpacing: '-0.02em',
  },
  '& p': {
    margin: `${theme.space.xxs} 0 0`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
  '& > span': {
    minHeight: '2rem',
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingInline: theme.space.sm,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.canvasRaised,
    fontSize: theme.fontSizes.caption,
    fontWeight: 760,
  },
  '& > span > span': {
    width: '0.5rem',
    height: '0.5rem',
    borderRadius: theme.radii.round,
    background: theme.colors.success,
  },
  '& > span[data-editor-dirty="true"] > span': { background: theme.colors.warning },
  [media.down('compact')]: { '& p': { display: 'none' } },
});

export const editToolRailFrameStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  gridArea: 'tools',
  minWidth: 0,
  minHeight: '3.25rem',
  '& > [data-tool-overflow-cue]': {
    position: 'absolute',
    zIndex: 2,
    insetBlock: '1px',
    insetInlineEnd: '1px',
    width: '3rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingInlineEnd: theme.space.sm,
    borderRadius: `0 ${theme.radii.medium} ${theme.radii.medium} 0`,
    color: theme.colors.textFaint,
    background: theme.colors.canvasRaised,
    pointerEvents: 'none',
  },
  '& > [data-tool-overflow-cue] svg + svg': { marginInlineStart: '-0.45rem' },
  [media.down('compact')]: {
    '& > [data-tool-overflow-cue]': { width: '5rem' },
  },
  '@media (max-width: 20rem)': {
    '& > [data-tool-overflow-cue]': { width: '7rem' },
  },
});

export const editToolRailStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  minWidth: 0,
  minHeight: '3.25rem',
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.xs,
  padding: theme.space.xxs,
  paddingInlineEnd: '3rem',
  border: `1px solid ${theme.colors.divider}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'thin',
  '& button': {
    minHeight: '2.75rem',
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingInline: theme.space.sm,
    border: '1px solid transparent',
    borderRadius: theme.radii.small,
    color: theme.colors.textMuted,
    background: 'transparent',
    fontSize: theme.fontSizes.body,
    fontWeight: 760,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  '& button:hover:not(:disabled)': {
    color: theme.colors.text,
    background: theme.colors.surfaceSoft,
  },
  '& button[aria-current="page"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
  },
  '& button:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
  '& button:disabled': { opacity: 0.48, cursor: 'not-allowed' },
  [media.down('compact')]: { paddingInlineEnd: '5rem' },
  '@media (max-width: 20rem)': { paddingInlineEnd: '7rem' },
});

export const historyCompareStyles = (theme: Theme): CSSObject => ({
  gridArea: 'history',
  minWidth: 0,
  paddingBlock: theme.space.sm,
  borderBlock: `1px solid ${theme.colors.divider}`,
  '& > header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    marginBlockEnd: theme.space.xs,
  },
  '& h2': {
    margin: 0,
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    fontWeight: 760,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  '& > header > span': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
  '& > div': {
    display: 'flex',
    minWidth: 0,
    gap: theme.space.xs,
    overflowX: 'auto',
    scrollbarWidth: 'thin',
  },
  '& button': { flex: '0 0 auto', whiteSpace: 'nowrap' },
  '& button[aria-pressed="true"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
  },
  '& kbd': {
    padding: `0.2rem ${theme.space.xs}`,
    border: `1px solid ${theme.colors.divider}`,
    borderRadius: theme.radii.small,
    color: theme.colors.textMuted,
    background: theme.colors.canvas,
    fontFamily: theme.type.mono,
    fontSize: '0.65rem',
  },
  [media.down('compact')]: { '& > header > span': { display: 'none' } },
});

export const editSettingsStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  insetBlockStart: theme.space.lg,
  gridArea: 'inspector',
  minWidth: 0,
  minHeight: 0,
  maxHeight: `calc(100dvh - ${theme.space.lg} - 5.5rem)`,
  alignSelf: 'stretch',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  overflow: 'hidden',
  '& > header': {
    minHeight: '4.35rem',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.xs,
    padding: theme.space.sm,
    paddingInlineStart: theme.space.md,
    borderBlockEnd: `1px solid ${theme.colors.divider}`,
    background: theme.colors.surfaceStrong,
  },
  '& [data-inspector-title]': {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  '& [data-inspector-title] > svg': { flex: '0 0 auto', color: theme.colors.accent },
  '& [data-inspector-title] h2': {
    minWidth: 0,
    margin: 0,
    overflow: 'hidden',
    fontSize: theme.fontSizes.body,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& [data-inspector-title] strong': {
    flex: '0 0 auto',
    color: theme.colors.warning,
    fontSize: theme.fontSizes.caption,
  },
  '& [data-inspector-drag-handle]': { display: 'none' },
  '& [data-mobile-inspector-icon]': { display: 'none' },
  '&[data-expanded="false"]': {
    alignSelf: 'start',
    gridTemplateRows: 'auto',
    '& > header': {
      minHeight: '4.35rem',
      gridTemplateColumns: '1fr',
      justifyItems: 'center',
      padding: theme.space.xs,
      borderBlockEnd: 0,
    },
    '& > header > div': { display: 'none' },
    '& > div': { display: 'none' },
  },
  [media.down('laptop')]: {
    position: 'relative',
    insetBlockStart: 'auto',
    maxHeight: '32rem',
  },
  [media.down('compact')]: {
    position: 'fixed',
    zIndex: 30,
    insetInline: 0,
    insetBlockStart: 'auto',
    insetBlockEnd: 'calc(8.5rem + env(safe-area-inset-bottom))',
    height: '40dvh',
    maxHeight: '40dvh',
    borderInline: 0,
    borderBlockEnd: 0,
    borderRadius: `${theme.radii.large} ${theme.radii.large} 0 0`,
    boxShadow: theme.shadows.lifted,
    '& > header': { minHeight: '3.75rem', paddingBlock: theme.space.xs },
    '& [data-inspector-drag-handle]': {
      width: '3rem',
      height: '0.25rem',
      display: 'block',
      margin: `0 auto ${theme.space.xs}`,
      borderRadius: theme.radii.round,
      background: theme.colors.borderStrong,
    },
    '& [data-desktop-inspector-icon]': { display: 'none' },
    '& [data-mobile-inspector-icon]': { display: 'block' },
    '&[data-expanded="false"]': {
      height: '3.75rem',
      maxHeight: '3.75rem',
      '& > header': {
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        justifyItems: 'stretch',
        paddingInline: theme.space.sm,
      },
      '& > header > div': { display: 'block' },
      '& [data-inspector-drag-handle]': { display: 'none' },
      '& [data-mobile-inspector-icon]': { transform: 'rotate(180deg)' },
    },
  },
});

export const editSettingsBodyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
  padding: theme.space.md,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'thin',
  [media.down('compact')]: { gap: theme.space.sm, padding: theme.space.sm },
});

export const inspectorIntroStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  '& h3': { margin: 0, fontSize: theme.fontSizes.body },
  '& p': {
    margin: `${theme.space.xxs} 0 0`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.45,
  },
  '& > button': { flex: '0 0 auto' },
});

export const rangeFieldStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  '& > span': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    fontWeight: 700,
  },
  '& output': { color: theme.colors.accent, fontFamily: theme.type.mono },
  '& input': { width: '100%', minHeight: '2.75rem', accentColor: theme.colors.accent },
  '& input:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
});

export const optionGridStyles = (theme: Theme, columns = 2): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  gap: theme.space.xs,
  '& button': {
    minHeight: '2.75rem',
    padding: theme.space.xs,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.small,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceSoft,
    fontWeight: 700,
    cursor: 'pointer',
  },
  '& button[aria-pressed="true"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
  },
  '& button:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
});

export const editorFooterStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  zIndex: 20,
  insetBlockEnd: 0,
  gridArea: 'actions',
  minHeight: '4.5rem',
  width: `calc(100% + ${theme.space.xxl})`,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
  alignItems: 'center',
  gap: theme.space.sm,
  marginInline: `calc(-1 * ${theme.space.lg})`,
  padding: `${theme.space.sm} ${theme.space.lg}`,
  borderBlockStart: `1px solid ${theme.colors.borderStrong}`,
  background: theme.colors.canvasRaised,
  '& > div': { minWidth: 0 },
  '& > div strong': {
    display: 'block',
    color: theme.colors.text,
    fontSize: theme.fontSizes.body,
  },
  '& > div span': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption },
  '& [data-editor-discard]': { color: theme.colors.danger },
  '& [data-editor-discard]:hover:not(:disabled)': {
    color: theme.colors.danger,
    background: theme.colors.dangerSoft,
  },
  [media.down('compact')]: {
    position: 'fixed',
    zIndex: 40,
    insetInline: 0,
    insetBlockEnd: 'calc(4.5rem + env(safe-area-inset-bottom))',
    width: 'auto',
    minHeight: '4rem',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    margin: 0,
    padding: `${theme.space.xs} ${theme.space.sm}`,
    '& > div': { display: 'none' },
    '& > button:first-of-type': { width: '100%' },
  },
  '@media (max-width: 22.49rem)': {
    '& [data-editor-discard] span': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: 0,
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: 0,
    },
  },
});

export const renderProgressStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.accent,
  background: theme.colors.accentSoft,
  '& span': { display: 'flex', justifyContent: 'space-between', gap: theme.space.sm },
  '& progress': { width: '100%', accentColor: theme.colors.accent },
});
