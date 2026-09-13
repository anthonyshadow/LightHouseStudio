import { it } from '@fast-check/vitest';
import fc from 'fast-check';
import { expect } from 'vitest';
import {
  migrateProjectSnapshotV2,
  PROJECT_SNAPSHOT_SCHEMA_VERSION,
  projectSnapshotSchema,
} from './projects';

/*
 * The read maps are the one place a stored revision can be misread. These runs generate v1 and v2
 * snapshots across the fields the maps touch and hold each map to three promises: the result is a
 * valid v3 snapshot, nothing that was there is lost, and nothing that was not there is invented.
 *
 * The arms are generated deliberately rather than left to chance. Over the two fixed seeds below,
 * 200 runs each, the samples carry ~100 Projects with nothing configured (the empty-to-null fold),
 * 3 and 5 saved-outfit try-ons, and both Variant shapes the cross-field rule allows. Composed of
 * independent nullable fields alone, "nothing configured" would need twelve of them to land null
 * at once and the fold would never be exercised at all.
 */

const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const videoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const versionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const timestamp = fc
  .integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) })
  .map((value) => new Date(value).toISOString());
const durableId = fc.stringMatching(/^[a-z][a-z0-9-]{2,30}$/u);
const label = fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,40}[A-Za-z]$/u);
const mediaReference = fc.constantFrom(
  null,
  { kind: 'asset' as const, assetId },
  { kind: 'saved-video-version' as const, savedVideoId: videoId, videoVersionId: versionId },
);

/**
 * The Variant arms the cross-field rule allows: no Variant at all, a Variant whose applied values
 * were recorded, and a Variant recorded without them (a v1 row read forward). A label without an
 * id, or one of the pair alone, is what the rule refuses and what no generator should produce.
 */
const variantArm = fc.oneof(
  fc.constant({ variantId: null, variantLabel: null, variantRevision: null }),
  fc.record({ variantId: durableId, variantLabel: label, variantRevision: timestamp }),
  fc.record({
    variantId: durableId,
    variantLabel: fc.constant(null),
    variantRevision: fc.constant(null),
  }),
);

const characterSelection = fc
  .record({
    characterId: durableId,
    characterLabel: fc.option(label, { nil: null }),
    characterRevision: fc.option(timestamp, { nil: null }),
    variant: variantArm,
    referenceAssetId: fc.option(fc.constant(assetId), { nil: null }),
  })
  .map(({ variant, ...rest }) => ({ ...rest, ...variant }));
const outfitSelection = fc.record({
  outfitId: durableId,
  outfitLabel: fc.option(label, { nil: null }),
  outfitRevision: fc.option(timestamp, { nil: null }),
  referenceAssetId: fc.option(fc.constant(assetId), { nil: null }),
  inputKind: fc.constantFrom(null, 'prompt' as const, 'saved-outfit' as const),
});
const voiceSelection = fc.oneof(
  fc.record({
    kind: fc.constant('local-effect' as const),
    effectId: fc.constantFrom('warm-studio' as const, 'clear-presenter' as const, 'robot' as const),
    effectRevision: fc.constantFrom(null, 'builtin-v1' as const),
  }),
  fc.record({
    kind: fc.constant('saved-voice' as const),
    voiceId: durableId,
    voiceName: label,
    resourceRevision: fc.option(timestamp, { nil: null }),
    treatment: fc.record({
      stability: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
      similarity: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
      style: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
      speakerBoost: fc.option(fc.boolean(), { nil: null }),
    }),
  }),
);
const creativeIntent = fc.record({
  promptId: fc.option(durableId, { nil: null }),
  promptLabel: fc.option(label, { nil: null }),
  recipeId: fc.option(durableId, { nil: null }),
  recipeLabel: fc.option(label, { nil: null }),
  userIntent: fc.string({ maxLength: 60 }),
  appliedPrompt: fc.option(fc.string({ minLength: 1, maxLength: 60 }), { nil: null }),
  referenceAssetId: fc.option(fc.constant(assetId), { nil: null }),
  resourceRevision: fc.option(timestamp, { nil: null }),
});

