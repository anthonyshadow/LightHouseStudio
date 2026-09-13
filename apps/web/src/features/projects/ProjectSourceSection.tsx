import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, ConfirmationDialog, StatusNotice } from '../../ui';
import { PROJECT_RECORDING_TAKE_IN_PROGRESS_NOTICE } from '../take-review/takeRefusalNotices';
import { PROJECT_MEDIA_REMOVAL_REASSURANCE } from './projectProcessingPresentation';
import type { ProjectRecordingLaunchRefusal } from './projectRecordingLaunch';
import { emptyProjectStyles } from './ProjectRouteSurface.styles';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import {
  PROJECT_VIDEO_FILE_ACCEPT,
  projectVideoIntakeNotice,
  useProjectVideoIntake,
} from './useProjectVideoIntake';
import {
  useProjectSourceController,
  type ProjectSourceActivity,
  type ProjectSourcePhase,
  type ProjectSourceRuntime,
} from './useProjectSourceController';

export interface ProjectRecordingCandidate {
  readonly file: File;
  /**
   * The stage artifact these bytes came from.
   *
   * A take stays `recorded` through every re-presentation, so a surface that takes one on has to
   * remember which one — and the artifact id is the identity the capture graph already holds, where
   * a file's name, size and timestamp are only a reconstruction of it.
   */
  readonly artifactId: string;
  readonly ready: boolean;
}

/** What a surface mounted away from the capture graph hands the section. */
export const detachedSourceRuntime: ProjectSourceRuntime = { kind: 'detached' };

interface ProjectSourceNotice {
  readonly title: string;
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
  readonly body: string;
}

const projectSourceNotice = (
  phase: ProjectSourcePhase,
  message: string | null,
): ProjectSourceNotice | null => {
  switch (phase) {
    case 'hydrating':
      return {
        title: 'Preparing video',
        tone: 'neutral',
        body: 'Loading this Project’s original video onto the stage.',
      };
    case 'preparing':
      return {
        title: 'Preparing video',
        tone: 'neutral',
        body: 'Uploading and checking your video. You can reopen this Project once it is saved.',
      };
    case 'saving':
      return {
        title: 'Saving changes',
        tone: 'neutral',
        body: 'Saving the video and this change to your Project.',
      };
    case 'removing':
      return {
        title: 'Removing video',
        tone: 'neutral',
        body: 'Removing the original video from this Project.',
      };
    case 'saved':
      return null;
    case 'conflict':
      return {
        title: 'Conflict',
        tone: 'warning',
        body: message ?? 'The Project changed. Refresh before trying again.',
      };
    case 'error':
      return {
        title: 'Video not saved',
        tone: 'danger',
        body: message ?? 'That video was not accepted.',
      };
    case 'idle':
      return null;
  }
};

/*
 * Why the Record control is off, said before it is pressed rather than after — a browser that
 * cannot capture is not a condition the operator can wait out, so it names the two controls beside
 * it that do work. Nothing answers this from a press: the same fact that would refuse the launch
 * has already disabled the button.
 */
const RECORDING_UNSUPPORTED_NOTICE =
  'This browser cannot record video. Upload a video or use a saved one instead.';

/**
 * What a Record press says when it started nothing, and only while that is still true.
 *
 * A refusal names a condition the runtime is in rather than an event that happened, so it is read
 * against that condition on every render instead of being latched by the press: the sentence
 * arrives with the busy Record control as the take the launch refused for lands in this surface's
 * props, and it leaves with it. Latched, it outlived finalization and was still on screen beside
 * the "Use finalized recording" button that replaces Record once the take is ready — telling the
 * operator to finish a take they had just finished.
 *
 * A member added here has to say both halves before it can reach the screen, which is the point of
 * the switch: a refusal with no sentence, or with no condition to hold it up, will not compile.
 */
const recordingRefusalNotice = (
  refusal: ProjectRecordingLaunchRefusal | null,
  recordingActive: boolean,
): string | null => {
  switch (refusal) {
    case 'take-in-progress':
      // The one prop that carries it: the workspace sets this for a take being captured and for one
      // still finalizing alike, which is exactly the span this sentence is true for.
      return recordingActive ? PROJECT_RECORDING_TAKE_IN_PROGRESS_NOTICE : null;
    case null:
      return null;
  }
};

