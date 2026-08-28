import { type CSSObject, type Theme } from '@emotion/react';
import { SEGMENTED_CONTROL_SHORT_LABEL_MAX_WIDTH } from '../../ui/primitives/SegmentedControl';
import { media } from '../../ui/media';
import { pageScrollRegionStyles } from '../../ui/primitives/PageShell.styles';
import { skeletonSurfaceStyles } from '../../ui/primitives/Skeleton';

/** The recent list and everything that stands in for it reserve one box, so the region never jumps. */
const RECENT_REGION_MIN_HEIGHT = '20rem';

/** Row metrics shared by the real list and its skeleton; drift here is a visible layout shift. */
const recentRowGeometry = (theme: Theme): CSSObject => ({
  minHeight: '5rem',
  display: 'grid',
  gridTemplateColumns: '5rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.md,
  padding: `${theme.space.sm} ${theme.space.xs}`,
});

const recentRegionStyles = (theme: Theme): CSSObject => ({
  minHeight: RECENT_REGION_MIN_HEIGHT,
  margin: 0,
  padding: 0,
  borderBlockStart: `1px solid ${theme.colors.divider}`,
  listStyle: 'none',
});

/** The scroll region and query container; `PageShell` inside it owns width and padding. */
export const dashboardStyles = (theme: Theme): CSSObject => ({
  ...pageScrollRegionStyles(theme),
  width: '100%',
  '& h2, & h3': { fontFamily: theme.type.display },
  '& p': { margin: 0 },
});

/** Keeps the fixed compact navigation from obscuring the final Dashboard rows. */
export const dashboardShellStyles = (theme: Theme): CSSObject => ({
  [media.downOrShort('tablet', '36rem')]: { paddingBlockStart: theme.space.lg },
  [media.down('compact')]: {
    paddingBlockEnd: `max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))`,
  },
});

/** Only what is specific to this masthead's controls; the row itself belongs to `PageHeader`. */
export const dashboardHeaderStyles = (theme: Theme): CSSObject => ({
  /*
   * No width floor. It used to hold the primary at 9.375rem, which its own label already exceeds
   * on every layout that has room — so it bought nothing there, and on a 320px screen it was the
   * reason the control beside it had to give up pixels it did not have. The shared row decides
   * widths; this only says how the control looks.
   */
  '& [data-create-video]': {
    borderRadius: theme.radii.small,
    boxShadow: 'none',
  },
  '& [data-browse-assets]': { background: 'transparent' },
  '& [data-browse-label="short"]': { display: 'none' },
  '& [data-create-label="short"]': { display: 'none' },
  '@container (max-width: 22rem)': {
    /*
     * The processing control is a transient status light and can shed its label; Browse Assets
     * cannot. Below the rail breakpoint it is the only way into the asset libraries, so an
     * unlabelled icon would be the whole entry point, unnamed. It trades the verb for the
     * destination instead, which keeps all three controls on one row — which the masthead's
     * height budget on a phone needs them to be.
     */
    '& [data-browse-label="full"]': { display: 'none' },
    '& [data-browse-label="short"]': { display: 'inline' },
    '& [data-create-label="full"]': { display: 'none' },
    '& [data-create-label="short"]': { display: 'inline' },
    '& [data-processing-label]': { display: 'none' },
    '& [data-page-actions] > button:not([data-create-video]):not([data-browse-assets])': {
      width: '2.85rem',
      minWidth: '2.85rem',
      paddingInline: 0,
    },
  },
});

export const firstRunStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.md,
  paddingBlock: theme.space.lg,
  borderBlockEnd: `1px solid ${theme.colors.divider}`,
  '& [data-first-run-icon]': {
    width: '1.25rem',
    height: '1.25rem',
    color: theme.colors.violet,
  },
  '& [data-first-run-copy]': { minWidth: 0 },
  '& h2': {
    margin: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes.section,
    letterSpacing: '-0.015em',
  },
  '& p': {
    marginBlockStart: theme.space.xxs,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.55,
  },
  '& > button': { color: theme.colors.textFaint },
  '@container (max-width: 30rem)': {
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'start',
    '& > button': { gridColumn: 2, justifySelf: 'start', paddingInline: 0 },
  },
});

export const processingStatusSkeletonStyles = (theme: Theme): CSSObject => ({
  width: '9.5rem',
  minHeight: '2.75rem',
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.xs,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  '&::before': {
    content: '""',
    width: '0.75rem',
    height: '0.75rem',
    ...skeletonSurfaceStyles(theme),
  },
});

