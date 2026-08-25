import { useTheme } from '@emotion/react';
import type {
  ProjectAssetKindContract,
  ProjectAssetMembershipContract,
  SavedVideoDetail,
  SavedVideoSummary,
  VoiceSummary,
} from '@studio/contracts';
import type { CreativeAssetStore } from '@studio/domain';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { referenceImageContentUrl } from '../../adapters/api-client/referenceImageRoutes';
import {
  getSavedVideo,
  savedVideoContentUrl,
  savedVideoThumbnailUrl,
} from '../../adapters/api-client/savedVideosApi';
import { studioCreatePath } from '../../app/paths';
import {
  AppIcon,
  Button,
  ConfirmationDialog,
  OverlayPanel,
  SegmentedControl,
  StatusNotice,
} from '../../ui';
import { kindLabel, ProjectAssetThumbnail } from './ProjectAssetThumbnail';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import { safeProjectError } from './ProjectDialogs';
import {
  addAssetActionStyles,
  projectAssetActionsStyles,
  projectAssetFiltersStyles,
  projectAssetGridStyles,
  projectAssetItemStyles,
  projectAssetMetaStyles,
  projectAssetsEmptyStyles,
  projectAssetsHeaderStyles,
  projectAssetsOwnershipStyles,
  projectAssetsSectionStyles,
} from './ProjectAssetsSection.styles';
import { VideoPlayer } from '../video-player/VideoPlayer';
import { useProjectAssetsController } from './useProjectAssetsController';
import {
  projectAssetVideoWorkspaceError,
  useProjectAssetVideoWorkspaceLauncher,
} from './useProjectAssetVideoWorkspaceLauncher';
import type { ProjectSessionPort } from './useProjectSession';

const VoiceLibrary = lazy(() =>
  import('../voice-effects/VoiceLibrary').then((module) => ({ default: module.VoiceLibrary })),
);

type AssetFilter = ProjectAssetKindContract | 'all';
type Picker =
  Exclude<ProjectAssetKindContract, 'video'> | 'choose' | 'video-options' | 'video-existing' | null;

const FILTERS: readonly { readonly value: AssetFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Videos' },
  { value: 'character', label: 'Characters' },
  { value: 'outfit', label: 'Outfits' },
  { value: 'voice', label: 'Voices' },
];

const abbreviatedId = (value: string): string =>
  value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

// Opening an attached Video in the workspace means two materially different things depending on
// whether the Project already has a source, so the control has to say which one.
const projectWorkspaceAdoptionLabel = (projectHasSource: boolean): string =>
  projectHasSource ? 'Use as the current cut' : 'Use as the original video';

const projectWorkspaceAdoptionHint = (projectHasSource: boolean): string =>
  projectHasSource
    ? 'Loads this video as the current cut. The original video stays unchanged.'
    : 'This Project has no original video yet, so this becomes the one it works from.';

const labelForMembership = (
  membership: ProjectAssetMembershipContract,
  store: CreativeAssetStore | undefined,
  videoSummaries: ReadonlyMap<string, SavedVideoSummary>,
): {
  readonly label: string;
  readonly unavailable: boolean;
  readonly thumbnailUrl: string | null;
} => {
  if (membership.kind === 'video') {
    const video = videoSummaries.get(membership.resourceId);
    return video
      ? {
          label: video.title,
          unavailable: false,
          thumbnailUrl: video.thumbnailAvailable
            ? savedVideoThumbnailUrl(video.id, video.currentVersion.id)
            : null,
        }
      : { label: 'Video unavailable', unavailable: true, thumbnailUrl: null };
  }
  if (membership.kind === 'character') {
    const character = store?.savedCharacterPrompts.find(({ id }) => id === membership.resourceId);
    return character
      ? {
          label: character.name,
          unavailable: false,
          thumbnailUrl: character.referenceImageAssetId
            ? referenceImageContentUrl(character.referenceImageAssetId)
            : null,
        }
      : { label: 'Character unavailable', unavailable: true, thumbnailUrl: null };
  }
  if (membership.kind === 'outfit') {
    const outfit = store?.savedPrompts.find(
      ({ id, modelModeId }) => id === membership.resourceId && modelModeId === 'lucy-vton-latest',
    );
    return outfit
      ? {
          label: outfit.title,
          unavailable: false,
          thumbnailUrl: outfit.referenceImageAssetId
            ? referenceImageContentUrl(outfit.referenceImageAssetId)
            : null,
        }
      : { label: 'Outfit unavailable', unavailable: true, thumbnailUrl: null };
  }
  return {
    label: 'Saved Voice',
    unavailable: false,
    thumbnailUrl: null,
  };
};

