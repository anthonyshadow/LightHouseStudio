import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useRef } from 'react';
import type { StudioMode } from '../../application/types';
import { Button, SelectField, StatusNotice } from '../../ui';
import type {
  CaptureDeviceOption,
  CapturePreferencesController,
  LocalCaptureAspectRatio,
  LocalCaptureProfileId,
} from './types';

export type CaptureSettingsPanelProps = {
  controller: CapturePreferencesController;
  mode: StudioMode;
  disabled?: boolean;
  disabledReason?: string;
  presentation?: 'overlay' | 'sidebar';
};

const panelStyles = (theme: Theme, presentation: 'overlay' | 'sidebar'): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr)',
  overflow: 'hidden',
  color: theme.colors.text,
  ...(presentation === 'sidebar'
    ? {
        border: 0,
        borderRadius: 'inherit',
        background: theme.colors.canvasRaised,
      }
    : {}),
});

const bodyStyles = (theme: Theme, presentation: 'overlay' | 'sidebar'): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: presentation === 'sidebar' ? theme.space.sm : theme.space.md,
  padding: presentation === 'sidebar' ? theme.space.sm : `calc(${theme.space.md} + 3px)`,
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'thin',
  scrollbarColor: `${theme.colors.borderStrong} transparent`,
  '&::-webkit-scrollbar': { width: '0.45rem' },
  '&::-webkit-scrollbar-track': { background: 'transparent' },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: '999px',
    background: theme.colors.borderStrong,
  },
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

const settingsGroupStyles = (theme: Theme, presentation: 'overlay' | 'sidebar'): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: presentation === 'sidebar' ? theme.space.sm : theme.space.md,
  padding: presentation === 'sidebar' ? theme.space.sm : theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
});

const aspectRatioFieldsetStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xs,
  margin: 0,
  padding: 0,
  border: 0,
  '& legend': {
    marginBlockEnd: theme.space.xs,
    color: theme.colors.text,
    fontSize: theme.fontSizes.metadata,
    fontWeight: 760,
  },
  '& > div': {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: theme.space.xs,
  },
  '& label': {
    position: 'relative',
    minWidth: 0,
    minHeight: '3.5rem',
    display: 'grid',
    gridTemplateColumns: '1.5rem minmax(0, 1fr)',
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    color: theme.colors.textMuted,
    background: theme.colors.canvasRaised,
    cursor: 'pointer',
  },
  '& label[data-selected="true"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.text,
    background: theme.colors.accentSoft,
  },
  '& label:focus-within': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '& label:has(input:disabled)': { cursor: 'not-allowed', opacity: 0.56 },
  '& input': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    opacity: 0,
  },
  '& [data-format-preview]': {
    justifySelf: 'center',
    border: `2px solid ${theme.colors.accent}`,
    borderRadius: '0.2rem',
  },
  '& [data-format-preview="16:9"]': { width: '1.5rem', aspectRatio: '16 / 9' },
  '& [data-format-preview="9:16"]': { height: '1.5rem', aspectRatio: '9 / 16' },
  '& [data-format-label]': { minWidth: 0, display: 'grid', gap: theme.space.xxs },
  '& strong': { fontSize: theme.fontSizes.metadata },
  '& small': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
  '& > p': {
    margin: 0,
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.45,
  },
  '@media (max-width: 22rem)': {
    '& > div': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  '&[data-sidebar-layout="true"] > div': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  '&[data-sidebar-layout="true"] label': {
    minHeight: '3.25rem',
    padding: theme.space.sm,
  },
});

const cameraSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
});

const noticeActionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  '& button': {
    minHeight: '2.75rem',
  },
});

const helpStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  paddingBlockStart: theme.space.sm,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  lineHeight: 1.5,
  '& summary': {
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    color: theme.colors.text,
    cursor: 'pointer',
    fontWeight: 720,
  },
  '& summary::after': {
    content: '"›"',
    fontSize: '1.25rem',
    lineHeight: 1,
    transform: 'rotate(90deg)',
  },
  '&[open] summary::after': {
    transform: 'rotate(-90deg)',
  },
  '& p': { margin: `${theme.space.xs} 0 0` },
  '& ol': {
    display: 'grid',
    gap: theme.space.xs,
    margin: `${theme.space.sm} 0 0`,
    paddingInlineStart: '1.35rem',
  },
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