export const processingTriggerStyles = (theme: Theme, state: 'active' | 'error'): CSSObject => ({
  borderColor: state === 'error' ? theme.colors.danger : theme.colors.borderStrong,
  color: state === 'error' ? theme.colors.danger : theme.colors.textMuted,
  background: 'transparent',
  '& [data-processing-count]': {
    minWidth: '1.25rem',
    height: '1.25rem',
    display: 'inline-grid',
    placeItems: 'center',
    borderRadius: theme.radii.round,
    color: state === 'error' ? theme.colors.danger : theme.colors.onAccent,
    background: state === 'error' ? theme.colors.dangerSoft : theme.colors.accent,
    fontSize: '0.6875rem',
  },
});

export const processingPanelStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  marginBlockStart: theme.space.md,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surfaceSoft,
  '& > header': {
    display: 'flex',
    alignItems: 'start',
    justifyContent: 'space-between',
    gap: theme.space.md,
  },
  '& > header h2': { margin: 0, color: theme.colors.text, fontSize: theme.fontSizes.section },
  '& > header p': {
    marginBlockStart: theme.space.xxs,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
  '& > ul': {
    display: 'grid',
    margin: 0,
    padding: 0,
    borderBlockStart: `1px solid ${theme.colors.divider}`,
    listStyle: 'none',
  },
  '& > ul > li': {
    minWidth: 0,
    minHeight: '4.5rem',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.md,
    paddingBlock: theme.space.md,
    borderBlockEnd: `1px solid ${theme.colors.divider}`,
  },
  '& [data-job-status]': {
    padding: `${theme.space.xxs} ${theme.space.sm}`,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    color: theme.colors.accent,
    fontSize: theme.fontSizes.caption,
    fontWeight: 750,
  },
  '& [data-job-details]': { minWidth: 0, display: 'grid', gap: theme.space.xxs },
  '& [data-job-details] strong': {
    overflow: 'hidden',
    color: theme.colors.text,
    fontSize: theme.fontSizes.body,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& [data-job-details] span': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
  '@media (max-width: 36rem)': {
    '& > header': { flexDirection: 'column' },
    '& > ul > li': { gridTemplateColumns: 'auto minmax(0, 1fr)' },
    '& > ul > li > button': { gridColumn: '1 / -1', justifySelf: 'start' },
  },
});

export const processingNoticeStyles = (theme: Theme): CSSObject => ({
  marginBlockStart: theme.space.md,
});

export const sectionEyebrowStyles = (theme: Theme): CSSObject => ({
  margin: `0 0 ${theme.space.lg}`,
  color: theme.colors.textFaint,
  fontFamily: `${theme.type.sans} !important`,
  fontSize: '0.625rem',
  fontWeight: 850,
  letterSpacing: '0.2em',
  lineHeight: 1.2,
  textTransform: 'uppercase',
});

export const dashboardBodyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: theme.space.xxl,
  paddingBlock: theme.space.xxl,
  [media.up('desktop')]: {
    gridTemplateColumns: 'minmax(16rem, 0.72fr) minmax(0, 1.75fr)',
    alignItems: 'start',
    gap: 'clamp(2.5rem, 4vw, 4rem)',
  },
  [media.down('compact')]: { paddingBlock: theme.space.xl, gap: theme.space.xl },
});

export const continuePanelStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.lg,
  padding: `clamp(${theme.space.lg}, 3vw, 2.25rem)`,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surfaceSoft,
  '& [data-continue-copy]': { minWidth: 0, display: 'grid', gap: theme.space.xxs },
  '& [data-project-context]': {
    overflow: 'hidden',
    color: theme.colors.violet,
    fontSize: theme.fontSizes.caption,
    fontWeight: 720,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& h3': {
    margin: `${theme.space.xxs} 0 0`,
    overflow: 'hidden',
    color: theme.colors.text,
    fontSize: 'clamp(1.2rem, 3vw, 1.55rem)',
    letterSpacing: '-0.025em',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& time': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
  '& p': { color: theme.colors.textMuted, fontSize: theme.fontSizes.body, lineHeight: 1.5 },
  '& > button': { borderRadius: theme.radii.small, boxShadow: 'none' },
  [media.up('desktop')]: {
    gridTemplateColumns: 'minmax(0, 1fr)',
    alignItems: 'start',
    '& > button': { marginBlockStart: theme.space.lg },
  },
  '@media (max-width: 30rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& > button': { justifySelf: 'start' },
  },
});