const ProjectVideoPreview = ({
  videoId,
  opening,
  openDisabled,
  projectHasSource,
  onClose,
  onOpenInWorkspace,
  returnFocusRef,
}: {
  readonly videoId: string;
  readonly opening: boolean;
  readonly openDisabled: boolean;
  readonly projectHasSource: boolean;
  readonly onClose: () => void;
  readonly onOpenInWorkspace: (video: SavedVideoDetail) => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) => {
  const theme = useTheme();
  const [detail, setDetail] = useState<SavedVideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void getSavedVideo(videoId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(safeProjectError(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort('preview-closed');
  }, [videoId]);
  return (
    <OverlayPanel
      open
      onClose={onClose}
      title={detail?.title ?? 'Video preview'}
      description="Preview the current Version without leaving this Project."
      placement="fullscreen"
      size="wide"
      height="tall"
      centered
      bodyMode="contained"
      initialFocus="heading"
      returnFocusRef={returnFocusRef}
      footer={
        videoId && detail ? (
          <div
            css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'end', gap: theme.space.sm }}
          >
            <Button variant="quiet" onClick={onClose}>
              Back to Project
            </Button>
            <Button
              variant="primary"
              busy={opening}
              disabled={opening || openDisabled}
              title={projectWorkspaceAdoptionHint(projectHasSource)}
              onClick={() => onOpenInWorkspace(detail)}
            >
              {projectWorkspaceAdoptionLabel(projectHasSource)}
            </Button>
          </div>
        ) : null
      }
    >
      {loading ? <p role="status">Loading video…</p> : null}
      {error ? (
        <StatusNotice role="alert" tone="danger" title="Video unavailable">
          {error}
        </StatusNotice>
      ) : null}
      {detail ? (
        <div
          css={{
            height: '100%',
            minWidth: 0,
            minHeight: 0,
            display: 'grid',
            gridTemplateRows: 'minmax(0, 1fr) auto',
            gap: theme.space.sm,
          }}
        >
          <VideoPlayer
            src={savedVideoContentUrl(detail.id, detail.currentVersion.id)}
            title={detail.title}
          />
          <p css={{ margin: 0, color: theme.colors.textMuted, fontSize: theme.fontSizes.metadata }}>
            Current Version {detail.currentVersion.ordinal} · {detail.currentVersion.width}×
            {detail.currentVersion.height}
          </p>
        </div>
      ) : null}
    </OverlayPanel>
  );
};