/** A v2 snapshot whose cross-field rules hold: a treatment always names what it needs. */
const snapshotV2 = fc
  .record({
    sourceAssetId: fc.option(fc.constant(assetId), { nil: null }),
    workingMedia: mediaReference,
    presentedMedia: mediaReference,
    selectedCharacter: fc.option(characterSelection, { nil: null }),
    selectedOutfit: fc.option(outfitSelection, { nil: null }),
    selectedVoice: fc.option(voiceSelection, { nil: null }),
    treatmentKind: fc.constantFrom('none', 'character-swap', 'virtual-try-on'),
    liveMode: fc.option(
      fc.record({
        modeId: fc.constantFrom('local', 'lucy-latest'),
        captureFormat: fc.constantFrom('landscape' as const, 'portrait' as const),
        audioSource: fc.constantFrom('local-microphone' as const, 'model-output' as const),
      }),
      { nil: null },
    ),
    creativeIntent,
    lastSuccessfulOutput: fc.option(
      fc.constant({ savedVideoId: videoId, videoVersionId: versionId }),
      { nil: null },
    ),
    workflowPhase: fc.constantFrom(
      'source' as const,
      'creative' as const,
      'review' as const,
      'complete' as const,
    ),
    createdAt: timestamp,
    laterBy: fc.integer({ min: 0, max: 86_400_000 }),
    tryOnInput: fc.constantFrom(
      null,
      'prompt' as const,
      'reference-image' as const,
      'saved-outfit' as const,
    ),
    /*
     * Whether this Project configured any AI at all. A first-class arm, not something twelve
     * independent nullable fields are left to land on together: "nothing configured" is the input
     * class the empty-to-null fold exists for, and it would otherwise never be generated.
     */
    configured: fc.boolean(),
  })
  .map(({ treatmentKind, laterBy, tryOnInput, configured, ...fields }) => {
    const selections = configured
      ? fields
      : {
          ...fields,
          selectedCharacter: null,
          selectedOutfit: null,
          selectedVoice: null,
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
        };
    const kind = configured ? treatmentKind : 'none';
    return {
      schemaVersion: 2 as const,
      ...selections,
      visualTreatment:
        kind === 'character-swap' && selections.selectedCharacter !== null
          ? { kind: 'character-swap' as const, providerId: null, outputResolution: null }
          : kind === 'virtual-try-on'
            ? {
                kind: 'virtual-try-on' as const,
                providerId: null,
                outputResolution: null,
                // Saved-outfit try-on is exactly the arm that needs an Outfit, so it is offered
                // only when there is one: the shape the rule refuses is not a shape any stored
                // row can have.
                inputKind:
                  tryOnInput === 'saved-outfit' && selections.selectedOutfit === null
                    ? ('prompt' as const)
                    : tryOnInput,
                enhancePrompt: null,
              }
            : { kind: 'none' as const },
      localEdit: null,
      exportSpecification: null,
      updatedAt: new Date(Date.parse(fields.createdAt) + laterBy).toISOString(),
    };
  });

const TRANSFORM_KEYS = [
  'selectedCharacter',
  'selectedOutfit',
  'selectedVoice',
  'visualTreatment',
  'creativeIntent',
] as const;

