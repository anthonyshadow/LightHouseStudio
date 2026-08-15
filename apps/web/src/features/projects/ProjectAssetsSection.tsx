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
import { studioCreatePath, studioVideoPath } from '../../app/paths';
import { AppIcon, Button, OverlayPanel, StatusNotice } from '../../ui';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import { safeProjectError } from './ProjectDialogs';
import {
  addAssetActionStyles,
  assetThumbnailFallbackStyles,
  assetThumbnailPlayStyles,
  assetThumbnailStyles,
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
import { ProjectVideoPreviewPlayer } from './ProjectVideoPreviewPlayer';
import { useProjectAssetsController } from './useProjectAssetsController';

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

const kindLabel = (kind: ProjectAssetKindContract): string =>
  kind === 'video' ? 'Video' : kind.charAt(0).toUpperCase() + kind.slice(1);

const abbreviatedId = (value: string): string =>
  value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

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
          thumbnailUrl: video.thumbnailAvailable ? savedVideoThumbnailUrl(video.id) : null,
        }
      : { label: 'Saved Video unavailable', unavailable: true, thumbnailUrl: null };
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

const AssetKindIcon = ({ kind }: { readonly kind: ProjectAssetKindContract }) => {
  if (kind === 'video') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === 'character') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" />
      </svg>
    );
  }
  if (kind === 'outfit') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="m8.5 3-5 2.5L5 10l3-1.2V21h8V8.8l3 1.2 1.5-4.5-5-2.5a4 4 0 0 1-7 0Z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
    </svg>
  );
};

const AssetThumbnail = ({
  kind,
  label,
  thumbnailUrl,
  unavailable,
}: {
  readonly kind: ProjectAssetKindContract;
  readonly label: string;
  readonly thumbnailUrl: string | null;
  readonly unavailable: boolean;
}) => {
  const theme = useTheme();
  const [brokenThumbnailUrl, setBrokenThumbnailUrl] = useState<string | null>(null);
  const showThumbnail = thumbnailUrl !== null && brokenThumbnailUrl !== thumbnailUrl;

  return (
    <div
      role="img"
      aria-label={
        showThumbnail ? `Thumbnail for ${label}` : `${kindLabel(kind)} visual for ${label}`
      }
      css={assetThumbnailStyles(theme, unavailable)}
    >
      {showThumbnail ? (
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          css={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setBrokenThumbnailUrl(thumbnailUrl)}
        />
      ) : (
        <span aria-hidden="true" css={assetThumbnailFallbackStyles(theme)}>
          <AssetKindIcon kind={kind} />
          <small>{unavailable ? 'Asset unavailable' : `${kindLabel(kind)} preview`}</small>
        </span>
      )}
      {kind === 'video' && !unavailable && showThumbnail ? (
        <span aria-hidden="true" css={assetThumbnailPlayStyles(theme)}>
          <AssetKindIcon kind="video" />
        </span>
      ) : null}
    </div>
  );
};

const ProjectVideoPreview = ({
  projectId,
  videoId,
  onClose,
  returnFocusRef,
}: {
  readonly projectId: string;
  readonly videoId: string;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
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
      title={detail?.title ?? 'Saved Video preview'}
      description="Preview the current Saved Video Version without leaving this Project."
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
              onClick={() =>
                void navigate(studioVideoPath(videoId), {
                  state: { fromProjectId: projectId },
                })
              }
            >
              Open in Studio
            </Button>
          </div>
        ) : null
      }
    >
      {loading ? <p role="status">Loading Saved Video…</p> : null}
      {error ? (
        <StatusNotice role="alert" tone="danger" title="Saved Video unavailable">
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
          <ProjectVideoPreviewPlayer
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
  creativeStore,
  onCreateCharacter,
  onCreateOutfit,
}: {
  readonly projectId: string;
  readonly archived: boolean;
  readonly creativeStore?: CreativeAssetStore;
  readonly onCreateCharacter?: (projectId: string) => void;
  readonly onCreateOutfit?: (projectId: string) => void;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [picker, setPicker] = useState<Picker>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    readonly tone: 'success' | 'danger';
    readonly message: string;
  } | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const controller = useProjectAssetsController(projectId, filter);
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

  const openVideoInStudio = (videoId: string) =>
    void navigate(studioVideoPath(videoId), {
      state: { fromProjectId: projectId },
    });

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
        message: `${kindLabel(membership.kind)} detached from Project.`,
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
        <h2 id="project-assets-heading">Project Assets</h2>
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

      <div role="group" aria-label="Filter Project Assets" css={projectAssetFiltersStyles(theme)}>
        {FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            size="small"
            variant="quiet"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {notice ? (
        <StatusNotice role={notice.tone === 'danger' ? 'alert' : 'status'} tone={notice.tone}>
          {notice.message}
        </StatusNotice>
      ) : null}
      {controller.query.isPending ? <p role="status">Loading Project Assets…</p> : null}
      {controller.query.isError ? (
        <StatusNotice role="alert" tone="danger" title="Project Assets unavailable">
          <p>{safeProjectError(controller.query.error)}</p>
          <Button size="small" onClick={() => void controller.query.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {!controller.query.isPending && !controller.query.isError && memberships.length === 0 ? (
        <div css={projectAssetsEmptyStyles(theme)}>
          <strong>No {filter === 'all' ? '' : `${kindLabel(filter)} `}Assets attached</strong>
          <p>Add an existing Asset or create one while keeping the Project source unchanged.</p>
        </div>
      ) : null}
      {memberships.length > 0 ? (
        <ul aria-label="Assets attached to this Project" css={projectAssetGridStyles(theme)}>
          {memberships.map((membership) => {
            const resolved = labelForMembership(membership, creativeStore, videoSummaries);
            return (
              <li key={membership.id}>
                <article css={projectAssetItemStyles(theme)}>
                  <AssetThumbnail
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
                      The underlying Asset is unavailable. This association can still be detached.
                    </StatusNotice>
                  ) : null}
                  {(membership.kind === 'video' && !resolved.unavailable) || !archived ? (
                    <div css={projectAssetActionsStyles(theme)}>
                      {membership.kind === 'video' && !resolved.unavailable ? (
                        <Button
                          size="small"
                          variant="primary"
                          data-project-asset-action="open"
                          onClick={() => openVideoInStudio(membership.resourceId)}
                        >
                          Open in Studio
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
                          Detach from Project
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
        Detaching never deletes an Asset or Project history. Assets remain reusable everywhere they
        are available.
      </p>

      <OverlayPanel
        open={picker === 'choose'}
        onClose={() => setPicker(null)}
        title="Add Asset"
        description="Attach an existing Asset, or start a Project-aware Video creation flow."
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
        title="Import Saved Video"
        description="Attach the current Saved Video without replacing this Project's immutable source."
        listLabel="Saved Videos available to attach to this Project"
      />
      <OverlayPanel
        open={picker === 'character' || picker === 'outfit'}
        onClose={() => setPicker(null)}
        title={picker === 'character' ? 'Add Character' : 'Add Outfit'}
        description="Choose an existing owner-scoped Asset. Creating a new one uses the same Studio builder."
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
        description="Recording or uploading stays standalone until you explicitly save the Video to Assets."
        placement="right"
        returnFocusRef={addTriggerRef}
      >
        <Button onClick={() => setPicker('video-existing')}>Import Saved Video</Button>
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
          projectId={projectId}
          videoId={previewVideoId}
          onClose={() => setPreviewVideoId(null)}
          returnFocusRef={previewTriggerRef}
        />
      ) : null}
    </section>
  );
};
