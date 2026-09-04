import { describe, expect, it } from 'vitest';
import {
  attachProjectAssetRequestSchema,
  appendProjectRevisionRequestSchema,
  createProjectRequestSchema,
  projectConflictResponseSchema,
  projectCurrentResponseSchema,
  projectHistoryResponseSchema,
  projectSessionProposalSchema,
  projectVideoEditSpecSchema,
  projectOutputHistoryResponseSchema,
  projectOutputLinkSchema,
  projectOutputSaveResultSchema,
  projectAssetMembershipSchema,
  projectAssetsQuerySchema,
  projectAssetsResponseSchema,
  projectSourceResponseSchema,
  projectSourceUploadMetadataSchema,
  projectSnapshotSchema,
  projectStatusFactsSchema,
  projectWorkingMediaResponseSchema,
  saveProjectOutputRequestSchema,
  tombstoneProjectRequestSchema,
} from './projects';

const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const videoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const versionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const now = '2026-08-11T12:00:00.000Z';

describe('Project deletion contract', () => {
  it('requires the exact explicit tombstone confirmation', () => {
    expect(
      tombstoneProjectRequestSchema.parse({
        expectedVersion: 3,
        confirmation: 'permanent-delete',
      }),
    ).toEqual({ expectedVersion: 3, confirmation: 'permanent-delete' });
    expect(
      tombstoneProjectRequestSchema.safeParse({ expectedVersion: 3, confirmation: 'delete' })
        .success,
    ).toBe(false);
  });
});

describe('Project asset membership contracts', () => {
  it('accepts only supported non-Recipe kinds and bounded pages', () => {
    const membership = {
      id: '08707aa5-7b7f-4ce1-a48e-647370f6d3ab',
      projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
      kind: 'character' as const,
      resourceId: 'character-one',
      createdAt: now,
    };
    expect(projectAssetMembershipSchema.parse(membership)).toEqual(membership);
    expect(projectAssetsQuerySchema.parse({})).toEqual({ pageSize: 24 });
    expect(projectAssetsQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(
      projectAssetsResponseSchema.parse({
        assets: [membership],
        videoSummaries: [],
        nextCursor: null,
      }),
    ).toMatchObject({ assets: [membership] });
    expect(
      attachProjectAssetRequestSchema.safeParse({ kind: 'recipe', resourceId: 'recipe-one' })
        .success,
    ).toBe(false);
  });
});

const validSnapshot = () => ({
  schemaVersion: 2 as const,
  sourceAssetId: assetId,
  workingMedia: { kind: 'asset' as const, assetId },
  presentedMedia: {
    kind: 'saved-video-version' as const,
    savedVideoId: videoId,
    videoVersionId: versionId,
  },
  selectedCharacter: {
    characterId: 'character-one',
    characterLabel: 'Avery',
    characterRevision: now,
    variantId: 'red-jacket',
    variantLabel: 'Red jacket',
    variantRevision: now,
    referenceAssetId: assetId,
  },
  selectedOutfit: {
    outfitId: 'summer-outfit',
    outfitLabel: 'Summer outfit',
    outfitRevision: now,
    referenceAssetId: assetId,
    inputKind: 'saved-outfit' as const,
  },
  selectedVoice: {
    kind: 'saved-voice' as const,
    voiceId: 'northstar',
    voiceName: 'Northstar',
    resourceRevision: now,
    treatment: { stability: 0.5, similarity: 0.8, style: null, speakerBoost: true },
  },
  visualTreatment: {
    kind: 'character-swap' as const,
    providerId: 'fal',
    outputResolution: '720p' as const,
  },
  liveMode: null,
  creativeIntent: {
    promptId: 'prompt-one',
    promptLabel: 'Summer launch prompt',
    recipeId: 'recipe-one',
    recipeLabel: 'Avery · Red jacket',
    userIntent: 'Create a bright summer campaign launch.',
    appliedPrompt: 'A bright summer campaign launch.',
    referenceAssetId: assetId,
    resourceRevision: now,
  },
  localEdit: {
    trim: { startMs: 0, endMs: 30_000 },
    crop: { preset: 'original' as const, rectangle: { x: 0, y: 0, width: 1, height: 1 } },
    rotation: 0 as const,
    flipHorizontal: false,
    flipVertical: false,
    adjustments: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      highlights: 0,
      shadows: 0,
    },
    filter: 'original' as const,
    subtitles: [],
    audio: { level: 100, muted: false },
  },
  exportSpecification: {
    container: 'video/mp4' as const,
    aspect: '9:16' as const,
    resolution: { width: 1080, height: 1920 },
    includeAudio: true,
  },
  lastSuccessfulOutput: { savedVideoId: videoId, videoVersionId: versionId },
  workflowPhase: 'review' as const,
  createdAt: now,
  updatedAt: now,
});

