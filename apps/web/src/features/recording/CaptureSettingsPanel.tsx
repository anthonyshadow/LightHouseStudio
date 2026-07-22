import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, type FormEvent } from 'react';
import type { StudioMode } from '../../application/types';
import { Button, SelectField, StatusNotice } from '../../ui';
import type {
  CaptureDeviceOption,
  CapturePreferencesController,
  LocalCaptureProfileId,
} from './types';

export type CaptureSettingsPanelProps = {
  controller: CapturePreferencesController;
  mode: StudioMode;
  disabled?: boolean;
  disabledReason?: string;
  onApplied?: () => void;
};

const panelStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  overflow: 'hidden',
  color: theme.colors.text,
});

const bodyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
  padding: `calc(${theme.space.md} + 3px)`,
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  '& > *': { minWidth: 0 },
});

const introductionStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xxs,
  '& h3': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
  },
  '& p': {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.5,
  },
});

const settingsGroupStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
});

const actualSettingsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  margin: 0,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& div': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(5.5rem, auto) minmax(0, 1fr)',
    gap: theme.space.sm,
  },
  '& dt': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
  '& dd': {
    minWidth: 0,
    margin: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes.metadata,
    overflowWrap: 'anywhere',
  },
});

const footerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  gap: theme.space.xs,
  padding: theme.space.md,
  paddingBlockEnd: `max(${theme.space.md}, env(safe-area-inset-bottom))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.canvasRaised,
  '& button': { minWidth: 0, whiteSpace: 'nowrap' },
  '@media (max-width: 22rem)': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    '& button:last-of-type': { gridColumn: '1 / -1', gridRow: 1 },
  },
});

const profileLabels: Record<LocalCaptureProfileId, string> = {
  '720p30': '720p · 30 fps',
  '1080p30': '1080p · 30 fps',
};

const selectedDeviceAvailable = (
  selected: string | null,
  options: CaptureDeviceOption[],
): boolean => !selected || options.some((option) => option.deviceId === selected);

const resolutionLabel = (
  settings: CapturePreferencesController['actualSettings']['video'],
): string => {
  if (!settings) return 'Available after preview starts';
  if (!settings.width || !settings.height) return 'Browser negotiated';
  const frameRate = settings.frameRate ? ` · ${Math.round(settings.frameRate)} fps` : '';
  return `${settings.width}×${settings.height}${frameRate}`;
};

export const CaptureSettingsPanel = ({
  controller,
  mode,
  disabled = false,
  disabledReason,
  onApplied,
}: CaptureSettingsPanelProps) => {
  const theme = useTheme();
  const localMode = mode === 'local';
  const controlsDisabled = disabled || controller.applying;
  const { devicesState, refreshDevices } = controller;

  useEffect(() => {
    if (devicesState === 'idle') void refreshDevices();
  }, [devicesState, refreshDevices]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    if (await controller.apply()) onApplied?.();
  };

  const cameraSelectionAvailable = selectedDeviceAvailable(
    controller.draft.videoDeviceId,
    controller.cameraDevices,
  );
  const microphoneSelectionAvailable = selectedDeviceAvailable(
    controller.draft.audioDeviceId,
    controller.microphoneDevices,
  );

  return (
    <form css={panelStyles(theme)} onSubmit={(event) => void submit(event)}>
      <div data-scroll-region="capture-settings" css={bodyStyles(theme)}>
        <header css={introductionStyles(theme)}>
          <h3>Sources and quality</h3>
          <p>
            Device choices stay in this tab. Listing devices does not start the camera or
            microphone.
          </p>
        </header>

        {disabled && disabledReason ? (
          <StatusNotice tone="warning" role="status" title="Settings unavailable">
            {disabledReason}
          </StatusNotice>
        ) : null}
        {controller.deviceError ? (
          <StatusNotice tone="warning" role="status" title="Device list unavailable">
            {controller.deviceError}
          </StatusNotice>
        ) : null}
        {controller.applyError ? (
          <StatusNotice tone="danger" role="alert" title="Settings unchanged">
            {controller.applyError}
          </StatusNotice>
        ) : null}

        <div css={settingsGroupStyles(theme)}>
          <SelectField
            label="Camera"
            value={controller.draft.videoDeviceId ?? ''}
            disabled={controlsDisabled}
            hint={
              controller.devicesState === 'loading'
                ? 'Looking for available cameras…'
                : 'Labels may remain generic until camera permission is granted.'
            }
            onChange={(event) => controller.updateVideoDeviceId(event.currentTarget.value || null)}
          >
            <option value="">Default camera</option>
            {!cameraSelectionAvailable && controller.draft.videoDeviceId ? (
              <option value={controller.draft.videoDeviceId}>Selected camera (unavailable)</option>
            ) : null}
            {controller.cameraDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Microphone"
            value={controller.draft.audioDeviceId ?? ''}
            disabled={controlsDisabled}
            hint={
              controller.devicesState === 'loading'
                ? 'Looking for available microphones…'
                : 'The selected microphone is used for local capture and provider fallback audio.'
            }
            onChange={(event) => controller.updateAudioDeviceId(event.currentTarget.value || null)}
          >
            <option value="">Default microphone</option>
            {!microphoneSelectionAvailable && controller.draft.audioDeviceId ? (
              <option value={controller.draft.audioDeviceId}>
                Selected microphone (unavailable)
              </option>
            ) : null}
            {controller.microphoneDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </SelectField>

          {localMode ? (
            <SelectField
              label="Local preview quality"
              value={controller.draft.profile}
              disabled={controlsDisabled}
              hint="The browser may negotiate a lower setting when the camera cannot meet the target."
              onChange={(event) =>
                controller.updateProfile(event.currentTarget.value as LocalCaptureProfileId)
              }
            >
              {controller.supportedProfiles.map((profile) => (
                <option key={profile} value={profile}>
                  {profileLabels[profile]}
                </option>
              ))}
            </SelectField>
          ) : (
            <StatusNotice tone="neutral" title="Provider-managed quality">
              Character AI and Virtual Try-On use the active model&apos;s required capture size.
              Camera and microphone choices still apply.
            </StatusNotice>
          )}
        </div>

        <div>
          <h3 css={{ margin: `0 0 ${theme.space.sm}`, fontSize: theme.fontSizes.metadata }}>
            Active capture
          </h3>
          <dl css={actualSettingsStyles(theme)}>
            <div>
              <dt>Camera</dt>
              <dd>{controller.actualSettings.video?.label ?? 'Not started'}</dd>
            </div>
            <div>
              <dt>Microphone</dt>
              <dd>{controller.actualSettings.audio?.label ?? 'Not started'}</dd>
            </div>
            <div>
              <dt>Resolution</dt>
              <dd>{resolutionLabel(controller.actualSettings.video)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <footer css={footerStyles(theme)}>
        <Button
          size="small"
          variant="quiet"
          aria-label="Refresh media devices"
          disabled={controlsDisabled || controller.devicesState === 'loading'}
          busy={controller.devicesState === 'loading'}
          onClick={() => void controller.refreshDevices()}
        >
          Refresh
        </Button>
        <Button
          size="small"
          variant="quiet"
          aria-label="Discard capture setting changes"
          disabled={controlsDisabled || !controller.hasPendingChanges}
          onClick={controller.discardPending}
        >
          Discard
        </Button>
        <Button
          type="submit"
          size="small"
          variant="primary"
          busy={controller.applying}
          disabled={disabled || !controller.hasPendingChanges}
        >
          Apply settings
        </Button>
      </footer>
    </form>
  );
};
