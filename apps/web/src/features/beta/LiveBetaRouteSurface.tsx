import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button, StatusNotice } from '../../ui';

const surfaceStyles = (theme: Theme): CSSObject => ({
  height: '100%',
  minHeight: 0,
  display: 'grid',
  placeItems: 'center',
  overflowY: 'auto',
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.canvasRaised,
  '& > div': {
    width: 'min(36rem, 100%)',
    display: 'grid',
    gap: theme.space.md,
    padding: `clamp(${theme.space.lg}, 5vw, ${theme.space.xxl})`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.large,
    background: theme.colors.surfaceSoft,
  },
  '& h1': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.6rem, 5vw, 2.5rem)',
  },
  '& p': { margin: 0, color: theme.colors.textMuted, lineHeight: 1.55 },
  '& [data-beta-actions]': { display: 'flex', flexWrap: 'wrap', gap: theme.space.sm },
  '@media (max-width: 30rem)': {
    '& [data-beta-actions], & [data-beta-actions] button': { width: '100%' },
  },
});

export const LiveBetaRouteSurface = ({
  capabilityState,
  betaEnabled,
  providerConfigured,
  onOpenStudio,
  onOpenDashboard,
}: Readonly<{
  capabilityState: 'loading' | 'ready' | 'error';
  betaEnabled: boolean;
  providerConfigured: boolean;
  onOpenStudio: () => void;
  onOpenDashboard: () => void;
}>) => {
  const theme = useTheme();
  const loading = capabilityState === 'loading';
  const message = !betaEnabled
    ? 'Live AI Beta is not enabled on this Lightframe installation.'
    : !providerConfigured
      ? 'Live AI Beta is enabled, but its realtime provider is not configured.'
      : 'Lightframe could not confirm Live AI Beta availability.';
  return (
    <section css={surfaceStyles(theme)} aria-labelledby="live-beta-unavailable-heading">
      <div>
        <span css={{ color: theme.colors.violet, fontWeight: 850 }}>Beta</span>
        <h1 id="live-beta-unavailable-heading" tabIndex={-1}>
          Live AI is unavailable
        </h1>
        {loading ? (
          <StatusNotice role="status" tone="neutral">
            Checking Live AI Beta availability…
          </StatusNotice>
        ) : (
          <p>{message}</p>
        )}
        <p>Local recording, upload, editing, and existing-video AI workflows remain available.</p>
        <div data-beta-actions>
          <Button variant="primary" disabled={loading} onClick={onOpenStudio}>
            Create without Live AI
          </Button>
          <Button variant="quiet" onClick={onOpenDashboard}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </section>
  );
};