export const ProjectAssetsSection = ({
  projectId,
  archived,
  projectHasSource,
  session,
  creativeStore,
  onCreateCharacter,
  onCreateOutfit,
}: {
  readonly projectId: string;
  readonly archived: boolean;
  readonly projectHasSource: boolean;
  readonly session: ProjectSessionPort;
  readonly creativeStore?: CreativeAssetStore;
  readonly onCreateCharacter?: (projectId: string) => void;
  readonly onCreateOutfit?: (projectId: string) => void;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [picker, setPicker] = useState<Picker>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [sourceAdoptionCandidate, setSourceAdoptionCandidate] = useState<SavedVideoSummary | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    readonly tone: 'success' | 'danger';
    readonly message: string;
  } | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const controller = useProjectAssetsController(projectId, filter);
  const videoWorkspace = useProjectAssetVideoWorkspaceLauncher(projectId, archived, session);
  const memberships = useMemo(
    () => controller.query.data?.pages.flatMap(({ assets }) => assets) ?? [],
    [controller.query.data],
  );
  const videoSummaries = useMemo(
    () =>
      new Map(
        controller.query.data?.pages
          .flatMap(({ videoSummaries: summaries }) => summaries)
          .map((video) => [video.id, video] as const) ?? [],
      ),
    [controller.query.data],
  );
  const busy = controller.attachMutation.isPending || controller.detachMutation.isPending;

  const openVideoInWorkspace = async (video: SavedVideoSummary) => {
    setNotice(null);
    try {
      await videoWorkspace.open(video);
    } catch (caught) {
      setNotice({ tone: 'danger', message: projectAssetVideoWorkspaceError(caught) });
    }
  };

  // Accepting a source changes what the whole Project is built from, so that branch is confirmed.
  // Adopting working media stays a single click because it can be replaced at any time.
  const requestVideoInWorkspace = (video: SavedVideoSummary) => {
    if (projectHasSource) {
      void openVideoInWorkspace(video);
      return;
    }
    setSourceAdoptionCandidate(video);
  };

  const attach = async (kind: ProjectAssetKindContract, resourceId: string) => {
    setNotice(null);
    try {
      const result = await controller.attachMutation.mutateAsync({ kind, resourceId });
      setPicker(null);
      setNotice({
        tone: 'success',
        message: result.created
          ? `${kindLabel(kind)} added to Project.`
          : `${kindLabel(kind)} is already in this Project.`,
      });
    } catch (caught) {
      setNotice({ tone: 'danger', message: safeProjectError(caught) });
    }
  };

  const detach = async (membership: ProjectAssetMembershipContract) => {
    setNotice(null);
    try {
      await controller.detachMutation.mutateAsync(membership.id);
      setNotice({
        tone: 'success',
        message: `${kindLabel(membership.kind)} removed from this Project.`,
      });
    } catch (caught) {
      setNotice({ tone: 'danger', message: safeProjectError(caught) });
    }
  };

  const characterItems = creativeStore?.savedCharacterPrompts ?? [];
  const outfitItems =
    creativeStore?.savedPrompts.filter(({ modelModeId }) => modelModeId === 'lucy-vton-latest') ??
    [];

  return (
    <section aria-labelledby="project-assets-heading" css={projectAssetsSectionStyles(theme)}>
      <header css={projectAssetsHeaderStyles(theme)}>
        <h2 id="project-assets-heading">Used in this Project</h2>
        {!archived ? (
          <Button
            ref={addTriggerRef}
            variant="quiet"
            css={addAssetActionStyles(theme)}
            onClick={() => setPicker('choose')}
          >
            <AppIcon name="plus" />
            Add Asset
          </Button>
        ) : (
          <span data-project-assets-read-only>Read-only while archived</span>
        )}
      </header>

      <p data-project-assets-explainer css={projectAssetsOwnershipStyles(theme)}>
        Saved items you use in this Project. None of them is its original video.
      </p>

      <div css={projectAssetFiltersStyles(theme)}>
        <SegmentedControl
          columns={FILTERS.length}
          label="Filter items used in this Project"
          value={filter}
          options={FILTERS}
          onChange={setFilter}
        />
      </div>

      {notice ? (
        <StatusNotice role={notice.tone === 'danger' ? 'alert' : 'status'} tone={notice.tone}>
          {notice.message}
        </StatusNotice>
      ) : null}
      {controller.query.isPending ? <p role="status">Loading…</p> : null}
      {controller.query.isError ? (
        <StatusNotice role="alert" tone="danger" title="This list could not be loaded">
          <p>{safeProjectError(controller.query.error)}</p>
          <Button size="small" onClick={() => void controller.query.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {!controller.query.isPending && !controller.query.isError && memberships.length === 0 ? (
        <div css={projectAssetsEmptyStyles(theme)}>
          <strong>
            {filter === 'all'
              ? 'Nothing used in this Project yet'
              : `No ${kindLabel(filter)} used in this Project`}
          </strong>
          <p>Add a saved item or create one. Adding never changes the original video.</p>
        </div>
      ) : null}
      {memberships.length > 0 ? (
        <ul aria-label="Items used in this Project" css={projectAssetGridStyles(theme)}>
          {memberships.map((membership) => {
            const resolved = labelForMembership(membership, creativeStore, videoSummaries);
            return (
              <li key={membership.id}>
                <article css={projectAssetItemStyles(theme)}>
                  <ProjectAssetThumbnail
                    kind={membership.kind}
                    label={resolved.label}
                    thumbnailUrl={resolved.thumbnailUrl}
                    unavailable={resolved.unavailable}
                  />
                  <div css={projectAssetMetaStyles(theme)}>
                    <span data-project-asset-kind>{kindLabel(membership.kind)}</span>
                    <small data-project-asset-id title={membership.resourceId}>
                      {abbreviatedId(membership.resourceId)}
                    </small>
                  </div>
                  <h3>{resolved.label}</h3>
                  {resolved.unavailable ? (
                    <StatusNotice tone="warning">
                      This item is unavailable. You can still remove it from this Project.
                    </StatusNotice>
                  ) : null}
                  {(membership.kind === 'video' && !resolved.unavailable) || !archived ? (
                    <div css={projectAssetActionsStyles(theme)}>
                      {membership.kind === 'video' && !resolved.unavailable ? (
                        <Button
                          size="small"
                          variant="primary"
                          data-project-asset-action="open"
                          busy={videoWorkspace.busyVideoId === membership.resourceId}
                          disabled={archived || videoWorkspace.busyVideoId !== null}
                          title={projectWorkspaceAdoptionHint(projectHasSource)}
                          onClick={() => {
                            const video = videoSummaries.get(membership.resourceId);
                            if (video) requestVideoInWorkspace(video);
                          }}
                        >
                          {projectWorkspaceAdoptionLabel(projectHasSource)}
                        </Button>
                      ) : null}
                      {membership.kind === 'video' && !resolved.unavailable ? (
                        <Button
                          size="small"
                          data-project-asset-action="preview"
                          onClick={(event) => {
                            previewTriggerRef.current = event.currentTarget;
                            setPreviewVideoId(membership.resourceId);
                          }}
                        >
                          Preview
                        </Button>
                      ) : null}
                      {!archived ? (
                        <Button
                          size="small"
                          variant="quiet"
                          data-project-asset-action="detach"
                          busy={controller.detachMutation.variables === membership.id}
                          disabled={busy}
                          onClick={() => void detach(membership)}
                        >
                          Remove from Project
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
      {controller.query.hasNextPage ? (
        <Button
          variant="quiet"
          busy={controller.query.isFetchingNextPage}
          onClick={() => void controller.query.fetchNextPage()}
        >
          Load more Assets
        </Button>
      ) : null}
      <p css={projectAssetsOwnershipStyles(theme)}>
        Removing an item here never deletes it or this Project’s history. It stays reusable
        everywhere else.
      </p>

      <OverlayPanel
        open={picker === 'choose'}
        onClose={() => setPicker(null)}
        title="Add Asset"
        description="Add something you already saved, or create a new video for this Project."
        placement="bottom"
        size="wide"
        returnFocusRef={addTriggerRef}
      >
        <div
          css={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
            gap: theme.space.sm,
          }}
        >
          {(['video', 'character', 'outfit', 'voice'] as const).map((kind) => (
            <Button
              key={kind}
              variant="secondary"
              onClick={() => setPicker(kind === 'video' ? 'video-options' : kind)}
            >
              {kind === 'voice' ? 'Add Voice' : `Add ${kindLabel(kind)}`}
            </Button>
          ))}
        </div>
      </OverlayPanel>

      <ProjectSavedVideoPicker
        open={picker === 'video-existing'}
        busy={busy}
        returnFocusRef={addTriggerRef}
        onClose={() => setPicker(null)}
        onSelect={(video) => void attach('video', video.id)}
        title="Import a saved video"
        description="Adds this video to the Project without replacing its original video."
        listLabel="Videos available to attach to this Project"
      />
      <OverlayPanel
        open={picker === 'character' || picker === 'outfit'}
        onClose={() => setPicker(null)}
        title={picker === 'character' ? 'Add Character' : 'Add Outfit'}
        description="Choose one you already saved, or create a new one in Studio."
        placement="bottom"
        size="wide"
        bodyMode="scroll"
        returnFocusRef={addTriggerRef}
        headerActions={
          picker === 'character' && onCreateCharacter ? (
            <Button onClick={() => onCreateCharacter(projectId)}>Create Character</Button>
          ) : picker === 'outfit' && onCreateOutfit ? (
            <Button onClick={() => onCreateOutfit(projectId)}>Create Outfit</Button>
          ) : null
        }
      >
        <div css={{ display: 'grid', gap: theme.space.sm }}>
          {(picker === 'character' ? characterItems : outfitItems).map((item) => (
            <Button
              key={item.id}
              variant="secondary"
              disabled={busy}
              onClick={() => void attach(picker as 'character' | 'outfit', item.id)}
            >
              {'name' in item ? item.name : item.title}
            </Button>
          ))}
          {(picker === 'character' ? characterItems : outfitItems).length === 0 ? (
            <StatusNotice tone="neutral">
              No saved {picker === 'character' ? 'Characters' : 'Outfits'} are available.
            </StatusNotice>
          ) : null}
        </div>
      </OverlayPanel>
      <OverlayPanel
        open={picker === 'voice'}
        onClose={() => setPicker(null)}
        title="Add Voice"
        description="Browse or save a Voice, then select it to attach it to this Project."
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        returnFocusRef={addTriggerRef}
      >
        {picker === 'voice' ? (
          <Suspense fallback={<p role="status">Loading Voices…</p>}>
            <VoiceLibrary
              disabled={busy}
              onSelect={(voice: VoiceSummary) => void attach('voice', voice.voiceId)}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={picker === 'video-options'}
        onClose={() => setPicker(null)}
        title="Create Video for Project"
        description="Recording or uploading stays separate until you save the video to Assets."
        placement="right"
        returnFocusRef={addTriggerRef}
      >
        <Button onClick={() => setPicker('video-existing')}>Import a saved video</Button>
        <Button onClick={() => void navigate(studioCreatePath({ intent: 'record', projectId }))}>
          Record Video
        </Button>
        <Button onClick={() => void navigate(studioCreatePath({ intent: 'upload', projectId }))}>
          Upload Video
        </Button>
      </OverlayPanel>

      {previewVideoId !== null ? (
        <ProjectVideoPreview
          key={previewVideoId}
          videoId={previewVideoId}
          opening={videoWorkspace.busyVideoId === previewVideoId}
          openDisabled={archived || videoWorkspace.busyVideoId !== null}
          projectHasSource={projectHasSource}
          onClose={() => setPreviewVideoId(null)}
          onOpenInWorkspace={(video) => {
            setPreviewVideoId(null);
            requestVideoInWorkspace(video);
          }}
          returnFocusRef={previewTriggerRef}
        />
      ) : null}

      <ConfirmationDialog
        open={sourceAdoptionCandidate !== null}
        title="Make this the original video?"
        description={
          sourceAdoptionCandidate
            ? `“${sourceAdoptionCandidate.title}” becomes the video this Project is built from. You can remove it later from the workspace and choose another. The video itself stays in your library.`
            : ''
        }
        confirmLabel="Use as the original video"
        cancelLabel="Keep this Project empty"
        busy={videoWorkspace.busyVideoId !== null}
        returnFocusRef={previewTriggerRef}
        onCancel={() => setSourceAdoptionCandidate(null)}
        onConfirm={() => {
          const candidate = sourceAdoptionCandidate;
          if (!candidate) return;
          setSourceAdoptionCandidate(null);
          void openVideoInWorkspace(candidate);
        }}
      />
    </section>
  );
};