it.prop([snapshotV2], { seed: 0x534e4150, numRuns: 200 })(
  'reads every v2 snapshot as a valid v3 one, regrouping without loss or invention',
  (previous) => {
    const migrated = projectSnapshotSchema.parse(previous);

    expect(migrated.schemaVersion).toBe(PROJECT_SNAPSHOT_SCHEMA_VERSION);
    expect(migrated.composition).toBeNull();
    // The map is a function of the union: parsing the row and calling it directly agree.
    expect(migrateProjectSnapshotV2(previous)).toEqual(migrated);
    // Idempotent: a v3 row reads back as itself.
    expect(projectSnapshotSchema.parse(migrated)).toEqual(migrated);
    // Everything outside the five fields is carried untouched.
    for (const key of [
      'sourceAssetId',
      'workingMedia',
      'presentedMedia',
      'liveMode',
      'localEdit',
      'exportSpecification',
      'lastSuccessfulOutput',
      'workflowPhase',
      'createdAt',
      'updatedAt',
    ] as const) {
      expect(migrated[key]).toEqual(previous[key]);
    }
    for (const key of TRANSFORM_KEYS) expect(migrated).not.toHaveProperty(key);
    // The five fields survive under `transform`, in the contract's order — or, when every one of
    // them says nothing, as `null`.
    const configured =
      previous.selectedCharacter !== null ||
      previous.selectedOutfit !== null ||
      previous.selectedVoice !== null ||
      previous.visualTreatment.kind !== 'none' ||
      Object.values(previous.creativeIntent).some((value) => value !== null && value !== '');
    if (configured) {
      expect(Object.keys(migrated.transform!)).toEqual([...TRANSFORM_KEYS]);
      for (const key of TRANSFORM_KEYS) expect(migrated.transform![key]).toEqual(previous[key]);
    } else {
      expect(migrated.transform).toBeNull();
    }
  },
);

it.prop([snapshotV2], { seed: 0x4c454731, numRuns: 200 })(
  'reads every v1 snapshot through v2 to v3, mapping unavailable provenance to null',
  (previous) => {
    const legacy = {
      ...previous,
      schemaVersion: 1 as const,
      selectedCharacter:
        previous.selectedCharacter === null
          ? null
          : { characterId: previous.selectedCharacter.characterId, variantId: null },
      selectedOutfit:
        previous.selectedOutfit === null ? null : { outfitId: previous.selectedOutfit.outfitId },
      selectedVoice:
        previous.selectedVoice === null
          ? null
          : previous.selectedVoice.kind === 'local-effect'
            ? { kind: 'local-effect' as const, effectId: previous.selectedVoice.effectId }
            : {
                kind: 'saved-voice' as const,
                voiceId: previous.selectedVoice.voiceId,
                voiceName: previous.selectedVoice.voiceName,
                treatment: previous.selectedVoice.treatment,
              },
      visualTreatment: { kind: previous.visualTreatment.kind },
      creativeIntent: {
        promptId: previous.creativeIntent.promptId,
        recipeId: previous.creativeIntent.recipeId,
        userIntent: previous.creativeIntent.userIntent,
      },
    };

    const migrated = projectSnapshotSchema.parse(legacy);
    expect(migrated.schemaVersion).toBe(PROJECT_SNAPSHOT_SCHEMA_VERSION);
    expect(migrated.composition).toBeNull();
    expect(projectSnapshotSchema.parse(migrated)).toEqual(migrated);
    const transform = migrated.transform;
    if (transform === null) {
      expect(legacy.selectedCharacter).toBeNull();
      expect(legacy.selectedOutfit).toBeNull();
      expect(legacy.selectedVoice).toBeNull();
      expect(legacy.visualTreatment.kind).toBe('none');
      expect(legacy.creativeIntent).toEqual({ promptId: null, recipeId: null, userIntent: '' });
      return;
    }
    // What v1 held is kept exactly; what it never held is null, never a guess.
    expect(transform.selectedCharacter?.characterId).toBe(legacy.selectedCharacter?.characterId);
    expect(transform.selectedCharacter?.characterLabel ?? null).toBeNull();
    expect(transform.selectedOutfit?.outfitId).toBe(legacy.selectedOutfit?.outfitId);
    expect(transform.selectedOutfit?.inputKind ?? null).toBeNull();
    expect(transform.visualTreatment.kind).toBe(legacy.visualTreatment.kind);
    expect(transform.creativeIntent.userIntent).toBe(legacy.creativeIntent.userIntent);
    expect(transform.creativeIntent.appliedPrompt).toBeNull();
    expect(transform.creativeIntent.resourceRevision).toBeNull();
  },
);