const profileLabels: Record<LocalCaptureProfileId, string> = {
  '720p30': '720p · 30 fps',
  '1080p30': '1080p · 30 fps',
};

const aspectRatioLabels: Record<LocalCaptureAspectRatio, string> = {
  '16:9': 'Landscape · 16:9',
  '9:16': 'Portrait · 9:16',
};

const selectedDeviceAvailable = (
  selected: string | null,
  options: CaptureDeviceOption[],
): boolean => !selected || options.some((option) => option.deviceId === selected);

const looksLikePhoneCamera = (label: string): boolean =>
  /\b(?:continuity camera|iphone camera|android phone camera|phone camera)\b/iu.test(label);

const isMacDesktop = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Mac/iu.test(navigator.platform) &&
  navigator.maxTouchPoints < 2;

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
  presentation = 'overlay',
}: CaptureSettingsPanelProps) => {
  const theme = useTheme();
  const localMode = mode === 'local';
  const controlsDisabled = disabled || controller.applying;
  const { devicesState, refreshDevices } = controller;
  const lastAutoApplyRef = useRef<string | null>(null);
  const draftSignature = [
    controller.draft.videoDeviceId ?? '',
    controller.draft.audioDeviceId ?? '',
    controller.draft.profile,
    controller.draft.aspectRatio,
  ].join('|');

  useEffect(() => {
    if (devicesState === 'idle') void refreshDevices();
  }, [devicesState, refreshDevices]);

  useEffect(() => {
    if (
      disabled ||
      controller.applying ||
      !controller.hasPendingChanges ||
      lastAutoApplyRef.current === draftSignature
    ) {
      return;
    }

    lastAutoApplyRef.current = draftSignature;
    void controller.apply().then((applied) => {
      if (!applied) controller.discardPending(true);
    });
  }, [controller, disabled, draftSignature]);

  const cameraSelectionAvailable = selectedDeviceAvailable(
    controller.draft.videoDeviceId,
    controller.cameraDevices,
  );
  const microphoneSelectionAvailable = selectedDeviceAvailable(
    controller.draft.audioDeviceId,
    controller.microphoneDevices,
  );
  const phoneCameraVisible = controller.cameraDevices.some(({ label }) =>
    looksLikePhoneCamera(label),
  );
  const showMacContinuityHelp = isMacDesktop();

  return (
    <form css={panelStyles(theme, presentation)} data-capture-settings-presentation={presentation}>
      <div data-scroll-region="capture-settings" css={bodyStyles(theme, presentation)}>
        <header css={introductionStyles(theme)}>
          {presentation === 'sidebar' ? <h2>Capture settings</h2> : <h3>Sources and quality</h3>}
          <p>
            Device choices stay in this tab. Listing devices does not start the camera or
            microphone. Changes apply automatically.
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
        {controller.applying ? (
          <StatusNotice tone="neutral" role="status" title="Applying settings">
            The change is being applied automatically. A live preview stays active until its
            replacement is ready.
          </StatusNotice>
        ) : null}
        {controller.videoFallbackNotice ? (
          <StatusNotice tone="warning" role="status" title="Using the default camera">
            <div css={noticeActionStyles(theme)}>
              <span>{controller.videoFallbackNotice}</span>
              <Button
                type="button"
                size="small"
                variant="quiet"
                aria-label="Dismiss unavailable camera notice"
                onClick={controller.dismissVideoFallbackNotice}
              >
                Dismiss
              </Button>
            </div>
          </StatusNotice>
        ) : null}

        <div css={settingsGroupStyles(theme, presentation)}>
          <section aria-label="Camera settings" css={cameraSectionStyles(theme)}>
            <SelectField
              label="Camera"
              value={controller.draft.videoDeviceId ?? ''}
              disabled={controlsDisabled}
              options={[
                { value: '', label: 'Default camera' },
                ...(!cameraSelectionAvailable && controller.draft.videoDeviceId
                  ? [
                      {
                        value: controller.draft.videoDeviceId,
                        label: 'Selected camera (unavailable)',
                      },
                    ]
                  : []),
                ...controller.cameraDevices.map((device) => ({
                  value: device.deviceId,
                  label: device.label,
                })),
              ]}
              hint={
                controller.devicesState === 'loading'
                  ? 'Looking for available cameras…'
                  : 'Every camera exposed by the browser appears here. Labels may remain generic until permission is granted.'
              }
              onValueChange={(value) => controller.updateVideoDeviceId(value || null)}
            />

            {controller.cameraPermissionState === 'denied' ? (
              <StatusNotice tone="warning" role="status" title="Camera permission blocked">
                Allow camera access in browser or system settings. Studio rescans after a successful
                Start or a browser-reported device change. Opening this panel never requests
                permission.
              </StatusNotice>
            ) : controller.cameraPermissionState === 'prompt' ? (
              <StatusNotice tone="neutral" role="status" title="Camera permission not granted">
                Camera access is requested only after an explicit Start action. Device names may be
                generic until then.
              </StatusNotice>
            ) : null}

            {controller.devicesState === 'ready' && controller.cameraDevices.length === 0 ? (
              <StatusNotice tone="warning" role="status" title="No camera available">
                No camera is currently exposed to this browser. Connect or enable a camera, review
                permission, and Studio will update when the browser reports the device change.
              </StatusNotice>
            ) : null}

            {!phoneCameraVisible ? (
              <details css={helpStyles(theme)}>
                <summary>Use a phone as a camera</summary>
                <p>Your phone will appear here when your computer exposes it as a camera.</p>
                {showMacContinuityHelp ? (
                  <ol>
                    <li>
                      On iPhone, enable Settings → General → AirPlay &amp; Continuity → Continuity
                      Camera.
                    </li>
                    <li>
                      Confirm the Mac and iPhone use the same Apple Account with two-factor
                      authentication.
                    </li>
                    <li>Enable Bluetooth and Wi-Fi on both devices and keep them nearby.</li>
                    <li>Lock and position the iPhone with its rear camera facing you.</li>
                    <li>Use USB if the wireless connection is unavailable or unstable.</li>
                  </ol>
                ) : null}
              </details>
            ) : null}
          </section>

          <SelectField
            label="Microphone"
            value={controller.draft.audioDeviceId ?? ''}
            disabled={controlsDisabled}
            options={[
              { value: '', label: 'Default microphone' },
              ...(!microphoneSelectionAvailable && controller.draft.audioDeviceId
                ? [
                    {
                      value: controller.draft.audioDeviceId,
                      label: 'Selected microphone (unavailable)',
                    },
                  ]
                : []),
              ...controller.microphoneDevices.map((device) => ({
                value: device.deviceId,
                label: device.label,
              })),
            ]}
            hint={
              controller.devicesState === 'loading'
                ? 'Looking for available microphones…'
                : 'The selected microphone is used for local capture and provider fallback audio.'
            }
            onValueChange={(value) => controller.updateAudioDeviceId(value || null)}
          />

          {localMode ? (
            <>
              <fieldset
                css={aspectRatioFieldsetStyles(theme)}
                data-sidebar-layout={presentation === 'sidebar' ? 'true' : undefined}
              >
                <legend>Video format</legend>
                <div>
                  {(Object.keys(aspectRatioLabels) as LocalCaptureAspectRatio[]).map(
                    (aspectRatio) => (
                      <label
                        key={aspectRatio}
                        data-selected={
                          controller.draft.aspectRatio === aspectRatio ? 'true' : 'false'
                        }
                      >
                        <input
                          type="radio"
                          name="capture-aspect-ratio"
                          value={aspectRatio}
                          checked={controller.draft.aspectRatio === aspectRatio}
                          disabled={controlsDisabled}
                          aria-label={aspectRatioLabels[aspectRatio]}
                          onChange={() => controller.updateAspectRatio(aspectRatio)}
                        />
                        <span data-format-preview={aspectRatio} aria-hidden="true" />
                        <span data-format-label>
                          <strong>{aspectRatioLabels[aspectRatio]}</strong>
                          <small>{aspectRatio === '16:9' ? 'Wide frame' : 'Vertical frame'}</small>
                        </span>
                      </label>
                    ),
                  )}
                </div>
                <p>
                  Sets the shape for local preview and recording. Unsupported formats leave the
                  current preview unchanged.
                </p>
              </fieldset>
              <SelectField
                label="Local preview quality"
                value={controller.draft.profile}
                disabled={controlsDisabled}
                hint="The browser may negotiate a lower setting when the camera cannot meet the target."
                options={controller.supportedProfiles.map((profile) => ({
                  value: profile,
                  label: profileLabels[profile],
                }))}
                onValueChange={(value) => controller.updateProfile(value as LocalCaptureProfileId)}
              />
            </>
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
    </form>
  );
};