export const ProjectSourceSection = ({
  current,
  runtime,
  recordingCandidate,
  recordingActive = false,
  recordingSupported = true,
  removalBlockedReason,
  onStartRecording,
  onActivityChange,
  onCurrentChange,
}: {
  readonly current: ProjectCurrentResponse;
  readonly runtime: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null | undefined;
  readonly recordingActive?: boolean | undefined;
  /**
   * Whether the browser a Record press would reach can capture at all. Defaults to true: a caller
   * that mounts away from the capture graph cannot know, and its Record control leads to the
   * workspace rather than to a camera, which works either way.
   */
  readonly recordingSupported?: boolean | undefined;
  readonly removalBlockedReason?: string | undefined;
  /**
   * Starts a capture for this Project's source slot. Answers a refusal, so a press that started
   * nothing can say so; absent where recording is not offered here at all. `null` is the whole of
   * the rest — a launch that ran, a confirmation that took the press over, and the caller whose
   * Record control only navigates, because the launch happens on the surface it opens.
   */
  readonly onStartRecording?: (() => ProjectRecordingLaunchRefusal | null) | undefined;
  readonly onActivityChange?: ((activity: ProjectSourceActivity) => void) | undefined;
  readonly onCurrentChange?: ((current: ProjectCurrentResponse) => void) | undefined;
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const savedVideoTriggerRef = useRef<HTMLButtonElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const recordingUnsupportedId = useId();
  const [recordingRefusal, setRecordingRefusal] = useState<ProjectRecordingLaunchRefusal | null>(
    null,
  );
  // Relayed rather than passed straight through, so the intake below can be reported as the work
  // it is; the controller stays the only author of everything else in an activity.
  const [controllerActivity, setControllerActivity] = useState<ProjectSourceActivity | null>(null);
  const controller = useProjectSourceController(
    current.project.id,
    current,
    runtime,
    setControllerActivity,
    onCurrentChange,
  );
  const { upload } = controller;
  const acceptIntake = useCallback(
    (file: File) => {
      void upload(file);
    },
    [upload],
  );
  const intake = useProjectVideoIntake(acceptIntake);
  const archived = current.project.archivedAt !== null;
  // One idea of busy for the whole section: an intake is the operator's video being made ready
  // just as much as the upload that follows it, and offering a second file mid-conversion would
  // discard the first one silently.
  const busy = controller.busy || intake.phase !== null;
  const controlsDisabled = archived || busy || controller.accepted;
  /*
   * What the shell is told while the intake runs. Reported idle, a conversion looks like nothing
   * in flight, and a logout or an expiring session would throw away minutes of work without
   * offering to keep it. `preparing` is the phase this product already shows for "your video is
   * being made ready", and the abort is the intake's own, so discarding pending work discards this.
   */
  const reportedActivity = useMemo<ProjectSourceActivity | null>(() => {
    if (controllerActivity === null || intake.phase === null) return controllerActivity;
    return { ...controllerActivity, phase: 'preparing', busy: true, abort: intake.cancel };
  }, [controllerActivity, intake.cancel, intake.phase]);

  useEffect(() => {
    if (reportedActivity !== null) onActivityChange?.(reportedActivity);
  }, [onActivityChange, reportedActivity]);

  // Recording needs the capture graph, which only mounts on a Studio route. Where it is absent and
  // the caller offered a way to one, the control names where recording actually happens.
  const detached = runtime.kind === 'detached';
  /*
   * The one refusal this section can see coming, so the control is off with the reason attached
   * rather than live and dead — the treatment every other Record control in the product gets, and
   * the reason the launch never has to answer for an unsupported browser. Read only where a launch
   * is offered: elsewhere the button is already off, and "this browser" would be the wrong reason.
   */
  const recordingUnsupported = onStartRecording !== undefined && !recordingSupported;
  // One write, because the launch answers before this returns: an earlier press's refusal is
  // replaced by this press's, whatever that is, and `null` is how a press that started something
  // clears it.
  const startRecording = () => {
    setRecordingRefusal(onStartRecording?.() ?? null);
  };
  const recordingRefusalMessage = recordingRefusalNotice(recordingRefusal, recordingActive);
  /*
   * One notice, with the intake speaking first while it has something to say: its wait is the only
   * thing happening, and a refusal from here supersedes whatever the last attempt at the server
   * left on screen.
   */
  const stateNotice: ProjectSourceNotice | null =
    intake.phase !== null
      ? projectVideoIntakeNotice(intake.phase)
      : intake.refusal !== null
        ? { title: 'Video not used', tone: 'danger', body: intake.refusal }
        : projectSourceNotice(controller.phase, controller.message);
  // The controller's phase/message stay the single owner of the failure text; the dialog just
  // renders it where the operator is looking when a removal is refused.
  const removalFailure =
    controller.phase === 'conflict' || controller.phase === 'error'
      ? (controller.message ?? undefined)
      : undefined;

  return (
    <>
      <section css={emptyProjectStyles(theme)} aria-labelledby="project-source-heading">
        <div>
          <h3 id="project-source-heading">
            {controller.accepted ? 'Original video ready' : 'No original video yet'}
          </h3>
          {controller.accepted && controller.source ? (
            <>
              <p>
                {controller.source.filename} · {controller.source.width}×{controller.source.height}{' '}
                · {Math.round(controller.source.durationMs / 1_000)} seconds
              </p>
              <p>
                {controller.source.kind === 'saved-video-version'
                  ? 'This Project works from a video already in your library. That video is not changed.'
                  : 'This Project works from this video. Remove it to start from a different one.'}
              </p>
            </>
          ) : (
            <p>
              Choose the one video this Project works from. You can try again if an upload fails,
              and you can remove it later to choose a different one.
            </p>
          )}
          {stateNotice ? (
            // The tone already says whether this is a problem, and now three sources of notice
            // share it; reading the role off the tone keeps them from disagreeing about it.
            <StatusNotice
              role={
                stateNotice.tone === 'neutral' || stateNotice.tone === 'success'
                  ? 'status'
                  : 'alert'
              }
              tone={stateNotice.tone}
              title={stateNotice.title}
              css={{ marginBlockStart: theme.space.md }}
            >
              {stateNotice.body}
            </StatusNotice>
          ) : null}
        </div>
        <div data-source-actions>
          {/*
            Three ways to a first video, withdrawn once there is one rather than shown dead beside
            the Media area's live equivalents. The original is immutable while it is attached, so
            these were never going to act again — and a disabled Record above a working one says
            the opposite of what is true.
          */}
          {controller.accepted ? null : (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={PROJECT_VIDEO_FILE_ACCEPT}
                hidden
                disabled={controlsDisabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void intake.offer(file);
                }}
              />
              {recordingCandidate?.ready ? (
                <Button
                  variant="primary"
                  busy={controller.busy}
                  disabled={archived || busy}
                  onClick={() => {
                    // A take supersedes a file the intake refused, and the refusal goes with it.
                    intake.dismiss();
                    void controller.acceptRecording(recordingCandidate.file);
                  }}
                >
                  Use finalized recording
                </Button>
              ) : (
                <Button
                  disabled={
                    controlsDisabled || onStartRecording === undefined || recordingUnsupported
                  }
                  busy={recordingActive}
                  aria-describedby={recordingUnsupported ? recordingUnsupportedId : undefined}
                  onClick={startRecording}
                >
                  {detached && onStartRecording !== undefined
                    ? 'Record in the workspace'
                    : 'Record'}
                </Button>
              )}
              <Button disabled={controlsDisabled} onClick={() => inputRef.current?.click()}>
                Upload
              </Button>
              <Button
                ref={savedVideoTriggerRef}
                disabled={controlsDisabled}
                onClick={() => setPickerOpen(true)}
              >
                Use a saved video
              </Button>
              {recordingUnsupported ? (
                <small id={recordingUnsupportedId}>{RECORDING_UNSUPPORTED_NOTICE}</small>
              ) : null}
              {recordingRefusalMessage ? (
                <StatusNotice role="alert" tone="warning">
                  {recordingRefusalMessage}
                </StatusNotice>
              ) : null}
              {detached ? (
                <small>Choosing here opens the workspace, where you can watch it.</small>
              ) : null}
            </>
          )}
          {controller.accepted ? (
            <Button
              ref={removeTriggerRef}
              variant="danger"
              data-source-action="remove"
              disabled={archived || busy}
              onClick={() => setRemoveDialogOpen(true)}
            >
              Remove original video
            </Button>
          ) : null}
          <small>Choosing, recording, or reopening a video never starts paid AI work.</small>
        </div>
      </section>
      {removeDialogOpen ? (
        <ConfirmationDialog
          open
          title="Remove original video"
          description="This Project goes back to choosing a video."
          body={
            <>
              <p>
                Remove “{controller.source?.filename ?? 'this video'}” as the original video for
                this Project? {PROJECT_MEDIA_REMOVAL_REASSURANCE}
              </p>
              {removalBlockedReason === undefined ? null : <p>{removalBlockedReason}</p>}
            </>
          }
          confirmLabel="Remove and choose another"
          cancelLabel="Cancel"
          danger
          busy={controller.busy}
          confirmDisabled={removalBlockedReason !== undefined}
          alert={removalFailure}
          alertTitle="Original video not removed"
          returnFocusRef={removeTriggerRef}
          onCancel={() => setRemoveDialogOpen(false)}
          onConfirm={() => {
            void controller.remove().then((removed) => {
              if (removed) setRemoveDialogOpen(false);
            });
          }}
        />
      ) : null}
      <ProjectSavedVideoPicker
        open={pickerOpen}
        busy={controller.busy}
        projectId={current.project.id}
        title="Choose the original video"
        returnFocusRef={savedVideoTriggerRef}
        onClose={() => setPickerOpen(false)}
        onSelect={(video) => {
          setPickerOpen(false);
          // A library video supersedes a file the intake refused, and the refusal goes with it.
          intake.dismiss();
          void controller.reuseSavedVideo(video);
        }}
      />
    </>
  );
};
