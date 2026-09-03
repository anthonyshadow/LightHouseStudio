import { describe, expect, it } from 'vitest';
import { savedVideoStatus } from './infrastructure/database/schema.js';
import {
  CAMPAIGN_STATUSES as CONTRACT_CAMPAIGN_STATUSES,
  CHARACTER_REFERENCE_FRAMINGS,
  LOCAL_VOICE_EFFECT_IDS as CONTRACT_LOCAL_VOICE_EFFECT_IDS,
  PROJECT_ASSET_KINDS as CONTRACT_PROJECT_ASSET_KINDS,
  PROJECT_ASSET_ROLES as CONTRACT_PROJECT_ASSET_ROLES,
  PROJECT_PROCESSING_PHASES as WIRE_PROJECT_PROCESSING_PHASES,
  PROJECT_REVISION_SOURCES as CONTRACT_PROJECT_REVISION_SOURCES,
  PROJECT_SOURCE_KINDS as CONTRACT_PROJECT_SOURCE_KINDS,
  PROJECT_STATUSES as CONTRACT_PROJECT_STATUSES,
  PROJECT_WORKFLOW_PHASES as CONTRACT_PROJECT_WORKFLOW_PHASES,
  PROJECT_PROCESSING_RESULT_STATES as WIRE_PROJECT_PROCESSING_RESULT_STATES,
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_PROMPT_MAX_LENGTH,
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  SAVED_VIDEO_ORIGINS as CONTRACT_SAVED_VIDEO_ORIGINS,
  SUBTITLE_CUE_LIMIT as CONTRACT_SUBTITLE_CUE_LIMIT,
  SUBTITLE_CUE_MINIMUM_DURATION_MS as CONTRACT_SUBTITLE_CUE_MINIMUM_DURATION_MS,
  SUBTITLE_CUE_PLACEMENTS as CONTRACT_SUBTITLE_CUE_PLACEMENTS,
  SUBTITLE_CUE_TEXT_MAX_LENGTH as CONTRACT_SUBTITLE_CUE_TEXT_MAX_LENGTH,
  SUPPORTED_MODEL_IDS,
  VIDEO_EDIT_CROP_PRESETS as CONTRACT_VIDEO_EDIT_CROP_PRESETS,
  VIDEO_EDIT_FILTERS as CONTRACT_VIDEO_EDIT_FILTERS,
  capabilitySchema,
  projectExportSpecificationValueSchema,
  referenceImageMimeTypeSchema,
  savedVideoStatusSchema,
  userPlanIdSchema,
} from '@studio/contracts';
import {
  CAMPAIGN_STATUSES,
  CHARACTER_REFERENCE_PROMPT_FRAMINGS,
  IMAGE_MIME_TYPES,
  LOCAL_VOICE_EFFECT_IDS,
  MAX_IMAGE_BYTES,
  MODEL_MODE_IDS,
  PHASE_ONE_CAPABILITY_IDS,
  PROMPT_MAX_LENGTH,
  PROJECT_ASSET_KINDS,
  PROJECT_ASSET_ROLES,
  PROJECT_EXPORT_ASPECTS,
  PROJECT_PROCESSING_PUBLIC_PHASES,
  PROJECT_REVISION_SOURCES,
  PROJECT_SOURCE_KINDS,
  PROJECT_STATUSES,
  PROJECT_WORKFLOW_PHASES,
  PROJECT_PROCESSING_RESULT_STATES,
  RECOMMENDED_IMAGE_BYTES,
  SAVED_VIDEO_ORIGINS,
  SUBTITLE_CUE_LIMIT,
  SUBTITLE_CUE_MINIMUM_DURATION_MS,
  SUBTITLE_CUE_PLACEMENTS,
  SUBTITLE_CUE_TEXT_MAX_LENGTH,
  USER_PLAN_IDS,
  VIDEO_EDIT_CROP_PRESETS,
  VIDEO_EDIT_FILTERS,
} from '@studio/domain';