describe('Project snapshot contract', () => {
  it('accepts versioned creative intent without browser or provider internals', () => {
    expect(projectSnapshotSchema.parse(validSnapshot())).toEqual(validSnapshot());
  });

  it('accepts subtitle cues, overlapping ones included, and reads an absent list as none', () => {
    const cueId = '3b8b3d3e-5f0f-4a0c-9d1c-2d9f7a1b5c6e';
    const otherId = '9c2d7f5e-1a4b-4c3d-8e2f-0b1a2c3d4e5f';
    const cues = [
      { id: cueId, text: 'Hello', startMs: 0, endMs: 1_500, placement: 'bottom' as const },
      { id: otherId, text: 'Overlapping', startMs: 1_000, endMs: 2_000, placement: 'top' as const },
    ];
    const withCues = {
      ...validSnapshot(),
      localEdit: { ...validSnapshot().localEdit, subtitles: cues },
    };
    expect(projectSnapshotSchema.parse(withCues)).toEqual(withCues);

    // A snapshot stored before subtitles existed has no list at all.
    const { subtitles, ...legacyEdit } = validSnapshot().localEdit;
    expect(subtitles).toEqual([]);
    expect(projectSnapshotSchema.parse({ ...validSnapshot(), localEdit: legacyEdit })).toEqual(
      validSnapshot(),
    );

    const accepts = (list: unknown) =>
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        localEdit: { ...validSnapshot().localEdit, subtitles: list },
      }).success;
    expect(accepts([cues[1], cues[0]])).toBe(false);
    expect(accepts([cues[0], { ...cues[1], id: cueId }])).toBe(false);
    expect(accepts([{ ...cues[0], text: '   ' }])).toBe(false);
    expect(accepts([{ ...cues[0], endMs: 0 }])).toBe(false);
    // The minimum the domain enforces is the minimum the wire accepts.
    expect(accepts([{ ...cues[0], endMs: 50 }])).toBe(false);
    expect(accepts([{ ...cues[0], endMs: 100 }])).toBe(true);
    expect(accepts([{ ...cues[0], id: 'cue-1' }])).toBe(false);
    expect(accepts([{ ...cues[0], placement: 'left' }])).toBe(false);
    const overflow = Array.from({ length: 201 }, (_, index) => ({
      ...cues[0],
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      startMs: index,
      endMs: index + 100,
    }));
    expect(accepts(overflow.slice(0, 200))).toBe(true);
    expect(accepts(overflow)).toBe(false);
  });

  it('migrates v1 snapshots explicitly without fabricating missing applied provenance', () => {
    const current = validSnapshot();
    const legacy = {
      ...current,
      schemaVersion: 1 as const,
      selectedCharacter: { characterId: 'character-one', variantId: 'red-jacket' },
      selectedOutfit: { outfitId: 'summer-outfit' },
      selectedVoice: {
        kind: 'saved-voice' as const,
        voiceId: 'northstar',
        voiceName: 'Northstar',
        treatment: current.selectedVoice.treatment,
      },
      visualTreatment: { kind: 'character-swap' as const },
      creativeIntent: {
        promptId: 'prompt-one',
        recipeId: 'recipe-one',
        userIntent: current.creativeIntent.userIntent,
      },
    };

    expect(projectSnapshotSchema.parse(legacy)).toMatchObject({
      schemaVersion: 2,
      selectedCharacter: {
        characterId: 'character-one',
        characterLabel: null,
        variantId: 'red-jacket',
        variantLabel: null,
        referenceAssetId: null,
      },
      selectedOutfit: { outfitId: 'summer-outfit', outfitLabel: null, inputKind: null },
      creativeIntent: {
        recipeId: 'recipe-one',
        recipeLabel: null,
        appliedPrompt: null,
        resourceRevision: null,
      },
    });
  });

  it('rejects missing visual selections, object URLs, unknown state, and invalid edits', () => {
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        selectedCharacter: null,
      }).success,
    ).toBe(false);
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        selectedCharacter: { characterId: 'blob:browser-state', variantId: null },
      }).success,
    ).toBe(false);
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        providerRequest: { apiKey: 'must-not-persist' },
      }).success,
    ).toBe(false);
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        localEdit: {
          ...validSnapshot().localEdit,
          trim: { startMs: 20_000, endMs: 10_000 },
        },
      }).success,
    ).toBe(false);

    const promptOnlyTryOn = {
      ...validSnapshot(),
      selectedOutfit: null,
      visualTreatment: {
        kind: 'virtual-try-on' as const,
        providerId: 'fal',
        outputResolution: '720p' as const,
        inputKind: 'prompt' as const,
        enhancePrompt: false,
      },
    };
    expect(projectSnapshotSchema.safeParse(promptOnlyTryOn).success).toBe(true);
    expect(
      projectSnapshotSchema.safeParse({
        ...promptOnlyTryOn,
        visualTreatment: { ...promptOnlyTryOn.visualTreatment, inputKind: 'saved-outfit' },
      }).success,
    ).toBe(false);
  });

  it('canonicalizes timestamps and requires explicitly current status facts', () => {
    expect(
      projectSnapshotSchema.parse({
        ...validSnapshot(),
        createdAt: '2026-08-11T12:00:00Z',
        updatedAt: '2026-08-11T12:00:00Z',
      }),
    ).toMatchObject({ createdAt: now, updatedAt: now });
    expect(
      projectStatusFactsSchema.safeParse({
        sourceStatus: 'ready',
        activeJobCount: 1,
        failedJobCount: 3,
        successfulOutputCount: 4,
      }).success,
    ).toBe(false);
    expect(
      projectStatusFactsSchema.safeParse({
        sourceStatus: 'ready',
        currentAttempt: { status: 'none' },
        validatedLastSuccessfulOutput: null,
      }).success,
    ).toBe(true);
  });

  it('keeps relationship contracts owner-free and strict', () => {
    const link = {
      projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
      savedVideoId: videoId,
      videoVersionId: versionId,
      producingRevisionId: '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d',
      producingRevisionNumber: 1,
      createdAt: now,
    };
    expect(projectOutputLinkSchema.parse(link)).toEqual(link);
    expect(projectOutputLinkSchema.safeParse({ ...link, ownerUserId: assetId }).success).toBe(
      false,
    );
  });

  it('keeps lifecycle HTTP contracts strict, owner-free, and typed for conflicts', () => {
    expect(createProjectRequestSchema.parse({ title: 'Empty Project' })).toEqual({
      title: 'Empty Project',
      campaignId: null,
    });
    expect(
      createProjectRequestSchema.safeParse({ title: 'Empty Project', ownerUserId: assetId })
        .success,
    ).toBe(false);
    expect(
      projectConflictResponseSchema.parse({
        error: { code: 'conflict', message: 'Refresh the Project.' },
        conflict: {
          kind: 'project-version',
          projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
          expectedVersion: 1,
          actualVersion: 2,
        },
      }),
    ).toMatchObject({ conflict: { kind: 'project-version', actualVersion: 2 } });
    expect(
      projectCurrentResponseSchema.safeParse({
        project: { ownerUserId: assetId },
        revision: { snapshot: validSnapshot() },
      }).success,
    ).toBe(false);
  });

  it('accepts the bounded creative semantic session proposal and rejects working-media bypass', () => {
    const snapshot = validSnapshot();
    expect(
      appendProjectRevisionRequestSchema.parse({
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        proposal: {
          workflowPhase: 'creative',
          liveMode: {
            modeId: 'local',
            captureFormat: 'landscape',
            audioSource: 'local-microphone',
          },
          selectedCharacter: snapshot.selectedCharacter,
          selectedOutfit: snapshot.selectedOutfit,
          selectedVoice: snapshot.selectedVoice,
          visualTreatment: snapshot.visualTreatment,
          creativeIntent: snapshot.creativeIntent,
          localEdit: snapshot.localEdit,
          exportSpecification: snapshot.exportSpecification,
        },
      }),
    ).toMatchObject({
      proposal: {
        workflowPhase: 'creative',
        exportSpecification: { aspect: '9:16', resolution: { width: 1_080, height: 1_920 } },
      },
    });
    expect(
      appendProjectRevisionRequestSchema.safeParse({
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        proposal: {
          workflowPhase: 'creative',
          liveMode: null,
          selectedCharacter: snapshot.selectedCharacter,
          selectedOutfit: snapshot.selectedOutfit,
          selectedVoice: snapshot.selectedVoice,
          visualTreatment: snapshot.visualTreatment,
          creativeIntent: snapshot.creativeIntent,
          localEdit: snapshot.localEdit,
          exportSpecification: null,
          workingMedia: { kind: 'asset', assetId },
        },
      }).success,
    ).toBe(false);
  });

  it('requires exact Saved Video Version lineage and a controlled Project content URL', () => {
    const response = {
      project: {
        id: '18b120ac-1578-46e3-8c3d-42307772f391',
        campaignId: null,
        title: 'Source Project',
        status: 'ready' as const,
        version: 2,
        currentRevisionId: '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d',
        currentRevisionNumber: 2,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      revision: {
        id: '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d',
        projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
        revisionNumber: 2,
        parentRevisionId: '4159225b-60f4-4f94-a3d5-08feee91a91d',
        parentRevisionNumber: 1,
        snapshot: {
          ...validSnapshot(),
          workingMedia: {
            kind: 'saved-video-version' as const,
            savedVideoId: videoId,
            videoVersionId: versionId,
          },
          presentedMedia: {
            kind: 'saved-video-version' as const,
            savedVideoId: videoId,
            videoVersionId: versionId,
          },
        },
        authorKind: 'user' as const,
        source: 'user-edit' as const,
        createdAt: now,
      },
      source: {
        kind: 'saved-video-version' as const,
        savedVideoId: videoId,
        videoVersionId: versionId,
        mimeType: 'video/mp4' as const,
        filename: 'source.mp4',
        sizeBytes: 1024,
        container: 'mp4' as const,
        videoCodec: 'avc' as const,
        audioCodec: 'aac',
        durationMs: 10_000,
        width: 1920,
        height: 1080,
        hasAudio: true,
        acceptedAt: now,
        contentUrl: '/api/projects/18b120ac-1578-46e3-8c3d-42307772f391/source/content',
      },
    };
    expect(projectSourceResponseSchema.parse(response)).toEqual(response);
    expect(
      projectSourceResponseSchema.safeParse({
        ...response,
        source: { ...response.source, videoVersionId: null },
      }).success,
    ).toBe(false);
    expect(
      projectSourceResponseSchema.safeParse({
        ...response,
        source: { ...response.source, contentUrl: 'https://storage.example/secret' },
      }).success,
    ).toBe(false);
    expect(
      projectSourceUploadMetadataSchema.safeParse({
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        kind: 'uploaded',
        filename: 'source.mp4',
        saveTargetVideoId: videoId,
      }).success,
    ).toBe(false);
  });

  it('keeps an earlier adoption current across later semantic Project revisions', () => {
    const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
    const adoptedRevisionId = '80eb98cb-0dd4-4aac-8507-084789045d71';
    const currentRevisionId = '66517242-ccf5-4fa5-bcee-5831039119c9';
    const snapshot = {
      ...validSnapshot(),
      workingMedia: { kind: 'asset' as const, assetId },
      presentedMedia: { kind: 'asset' as const, assetId },
    };
    const response = {
      project: {
        id: projectId,
        campaignId: null,
        title: 'Current working media',
        status: 'ready' as const,
        version: 4,
        currentRevisionId,
        currentRevisionNumber: 4,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      revision: {
        id: currentRevisionId,
        projectId,
        revisionNumber: 4,
        parentRevisionId: adoptedRevisionId,
        parentRevisionNumber: 3,
        snapshot,
        authorKind: 'user' as const,
        source: 'user-edit' as const,
        createdAt: now,
      },
      isCurrent: true,
      media: {
        kind: 'local-render' as const,
        reference: { kind: 'asset' as const, assetId },
        assetId,
        savedVideoId: null,
        videoVersionId: null,
        mimeType: 'video/mp4' as const,
        filename: 'working.mp4',
        sizeBytes: 1_024,
        checksumSha256: 'a'.repeat(64),
        container: 'mp4' as const,
        videoCodec: 'avc' as const,
        audioCodec: 'aac',
        durationMs: 10_000,
        width: 1_280,
        height: 720,
        hasAudio: true,
        adoptedRevisionId,
        adoptedRevisionNumber: 3,
        adoptedAt: now,
        contentUrl: `/api/projects/${projectId}/working-media/${adoptedRevisionId}/content`,
      },
    };

    expect(projectWorkingMediaResponseSchema.parse(response)).toEqual(response);
    expect(
      projectWorkingMediaResponseSchema.safeParse({ ...response, isCurrent: false }).success,
    ).toBe(false);
  });

  it('binds output intent to one explicit target and keeps producer provenance pre-save', () => {
    const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
    const producingRevisionId = '80eb98cb-0dd4-4aac-8507-084789045d71';
    const resultRevisionId = '66517242-ccf5-5fa5-bcee-5831039119c9';
    const operationId = '4a31b6c7-8a54-4878-b240-182652a34d31';
    const reference = { savedVideoId: videoId, videoVersionId: versionId };
    const snapshot = {
      ...validSnapshot(),
      workingMedia: { kind: 'saved-video-version' as const, ...reference },
      presentedMedia: { kind: 'saved-video-version' as const, ...reference },
      lastSuccessfulOutput: reference,
      workflowPhase: 'complete' as const,
    };
    const result = {
      operationId,
      project: {
        id: projectId,
        campaignId: null,
        title: 'Saved output',
        status: 'completed' as const,
        version: 3,
        currentRevisionId: resultRevisionId,
        currentRevisionNumber: 3,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      revision: {
        id: resultRevisionId,
        projectId,
        revisionNumber: 3,
        parentRevisionId: producingRevisionId,
        parentRevisionNumber: 2,
        snapshot,
        authorKind: 'user' as const,
        source: 'output-save' as const,
        createdAt: now,
      },
      output: {
        projectId,
        ...reference,
        producingRevisionId,
        producingRevisionNumber: 2,
        createdAt: now,
      },
      savedVideo: {
        id: videoId,
        title: 'Saved output',
        status: 'ready' as const,
        currentVersion: {
          id: versionId,
          videoId,
          ordinal: 1,
          origin: 'editor' as const,
          characterName: null,
          characterVariantName: null,
          sourceVersionId: null,
          mimeType: 'video/mp4' as const,
          filename: 'output.mp4',
          sizeBytes: 1_024,
          durationMs: 10_000,
          width: 1_280,
          height: 720,
          exportSpecification: null,
          createdAt: now,
        },
        sourceVideoId: null,
        versionCount: 1,
        thumbnailAvailable: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        versions: [] as unknown[],
      },
      contentUrl: `/api/projects/${projectId}/outputs/${versionId}/content`,
    };
    result.savedVideo.versions = [result.savedVideo.currentVersion];

    expect(projectOutputSaveResultSchema.parse(result)).toEqual(result);
    expect(
      projectOutputSaveResultSchema.safeParse({
        ...result,
        revision: { ...result.revision, parentRevisionNumber: 1 },
      }).success,
    ).toBe(false);
    expect(
      saveProjectOutputRequestSchema.parse({
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        media: { kind: 'asset', assetId },
        target: { kind: 'version', savedVideoId: videoId, expectedVersionId: versionId },
      }),
    ).toMatchObject({ target: { kind: 'version', expectedVersionId: versionId } });
    expect(
      saveProjectOutputRequestSchema.safeParse({
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        media: { kind: 'saved-video-version', savedVideoId: videoId, videoVersionId: versionId },
        target: { kind: 'version', savedVideoId: videoId },
      }).success,
    ).toBe(false);
    expect(
      projectHistoryResponseSchema.parse({
        revisions: [
          {
            kind: 'project-change',
            revisionId: resultRevisionId,
            revisionNumber: 3,
            parentRevisionId: producingRevisionId,
            parentRevisionNumber: 2,
            source: 'output-save',
            authorKind: 'user',
            workflowPhase: 'complete',
            outputReference: reference,
            exportSpecification: snapshot.exportSpecification,
            createdAt: now,
          },
        ],
        nextCursor: null,
      }),
    ).not.toHaveProperty('revisions.0.snapshot');
    expect(
      projectOutputHistoryResponseSchema.parse({
        outputs: [
          {
            kind: 'saved-video-version',
            output: result.output,
            savedVideo: {
              id: videoId,
              title: 'Saved output',
              libraryStatus: 'removed',
              currentVersionId: versionId,
            },
            version: result.savedVideo.currentVersion,
            referenceRevision: {
              revisionId: resultRevisionId,
              revisionNumber: 3,
              createdAt: now,
            },
            isCurrentForProject: true,
            thumbnailAvailable: true,
            contentUrl: `/api/projects/${projectId}/outputs/${versionId}/content`,
          },
        ],
        nextCursor: null,
      }),
    ).toMatchObject({ outputs: [{ savedVideo: { libraryStatus: 'removed' } }] });
  });
});

describe('projectSessionProposalSchema', () => {
  const proposal = (localEdit: unknown) => ({
    workflowPhase: 'review' as const,
    liveMode: null,
    selectedCharacter: null,
    selectedOutfit: null,
    selectedVoice: null,
    visualTreatment: { kind: 'none' as const },
    creativeIntent: {
      promptId: null,
      promptLabel: null,
      recipeId: null,
      recipeLabel: null,
      userIntent: '',
      appliedPrompt: null,
      referenceAssetId: null,
      resourceRevision: null,
    },
    localEdit,
    exportSpecification: null,
  });

  const spec = {
    trim: { startMs: 0, endMs: 30_000 },
    crop: { preset: 'original' as const, rectangle: { x: 0, y: 0, width: 1, height: 1 } },
    rotation: 0 as const,
    flipHorizontal: false,
    flipVertical: false,
    adjustments: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      highlights: 0,
      shadows: 0,
    },
    filter: 'original' as const,
    subtitles: [],
    audio: { level: 100, muted: false },
  };

  it('accepts a specification that states its cue list', () => {
    expect(projectSessionProposalSchema.parse(proposal(spec))).toMatchObject({
      localEdit: { subtitles: [] },
    });
    expect(projectSessionProposalSchema.parse(proposal(null)).localEdit).toBeNull();
  });

  /*
   * A snapshot written before subtitles existed still reads back, because the field defaults. A
   * proposal is a write: the same default let a tab running the old bundle echo the specification
   * back without the key and quietly erase stored cues, so the write is refused instead.
   */
  it('refuses a specification from a client that cannot describe cues', () => {
    const withoutCues: Record<string, unknown> = { ...spec };
    delete withoutCues['subtitles'];
    const result = projectSessionProposalSchema.safeParse(proposal(withoutCues));

    expect(result.success).toBe(false);
    expect(result.error?.issues.at(0)?.message).toMatch(/out of date/u);
  });

  it('reads a pre-audio specification back as the source as recorded, and keeps the field last', () => {
    const legacy: Record<string, unknown> = { ...spec };
    delete legacy['audio'];
    const parsed = projectVideoEditSpecSchema.parse(legacy);

    expect(parsed.audio).toEqual({ level: 100, muted: false });
    expect(Object.keys(parsed).at(-1)).toBe('audio');
  });

  it('accepts a whole percentage and a mute, and refuses a boost, a fraction or a bare level', () => {
    const parse = (audio: unknown) =>
      projectVideoEditSpecSchema.safeParse({ ...spec, audio }).success;

    expect(
      projectVideoEditSpecSchema.parse({ ...spec, audio: { level: 40, muted: true } }).audio,
    ).toEqual({ level: 40, muted: true });
    expect(parse({ level: 101, muted: false })).toBe(false);
    expect(parse({ level: 33.5, muted: false })).toBe(false);
    expect(parse({ level: 40 })).toBe(false);
  });

  it('refuses a specification from a client that cannot describe the level', () => {
    const withoutAudio: Record<string, unknown> = { ...spec };
    delete withoutAudio['audio'];
    const result = projectSessionProposalSchema.safeParse(proposal(withoutAudio));

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.at(-1))).toEqual(['audio']);
  });
});
