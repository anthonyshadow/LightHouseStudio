import type { ProjectCurrentResponse, SaveProjectOutputRequest } from '@studio/contracts';
import { projectExportFilename, type ProjectExportSpecification } from '@studio/domain';
import { useCallback, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { readProjectWorkingMediaContent, uploadProjectRendition } from './projectsApi';
import { ensureCurrentCut, type CurrentCut } from './useProjectCurrentCut';
import {
  preparationMatchesBasis,
  projectOutputRenditionPreparationStore,
  type ProjectOutputRenditionMember,
  type ProjectOutputRenditionPreparation,
} from './projectOutputRenditionPreparationStorage';
import type { useExportPlacementRender } from '../export-placements';

export type ProjectOutputRenditionSetStatus = 'idle' | 'producing' | 'settled';

export interface ProjectOutputRenditionSetResult {
  /** Every placement asked for, in the order it was attempted, with what became of it. */
  readonly members: readonly ProjectOutputRenditionMember[];
  /** What the save request should carry: the placements whose bytes are stored. */
  readonly renditions: SaveProjectOutputRequest['renditions'];
  /** True when the operator stopped the run, so the copy can say what was and was not made. */
  readonly cancelled: boolean;
}

interface ProduceInput {
  readonly ownerUserId: string;
  readonly latest: ProjectCurrentResponse;
  /** The placements to make, chosen placement first so the one the revision chose fails fast. */
  readonly members: readonly ProjectExportSpecification[];
  readonly variantSetId: string | null;
  readonly signal: AbortSignal;
}

const specificationsMatch = (
  left: readonly ProjectExportSpecification[],
  right: readonly ProjectOutputRenditionMember[],
): boolean =>
  left.length === right.length &&
  left.every((specification, index) => specification.aspect === right[index]?.specification.aspect);

/**
 * Produces every placement of one save, one at a time, from a single read of the cut.
 *
 * Strictly serial by design: render, upload, let the bytes go, then start the next. Peak memory is
 * the source plus one output whether the operator asked for one placement or four — overlapping an
 * upload with the next render would double it for no gain the operator can see, because the render
 * is the slow half either way.
 *
 * A member that fails does not end the run. What was made is still worth saving, and the operator
 * is told which placements are missing and offered them again; stopping at the first failure would
 * throw away minutes of finished work. Every member's upload key is minted and persisted before
 * the first render, so a reload mid-run resumes without re-rendering or duplicating a finished one.
 */
export const useProjectOutputRenditionSet = (
  projectId: string,
  placementRender: ReturnType<typeof useExportPlacementRender>,
  queryClient: QueryClient,
) => {
  const [status, setStatus] = useState<ProjectOutputRenditionSetStatus>('idle');
  const [members, setMembers] = useState<readonly ProjectOutputRenditionMember[]>([]);
  const [active, setActive] = useState<number>(-1);
  const store = useRef(projectOutputRenditionPreparationStore(projectId));
  const attemptRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setMembers([]);
    setActive(-1);
  }, []);

  /** The record this attempt owns, or nothing — another tab's record is never touched. */
  const owned = useCallback((ownerUserId: string): ProjectOutputRenditionPreparation | null => {
    const stored = store.current.load(ownerUserId);
    return stored !== null && stored.attemptId === attemptRef.current ? stored : null;
  }, []);

  const produce = useCallback(
    async ({
      ownerUserId,
      latest,
      members: requested,
      variantSetId,
      signal,
    }: ProduceInput): Promise<ProjectOutputRenditionSetResult | null> => {
      const basis = {
        expectedVersion: latest.project.version,
        expectedRevisionNumber: latest.project.currentRevisionNumber,
        media: latest.revision.snapshot.workingMedia,
      };
      const stored = store.current.load(ownerUserId);
      /*
       * An interrupted attempt for exactly this work is resumed rather than restarted: its members
       * keep the keys their uploads used, so a finished one is skipped and a half-finished one
       * replays onto the same asset instead of storing a second copy.
       */
      const resumable =
        stored !== null &&
        preparationMatchesBasis(stored, basis) &&
        stored.variantSetId === variantSetId &&
        specificationsMatch(requested, stored.members);
      const attemptId = resumable ? stored.attemptId : crypto.randomUUID();
      attemptRef.current = attemptId;
      let current: readonly ProjectOutputRenditionMember[] = resumable
        ? stored.members
        : requested.map((specification) => ({
            specification,
            operationKey: crypto.randomUUID(),
            outcome: 'pending' as const,
            assetId: null,
            reason: null,
          }));

      const persist = (next: readonly ProjectOutputRenditionMember[]): boolean => {
        current = next;
        setMembers(next);
        const existing = store.current.load(ownerUserId);
        // Read-compare-write: a record another attempt owns is left exactly as it is.
        if (existing !== null && existing.attemptId !== attemptId) return true;
        return store.current.save(ownerUserId, {
          attemptId,
          projectId,
          basis: { ...basis, media: basis.media! },
          variantSetId,
          members: next,
        });
      };

      setStatus('producing');
      if (basis.media === null || !persist(current)) {
        setStatus('settled');
        return null;
      }

      let cut: CurrentCut;
      let source: Blob;
      try {
        // Read once and held for the whole run: every member re-frames the same cut, and reading
        // it per member would cost one download of the video per placement.
        cut = await ensureCurrentCut(queryClient, latest);
        source = await readProjectWorkingMediaContent({
          contentUrl: cut.contentUrl,
          mimeType: cut.mimeType,
          signal,
        });
      } catch (readError) {
        setStatus('settled');
        if (signal.aborted) return null;
        throw readError;
      }

      let cancelled = false;
      for (const [index, member] of current.entries()) {
        if (signal.aborted) {
          cancelled = true;
          break;
        }
        if (member.outcome === 'stored') continue;
        setActive(index);
        const at = (next: Partial<ProjectOutputRenditionMember>) =>
          persist(
            current.map((entry, position) => (position === index ? { ...entry, ...next } : entry)),
          );
        try {
          const rendered = await placementRender.render({
            media: source,
            specification: member.specification,
            source: { width: cut.width, height: cut.height, durationMs: cut.durationMs },
            hasAudio: cut.hasAudio,
            filename: cut.filename,
          });
          if (signal.aborted) {
            cancelled = true;
            break;
          }
          if (rendered === null) {
            // Read through the hook rather than off its state: this loop stays inside one render
            // for every member, so the state it can see is whatever it was when the loop began.
            at({ outcome: 'failed', reason: placementRender.lastFailure() });
            continue;
          }
          const uploaded = await uploadProjectRendition({
            projectId,
            file: new File(
              [rendered.blob],
              projectExportFilename(cut.filename, member.specification),
              { type: rendered.blob.type },
            ),
            operationKey: member.operationKey,
            specification: member.specification,
            signal,
          });
          if (signal.aborted) {
            cancelled = true;
            break;
          }
          at({ outcome: 'stored', assetId: uploaded.media.assetId, reason: null });
        } catch (error) {
          if (signal.aborted) {
            cancelled = true;
            break;
          }
          at({
            outcome: 'failed',
            reason:
              error instanceof ApiClientError
                ? error.message
                : 'This placement could not be stored.',
          });
        }
      }

      if (cancelled) {
        persist(
          current.map((entry) =>
            entry.outcome === 'pending' ? { ...entry, outcome: 'cancelled' as const } : entry,
          ),
        );
      }
      setActive(-1);
      setStatus('settled');
      const settled = current;
      const renditions = settled.flatMap((entry) =>
        entry.outcome === 'stored' && entry.assetId !== null
          ? [
              {
                media: { kind: 'asset' as const, assetId: entry.assetId },
                specification: entry.specification,
              },
            ]
          : [],
      );
      // Nothing was made and nothing landed: there is no interrupted attempt worth resuming.
      if (renditions.length === 0) store.current.remove(ownerUserId);
      return { members: settled, renditions, cancelled };
    },
    [placementRender, projectId, queryClient],
  );

  /** Called once the save receipt exists: the receipt replays the whole request from there. */
  const clear = useCallback(
    (ownerUserId: string) => {
      if (owned(ownerUserId) !== null) store.current.remove(ownerUserId);
      attemptRef.current = null;
    },
    [owned],
  );

  return { status, members, active, produce, reset, clear } as const;
};
