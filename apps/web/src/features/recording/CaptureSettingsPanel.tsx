import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useRef } from 'react';
import type { StudioMode } from '../../application/types';
import { Button, SelectField, StatusNotice } from '../../ui';
import { visuallyHiddenStyles } from '../../ui/primitives/VisuallyHidden';
import { cameraAvailabilityNotices } from './cameraAvailability';
import { aspectRatioLabels, profileLabels } from './captureLabels';
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

const introductionStyles = (theme: Theme, presentation: 'overlay' | 'sidebar'): CSSObject => ({
  display: 'grid',
  gap: theme.space.xxs,
  '& h3': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
  },
  // Docked, the disclosure control that opens this panel is already titled "Capture settings"; the
  // heading stays for structure rather than repeating that title directly underneath it.
  '& h2': presentation === 'sidebar' ? visuallyHiddenStyles() : { margin: 0 },
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
  // The selected option swaps to the accent-soft background, where faint caption text no longer
  // clears AA. Only the selected state needs the step up.
  '& label[data-selected="true"] small': { color: theme.colors.textMuted },
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
  borderBlockStart: `1px solid ${theme.colors.divider}`,
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
  'use memo';

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
  const cameraNotices = cameraAvailabilityNotices({
    permissionState: controller.cameraPermissionState,
    devicesState: controller.devicesState,
    cameraCount: controller.cameraDevices.length,
  });
  const showMacContinuityHelp = isMacDesktop();

  return (
    <form css={panelStyles(theme, presentation)} data-capture-settings-presentation={presentation}>
      <div data-scroll-region="capture-settings" css={bodyStyles(theme, presentation)}>
        <header css={introductionStyles(theme, presentation)}>
          {presentation === 'sidebar' ? <h2>Capture settings</h2> : <h3>Sources and quality</h3>}
          <p>Changes apply automatically and take effect on your next Start.</p>
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
            The current preview stays live until the new one is ready.
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
                  : 'Names fill in once you allow camera access.'
              }
              onValueChange={(value) => controller.updateVideoDeviceId(value || null)}
            />

            {cameraNotices.map((notice) => (
              <StatusNotice key={notice.id} tone={notice.tone} role="status" title={notice.title}>
                {notice.body}
              </StatusNotice>
            ))}

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
                : 'Used for recording, and for AI takes with no model audio.'
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
                <p>Sets the shape of your preview and recording.</p>
              </fieldset>
              <SelectField
                label="Local preview quality"
                value={controller.draft.profile}
                disabled={controlsDisabled}
                hint="The browser picks the closest setting your camera supports."
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
