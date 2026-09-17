import type { Composition } from '@studio/domain';
import { useCallback, useRef, useState } from 'react';
import type { CompositionRenderPlan } from '../video-editor/types';
import {
  getProjectWorkingMedia,
  ProjectApiConflictError,
  uploadProjectWorkingMedia,
} from './projectsApi';
import { apiErrorMessage } from '../../adapters/api-client/apiClient';
import type { ProjectSessionPort } from './useProjectSession';
import { useStableOperationKey } from './useStableOperationKey';

export type CompositionAdoptionPhase = 'idle' | 'saving' | 'saved' | 'error';

/** The rendered arrangement, as the Project needs it to take it on. */
export interface AdoptableCompositionRender {
  readonly file: File;
  readonly plan: CompositionRenderPlan;
  /** The arrangement these bytes were rendered from, which is this adoption's identity. */
  readonly renderedFrom: Composition;
}

/**
 * Makes the arrangement's rendered file the Project's current cut.
 *
 * The same shape the single-clip editor's adoption uses — flush the session so the proposal is
 * written before the compare-and-set pair is read, upload under a key derived from what is being
 * adopted, and reconcile an answer that went missing rather than repeating the work. What differs
 * is what the bytes are: a stitched arrangement carries no single-clip edit specification, so it
 * is adopted as `stitched-render` with none, and the Project's Save step then delivers it without
 * knowing a composition exists.
 */
export const useProjectCompositionAdoption = (session: ProjectSessionPort) => {
  const operation = useStableOperationKey();
  const controllerRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<CompositionAdoptionPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const adopt = useCallback(
    async (render: AdoptableCompositionRender): Promise<boolean> => {
      if (phase === 'saving') return false;
      setPhase('saving');
      setMessage(null);
      if (!(await session.flush())) {
        setPhase('error');
        setMessage('Save or resolve this Project’s pending changes before keeping this render.');
        return false;
      }
      const current = session.getCurrent();
      if (current === null) {
        setPhase('error');
        setMessage('This Project could not be read. Nothing was changed.');
        return false;
      }
      /*
       * The arrangement itself is in the signature, so two different arrangements of one Project
       * never share a key and a retry of the same one replays rather than storing twice.
       */
      const signature = JSON.stringify({
        operation: 'adopt-composition-render',
        projectId: session.projectId,
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.project.currentRevisionNumber,
        filename: render.file.name,
        size: render.file.size,
        composition: render.renderedFrom,
      });
      const operationKey = operation.keyFor(signature);
      controllerRef.current?.abort('composition-adoption-replaced');
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        let response;
        try {
          response = await uploadProjectWorkingMedia({
            projectId: session.projectId,
            file: render.file,
            operationKey,
            expectedVersion: current.project.version,
            expectedRevisionNumber: current.project.currentRevisionNumber,
            kind: 'stitched-render',
            localEdit: null,
            signal: controller.signal,
          });
        } catch (error) {
          if (error instanceof ProjectApiConflictError) throw error;
          const reconciled = await getProjectWorkingMedia(session.projectId, controller.signal);
          /*
           * What "my upload landed" means here. The single-clip path establishes it by comparing
           * the server's edit specification with the one it sent; with none on either side that
           * comparison is vacuously true and would accept any asset-backed cut, including one
           * adopted in another tab. These are the facts the server returns about the bytes, and the
           * revision clause is the strongest of them: an adoption appends exactly one revision, so
           * this attempt's would sit at the number after the one it read.
           */
          const media = reconciled.media;
          if (
            !reconciled.isCurrent ||
            media.reference.kind !== 'asset' ||
            media.kind !== 'stitched-render' ||
            media.adoptedRevisionNumber !== current.project.currentRevisionNumber + 1 ||
            media.sizeBytes !== render.file.size ||
            media.width !== render.plan.video.target.width ||
            media.height !== render.plan.video.target.height ||
            media.hasAudio !== (render.plan.audio !== null) ||
            Math.abs(media.durationMs - render.plan.durationMs) > 500 ||
            reconciled.revision.snapshot.localEdit !== null
          ) {
            throw error;
          }
          response = reconciled;
        }
        controller.signal.throwIfAborted();
        if (!response.isCurrent) {
          throw new ProjectApiConflictError('The Project advanced while this render was kept.', {
            kind: 'revision',
            projectId: session.projectId,
            expectedRevisionNumber: response.revision.revisionNumber,
            actualRevisionNumber: response.project.currentRevisionNumber,
          });
        }
        session.acceptCurrent({ project: response.project, revision: response.revision });
        operation.reset();
        setPhase('saved');
        setMessage(null);
        return true;
      } catch (error) {
        if (controller.signal.aborted) {
          setPhase('idle');
          return false;
        }
        setPhase('error');
        setMessage(apiErrorMessage(error, 'This render could not be kept. Nothing was changed.'));
        return false;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [operation, phase, session],
  );

  const dismiss = useCallback(() => {
    setPhase('idle');
    setMessage(null);
  }, []);

  return { phase, message, adopt, dismiss } as const;
};