export const continueSkeletonStyles = (theme: Theme): CSSObject => ({
  minHeight: '10rem',
  display: 'grid',
  alignContent: 'center',
  gap: theme.space.sm,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
});

export const recentWorkStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  alignSelf: 'start',
  '& > header': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(18rem, auto)',
    alignItems: 'start',
    gap: theme.space.lg,
    marginBlockEnd: theme.space.lg,
  },
  '& > header h2': { margin: 0 },
  '@media (max-width: 42rem)': {
    '& > header': { gridTemplateColumns: 'minmax(0, 1fr)', gap: theme.space.md },
  },
});

export const recentCountStyles = (theme: Theme): CSSObject => ({
  display: 'block',
  marginBlockStart: theme.space.xxs,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
});

export const recentFilterStyles = (): CSSObject => ({
  minWidth: 0,
  width: '100%',
  maxWidth: '29rem',
  justifySelf: 'end',
  '@media (max-width: 42rem)': { maxWidth: 'none', justifySelf: 'stretch' },
  /*
   * Layout only: the segments themselves are SegmentedControl's, not this surface's. Four across a
   * phone leaves each segment 56px of text, and no honest word for a campaign is that short — so
   * below the width where the control swaps to short labels, these four pair up instead. Stepped at
   * the control's own breakpoint so the row count and the label length always change together.
   */
  [`@media (max-width: ${SEGMENTED_CONTROL_SHORT_LABEL_MAX_WIDTH})`]: {
    '& > [data-segmented-control]': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  },
});

export const recentListStyles = (theme: Theme): CSSObject => ({
  ...recentRegionStyles(theme),
  '& li': { minWidth: 0, borderBlockEnd: `1px solid ${theme.colors.divider}` },
  '& li > button': {
    width: '100%',
    ...recentRowGeometry(theme),
    border: 0,
    color: theme.colors.text,
    background: 'transparent',
    textAlign: 'start',
    cursor: 'pointer',
    transition: `color ${theme.motion.quick}, background ${theme.motion.quick}`,
  },
  '& li > button:hover': { background: theme.colors.surfaceSoft },
  '& li > button:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '-2px',
  },
  '& [data-recent-poster]': { width: '5rem', justifySelf: 'center' },
  '& [data-recent-title]': { minWidth: 0, display: 'grid', gap: '0.15rem' },
  '& [data-recent-title] strong': {
    overflow: 'hidden',
    fontSize: theme.fontSizes.body,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& [data-recent-title] span, & time': { color: theme.colors.textFaint, fontSize: '0.6875rem' },
  '& time': { gridColumn: 2, whiteSpace: 'nowrap' },
  [media.up('tablet')]: {
    '& li > button': { gridTemplateColumns: '6rem minmax(0, 1fr) auto' },
    '& [data-recent-poster]': { width: '6rem' },
    '& time': { gridColumn: 'auto' },
  },
});

export const recentSkeletonStyles = (theme: Theme): CSSObject => ({
  ...recentRegionStyles(theme),
  '& li': {
    ...recentRowGeometry(theme),
    borderBlockEnd: `1px solid ${theme.colors.divider}`,
  },
  // The poster's stand-in is a block of the right size, not a `poster` whose aspect ratio this
  // would then have to cancel from outside: the row gives it a fixed column, not a 16:9 box.
  '& [data-skeleton]:first-of-type': { height: '3.25rem' },
  '& [data-skeleton]:last-of-type': { width: '62%' },
  [media.up('tablet')]: {
    '& li': { gridTemplateColumns: '6rem minmax(0, 1fr) 5.5rem' },
    '& [data-skeleton]:first-of-type': { height: '3.75rem' },
  },
});

export const emptyRecentStyles = (theme: Theme): CSSObject => ({
  minHeight: RECENT_REGION_MIN_HEIGHT,
  display: 'grid',
  alignContent: 'center',
  justifyItems: 'start',
  gap: theme.space.sm,
  paddingBlock: theme.space.xl,
  borderBlock: `1px solid ${theme.colors.divider}`,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.body,
  lineHeight: 1.55,
  '& [data-empty-state-preview]': { marginInline: 0 },
});

export const allDestinationsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.lg,
  marginBlockStart: theme.space.lg,
  '& svg': { width: '1rem', height: '1rem' },
});