describe('independent domain and wire value sets', () => {
  it('keeps realtime model identifiers in parity', () => {
    expect(MODEL_MODE_IDS).toEqual(SUPPORTED_MODEL_IDS);
  });

  it('keeps Project processing result states in parity', () => {
    // The contract mirrors this list by hand because contracts cannot import the domain. The
    // mirror is what the comment beside it promises; this is the promise.
    expect(PROJECT_PROCESSING_RESULT_STATES).toEqual(WIRE_PROJECT_PROCESSING_RESULT_STATES);
  });

  it('keeps reference framing identifiers in parity', () => {
    expect(CHARACTER_REFERENCE_PROMPT_FRAMINGS).toEqual(CHARACTER_REFERENCE_FRAMINGS);
  });

  it('keeps reference image MIME types and byte limits in parity', () => {
    expect(IMAGE_MIME_TYPES).toEqual(referenceImageMimeTypeSchema.options);
    expect(MAX_IMAGE_BYTES).toBe(REFERENCE_IMAGE_UPLOAD_MAX_BYTES);
    expect(RECOMMENDED_IMAGE_BYTES).toBe(REFERENCE_IMAGE_MAX_BYTES);
  });

  it('keeps authored prompt length in parity', () => {
    expect(PROMPT_MAX_LENGTH).toBe(REFERENCE_IMAGE_PROMPT_MAX_LENGTH);
  });

  it('keeps Project status, relationship, revision, and workflow values in parity', () => {
    expect(PROJECT_STATUSES).toEqual(CONTRACT_PROJECT_STATUSES);
    expect(PROJECT_ASSET_ROLES).toEqual(CONTRACT_PROJECT_ASSET_ROLES);
    expect(PROJECT_REVISION_SOURCES).toEqual(CONTRACT_PROJECT_REVISION_SOURCES);
    expect(PROJECT_WORKFLOW_PHASES).toEqual(CONTRACT_PROJECT_WORKFLOW_PHASES);
  });

  it('keeps Project asset kinds, source kinds and export aspects in parity', () => {
    expect(PROJECT_ASSET_KINDS).toEqual(CONTRACT_PROJECT_ASSET_KINDS);
    expect(PROJECT_SOURCE_KINDS).toEqual(CONTRACT_PROJECT_SOURCE_KINDS);
    expect(PROJECT_EXPORT_ASPECTS).toEqual(
      projectExportSpecificationValueSchema.shape.aspect.options,
    );
  });

  it('keeps Saved Video origins in parity', () => {
    expect(SAVED_VIDEO_ORIGINS).toEqual(CONTRACT_SAVED_VIDEO_ORIGINS);
  });

  it('serves every stored Saved Video status except the tombstone', () => {
    // 'deleted' is deliberately absent from the wire: a tombstoned record is a 404, never a
    // status. The wire enum is the stored enum minus exactly that member — read from the real
    // pgEnum, so a status added to storage has to show up here or be excluded on purpose.
    expect(savedVideoStatusSchema.options).toEqual(
      savedVideoStatus.enumValues.filter((value) => value !== 'deleted'),
    );
  });

  it('keeps Campaign statuses, plan ids and capability ids in parity', () => {
    expect(CAMPAIGN_STATUSES).toEqual(CONTRACT_CAMPAIGN_STATUSES);
    expect(USER_PLAN_IDS).toEqual(userPlanIdSchema.options);
    expect(PHASE_ONE_CAPABILITY_IDS).toEqual(capabilitySchema.options);
  });

  it('keeps video-edit crop presets, filters and voice effect ids in parity', () => {
    expect(VIDEO_EDIT_CROP_PRESETS).toEqual(CONTRACT_VIDEO_EDIT_CROP_PRESETS);
    expect(VIDEO_EDIT_FILTERS).toEqual(CONTRACT_VIDEO_EDIT_FILTERS);
    expect(LOCAL_VOICE_EFFECT_IDS).toEqual(CONTRACT_LOCAL_VOICE_EFFECT_IDS);
  });

  it('keeps subtitle placements and limits in parity', () => {
    expect(SUBTITLE_CUE_PLACEMENTS).toEqual(CONTRACT_SUBTITLE_CUE_PLACEMENTS);
    expect(SUBTITLE_CUE_LIMIT).toBe(CONTRACT_SUBTITLE_CUE_LIMIT);
    expect(SUBTITLE_CUE_TEXT_MAX_LENGTH).toBe(CONTRACT_SUBTITLE_CUE_TEXT_MAX_LENGTH);
    expect(SUBTITLE_CUE_MINIMUM_DURATION_MS).toBe(CONTRACT_SUBTITLE_CUE_MINIMUM_DURATION_MS);
  });

  it('keeps the public processing phases in parity', () => {
    expect(PROJECT_PROCESSING_PUBLIC_PHASES).toEqual(WIRE_PROJECT_PROCESSING_PHASES);
  });

  /*
   * Deliberate non-pairs, so nobody re-flags them: PROJECT_PROCESSING_CAPABILITIES includes
   * 'voice' while the domain's VideoTransformOperationId does not (voice treatment is a processing
   * capability, not a realtime transform); SAVED_VIDEO_FORMATS describes a saved Version's derived
   * orientation while the domain's captureFormat describes recording intent ('square' vs
   * 'freeform'); and the campaigns lifecycle query enum excludes 'deleted' because it is a list
   * filter, not the status set.
   */
});
