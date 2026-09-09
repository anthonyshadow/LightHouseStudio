import type { ProjectCurrentResponse, SaveProjectOutputRequest } from '@studio/contracts';
import {
  projectExportFilename,
  projectExportSpecificationsEqual,
  type ProjectExportSpecification,
} from '@studio/domain';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { readProjectWorkingMediaContent, uploadProjectRendition } from './projectsApi';
import { ensureCurrentCut, type CurrentCut } from './useProjectCurrentCut';
import {
  preparationMatchesBasis,
  projectOutputRenditionPreparationStore,
  type ProjectOutputRenditionMember,
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

/**
 * Whether a stored attempt was making exactly what is being asked for now.
 *
 * Compared through the domain's own equality, which counts the resolution and the audio choice and
 * not only the aspect: an operator who reopened a stopped run and changed a placement's resolution
 * is asking for different bytes, and matching on aspect alone would resume the old ones and skip
 * that member as already stored.
 */
const specificationsMatch = (
  left: readonly ProjectExportSpecification[],
  right: readonly ProjectOutputRenditionMember[],
): boolean =>
  left.length === right.length &&
  left.every((specification, index) => {
    const stored = right[index]?.specification;
    return stored !== undefined && projectExportSpecificationsEqual(specification, stored);
  });

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
  const store = useMemo(() => projectOutputRenditionPreparationStore(projectId), [projectId]);
  const attemptRef = useRef<string | null>(null);

  const produce = useCallback(
    async ({
      ownerUserId,
      latest,
      members: requested,
      variantSetId,
      signal,
    }: ProduceInput): Promise<ProjectOutputRenditionSetResult | null> => {
      const media = latest.revision.snapshot.workingMedia;
      if (media === null) {
        setStatus('settled');
        return null;
      }
      const basis = {
        expectedVersion: latest.project.version,
        expectedRevisionNumber: latest.project.currentRevisionNumber,
        media,
      };
      const stored = store.load(ownerUserId);
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
        const existing = store.load(ownerUserId);
        // Read-compare-write: a record another attempt owns is left exactly as it is. Re-read every
        // time rather than latched, so an attempt that finishes and clears its record hands the
        // slot back to one still running instead of silencing it for the rest of its run.
        if (existing !== null && existing.attemptId !== attemptId) return true;
        return store.save(ownerUserId, {
          attemptId,
          projectId,
          basis,
          variantSetId,
          members: next,
        });
      };

      setStatus('producing');
      if (!persist(current)) {
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

      for (const [index, member] of current.entries()) {
        if (signal.aborted) {
          break;
        }
        if (member.outcome === 'stored') continue;
        setActive(index);
        const at = (next: Partial<ProjectOutputRenditionMember>): void => {
          persist(
            current.map((entry, position) => (position === index ? { ...entry, ...next } : entry)),
          );
        };
        try {
          const rendered = await placementRender.render({
            media: source,
            specification: member.specification,
            source: { width: cut.width, height: cut.height, durationMs: cut.durationMs },
            hasAudio: cut.hasAudio,
            filename: cut.filename,
          });
          if (signal.aborted) {
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
          /*
           * Recorded before the stop is honoured, not after. These bytes are on the server whether
           * or not the operator has since pressed Stop, and a member left `pending` here is both
           * dropped from the save and — when nothing else stored — taken with the record that holds
           * its `operationKey`, so the retry uploads a second copy of what is already there.
           */
          at({ outcome: 'stored', assetId: uploaded.media.assetId, reason: null });
          if (signal.aborted) {
            break;
          }
        } catch (error) {
          if (signal.aborted) {
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

      /*
       * A member still pending once the loop has ended was never attempted, which only a stop can
       * cause. "Cancelled" is then read off the members rather than off a flag: a stop that landed
       * after the last member finished cancelled nothing, and the copy must not say it did.
       */
      if (signal.aborted) {
        persist(
          current.map((entry) =>
            entry.outcome === 'pending' ? { ...entry, outcome: 'cancelled' as const } : entry,
          ),
        );
      }
      const cancelled = current.some(({ outcome }) => outcome === 'cancelled');
      setActive(-1);
      setStatus('settled');
      const renditions = current.flatMap((entry) =>
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
      if (renditions.length === 0) store.remove(ownerUserId);
      return { members: current, renditions, cancelled };
    },
    [placementRender, projectId, queryClient, store],
  );

  /** Called once the save receipt exists: the receipt replays the whole request from there. */
  const clear = useCallback(
    (ownerUserId: string) => {
      // Only this attempt's own record: another tab running its own loop keeps its.
      const stored = store.load(ownerUserId);
      if (stored !== null && stored.attemptId === attemptRef.current) store.remove(ownerUserId);
      attemptRef.current = null;
    },
    [store],
  );

  return { status, members, active, produce, clear } as const;
};
