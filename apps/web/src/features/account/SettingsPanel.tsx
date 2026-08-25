import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useState, type RefObject } from 'react';
import { loadCapturePreferences } from '../../orchestration/session/capturePreferencesStorage';
import { LOCAL_RETENTION_NOTICE } from '../../studio/sessionNotices';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import {
  clearDashboardOnboardingDismissed,
  ONBOARDING_PREFERENCE_NOT_RETAINED,
  useDashboardOnboardingDismissed,
} from '../dashboard/dashboardOnboarding';
import { aspectRatioLabels, profileLabels } from '../recording/captureLabels';

const settingsStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xl,
  '& section': { display: 'grid', gap: theme.space.sm },
  '& h3': {
    margin: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes.label,
    fontWeight: 800,
  },
  '& p': {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.55,
  },
  '& dl': {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gap: `${theme.space.xs} ${theme.space.md}`,
    margin: 0,
    padding: `${theme.space.sm} ${theme.space.md}`,
    border: `1px solid ${theme.colors.divider}`,
    borderRadius: theme.radii.medium,
    fontSize: theme.fontSizes.metadata,
  },
  '& dt': { color: theme.colors.textFaint },
  '& dd': { margin: 0, color: theme.colors.text },
  '& button': { justifySelf: 'start' },
});

interface SettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly ownerUserId: string;
}

/**
 * The preferences this browser keeps for the signed-in operator.
 *
 * Deliberately short. The audit expected a Settings destination holding default placement, default
 * resolution, autosave behaviour and a download location; working through them, three of those are
 * not settings at all — the browser owns where a download lands, Project autosave is a correctness
 * mechanism rather than a preference, and capture resolution already lives with the camera, where
 * the device list that constrains it is. What is left is what this panel shows: one preference the
 * product could set but never unset, a read-only account of what Studio remembers, and a plain
 * statement of what stays in this browser.
 *
 * Capture choices are shown, not edited. The Studio runtime reads them once when it mounts and
 * writes them back as the operator applies them, so a second editor here would quietly lose to it.
 * The camera is where you choose a camera.
 */
export const SettingsPanel = ({
  open,
  onClose,
  returnFocusRef,
  ownerUserId,
}: SettingsPanelProps) => {
  const theme = useTheme();
  const [restoreFailed, setRestoreFailed] = useState(false);
  /*
   * Both values are read through their owners rather than copied into state. The guidance is a
   * subscription because this panel changes it and has to show the result immediately; the capture
   * record is a plain read because only Studio writes it, and Studio is not open behind this. The
   * read is unconditional so the panel's content does not change under the exit animation.
   */
  const guidanceDismissed = useDashboardOnboardingDismissed(ownerUserId);
  const capture = loadCapturePreferences(ownerUserId);

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Settings"
      description="Preferences this browser keeps for your account."
      returnFocusRef={returnFocusRef}
      placement="right"
      size="standard"
      closeLabel="Close settings"
    >
      <div css={settingsStyles(theme)}>
        <section aria-labelledby="settings-guidance-heading">
          <h3 id="settings-guidance-heading">Getting started</h3>
          <p>
            The Dashboard offers a short guide while an account has no work yet. Dismissing it used
            to be permanent.
          </p>
          {guidanceDismissed ? (
            <Button
              variant="secondary"
              onClick={() => setRestoreFailed(!clearDashboardOnboardingDismissed(ownerUserId))}
            >
              Show the guide again
            </Button>
          ) : (
            <p>The guide is available. It appears on the Dashboard once your work is empty.</p>
          )}
          {/* Only while the failure is still true: a success clears the state it described. */}
          {restoreFailed && guidanceDismissed ? (
            <StatusNotice role="alert" tone="warning" title="Preference not retained">
              {ONBOARDING_PREFERENCE_NOT_RETAINED}
            </StatusNotice>
          ) : null}
        </section>

        <section aria-labelledby="settings-capture-heading">
          <h3 id="settings-capture-heading">Capture defaults</h3>
          <p>
            Studio remembers what you last applied and starts there next time. Change them in
            Studio, under Capture settings, where the device list is.
          </p>
          {capture ? (
            <dl>
              <dt>Shape</dt>
              <dd>{aspectRatioLabels[capture.aspectRatio]}</dd>
              <dt>Quality</dt>
              <dd>{profileLabels[capture.profile]}</dd>
              <dt>Camera</dt>
              <dd>
                {capture.videoDeviceId === null ? 'This device’s default' : 'A chosen camera'}
              </dd>
              <dt>Microphone</dt>
              <dd>
                {capture.audioDeviceId === null ? 'This device’s default' : 'A chosen microphone'}
              </dd>
            </dl>
          ) : (
            <p>Nothing remembered yet. Studio will start from this device’s defaults.</p>
          )}
        </section>

        <section aria-labelledby="settings-retention-heading">
          <h3 id="settings-retention-heading">What this browser keeps</h3>
          <p>{LOCAL_RETENTION_NOTICE}</p>
        </section>
      </div>
    </OverlayPanel>
  );
};
