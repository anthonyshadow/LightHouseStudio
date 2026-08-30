import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { Button, EmptyStatePreview, StatusNotice, emptyExampleStyles } from '../../ui';
import { ProjectCreateLaunchers } from './ProjectCreateLaunchers';
import { createEmptyStateStyles } from './ProjectCreateTaskPanel.styles';
import {
  effectiveCreativeSnapshot,
  projectCreateLaunchers,
  projectCurrentCutNotice,
  type ProjectCreateOperationId,
  type ProjectCreativeResourceKind,
} from './projectCreatePresentation';
import { ProjectProcessingStatusPanel } from './ProjectProcessingStatusPanel';
import type { ProjectWorkflowStepId } from './ProjectWorkflowProgress';
import {
  ProjectWorkingMediaSection,
  type ProjectWorkingMediaActivity,
} from './ProjectWorkingMediaSection';
import type { ProjectProcessingController } from './useProjectProcessingController';
import type { useProjectCreativeSessionAdapter } from './useProjectCreativeSessionAdapter';
import type { ProjectSessionPort } from './useProjectSession';
import type { useProjectWorkingMediaController } from './useProjectWorkingMediaController';

export type { ProjectCreateOperationId, ProjectCreativeResourceKind };

/**
 * Everything the Create task needs that only the Studio runtime can supply.
 *
 * Deliberately a value bundle rather than a rendered node: every element of this task is derived
 * from the Project snapshot, which the workspace already holds, and both sections need to be
 * direct children of the tabpanel to own a container-query context. Nothing here is a Studio type —
 * the controllers live in this feature — so the inward-pointing import rule still holds.
 */
export interface ProjectCreateRuntime {
  readonly creative: ReturnType<typeof useProjectCreativeSessionAdapter>;
  readonly workingMedia: ReturnType<typeof useProjectWorkingMediaController>;
  /** Opens the editor on this operation. Never submits provider work. */
  readonly onLaunch: (operation: ProjectCreateOperationId, trigger: HTMLButtonElement) => void;
  readonly onChooseAnother: (kind: ProjectCreativeResourceKind) => void;
  /** The operation whose editor is opening, from the click until the editor holds the video. */
  readonly launchingOperation: ProjectCreateOperationId | null;
  readonly characterSwapAvailable: boolean;
  readonly virtualTryOnAvailable: boolean;
  /** Why this exact video can reach no visual provider, if it cannot. */
  readonly visualIncompatibilityReason: string | null;
  /** Why the editor cannot be opened right now — a take in progress, or nothing on the stage. */
  readonly editorBlockedReason: string | undefined;
}

interface ProjectCreateTaskPanelProps {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  readonly archived: boolean;
  readonly processing?: ProjectProcessingController | undefined;
  readonly runtime?: ProjectCreateRuntime | undefined;
  readonly sourceBusy: boolean;
  readonly workingMediaBusy: boolean;
  readonly onOpenSource: () => void;
  readonly onOpenTask: (task: ProjectWorkflowStepId) => void;
  readonly onWorkingMediaActivityChange?:
    ((activity: ProjectWorkingMediaActivity) => void) | undefined;
}

/**
 * The Create task: start an edit, see what the Project has saved, and watch what is running.
 *
 * The launchers open the editor rather than calling the processing controller, so the one
 * cost-acknowledged start stays where the operator can read what it will send.
 */
export const ProjectCreateTaskPanel = ({
  current,
  session,
  archived,
  processing,
  runtime,
  sourceBusy,
  workingMediaBusy,
  onOpenSource,
  onOpenTask,
  onWorkingMediaActivityChange,
}: ProjectCreateTaskPanelProps) => {
  const theme = useTheme();
  // The pending proposal laid over the settled snapshot: a pick reaches the Project through the
  // coalescing autosave, and this panel must name it now rather than a beat later.
  const snapshot = effectiveCreativeSnapshot(current.revision.snapshot, session.proposal);

  if (snapshot.sourceAssetId === null) {
    return (
      <div css={createEmptyStateStyles(theme)} data-project-create-empty="">
        <EmptyStatePreview variant="cards" />
        <h3>Nothing to create from yet</h3>
        <p>
          This Project needs one original video before an edit can start. Choose it in Original.
        </p>
        <p data-empty-example css={emptyExampleStyles(theme)}>
          For example: Character Swap, Virtual Try-On, or trim and crop.
        </p>
        <Button variant="secondary" onClick={onOpenSource}>
          Go to Original
        </Button>
      </div>
    );
  }

  const localRender =
    runtime && runtime.workingMedia.message !== null
      ? {
          notice: projectCurrentCutNotice('local-render', runtime.workingMedia.phase),
          message: runtime.workingMedia.message,
        }
      : null;

  return (
    <>
      {archived ? (
        <StatusNotice role="status" tone="neutral" title="Read-only Project">
          This Project is archived. You can review its setup and the current cut, but you cannot
          start an edit or change it.
        </StatusNotice>
      ) : null}

      {/*
       * A save clears the creative setup and moves the phase to `complete`, both deliberately —
       * but silently, so the workspace looked wiped and the operator concluded the Project had
       * broken. Saying it is the whole fix. It retires itself: the first creative pick rewrites
       * the phase back to `creative`.
       */}
      {!archived &&
      snapshot.workflowPhase === 'complete' &&
      snapshot.lastSuccessfulOutput !== null ? (
        <StatusNotice role="status" tone="neutral" title="Version saved — carry on">
          <p>
            Everything here still works. The saved Version is what you’re editing, and your
            character, outfit and prompt were cleared so the next round starts clean.
          </p>
          <Button size="small" variant="secondary" onClick={() => onOpenTask('history')}>
            See saved Versions
          </Button>
        </StatusNotice>
      ) : null}

      {runtime ? (
        <ProjectCreateLaunchers
          onChooseAnother={runtime.onChooseAnother}
          launchers={projectCreateLaunchers({
            snapshot,
            archived,
            attempt: processing?.attempt ?? null,
            authorityReady: processing?.authorityReady ?? false,
            characterSwapAvailable: runtime.characterSwapAvailable,
            virtualTryOnAvailable: runtime.virtualTryOnAvailable,
            visualIncompatibilityReason: runtime.visualIncompatibilityReason,
            editorBlockedReason: runtime.editorBlockedReason,
            sourceBusy,
            workingMediaBusy,
          })}
          busyOperation={runtime.launchingOperation}
          reasonStatedAbove={archived}
          onLaunch={runtime.onLaunch}
        />
      ) : null}

      {/* Project-level, not per-card: a vanished character and a vanished outfit are one problem. */}
      {runtime?.creative.resourceIssues.map((issue) => (
        <StatusNotice key={issue.kind} tone="warning" title={issue.historicalLabel} role="status">
          <p>{issue.message}</p>
          <Button
            size="small"
            variant="secondary"
            onClick={() => runtime.onChooseAnother(issue.kind)}
          >
            Choose another
          </Button>
        </StatusNotice>
      ))}

      {localRender ? (
        <StatusNotice
          title={localRender.notice.title}
          tone={localRender.notice.tone}
          role={localRender.notice.role}
        >
          {localRender.message}
        </StatusNotice>
      ) : null}

      <ProjectWorkingMediaSection
        current={current}
        session={session}
        archived={archived}
        {...(onWorkingMediaActivityChange
          ? { onActivityChange: onWorkingMediaActivityChange }
          : {})}
      />

      {processing ? (
        <ProjectProcessingStatusPanel
          controller={processing}
          session={session}
          onOpenTask={onOpenTask}
        />
      ) : (
        <StatusNotice role="status" tone="neutral" title="Processing unavailable">
          No provider work can be submitted from this workspace.
        </StatusNotice>
      )}
    </>
  );
};
