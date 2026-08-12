import type {
  Campaign,
  CampaignConflict,
  CampaignMutationContext,
  CampaignMutationResult,
} from './types';

export const CAMPAIGN_NAME_MAX_LENGTH = 120;
export const CAMPAIGN_BRIEF_MAX_LENGTH = 1_000;

export type CampaignRuleErrorReason =
  | 'invalid-id'
  | 'invalid-name'
  | 'invalid-brief'
  | 'invalid-timestamp'
  | 'invalid-transition'
  | 'not-archived'
  | 'confirmation-required';

export class CampaignRuleError extends Error {
  constructor(
    readonly reason: CampaignRuleErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'CampaignRuleError';
  }
}

const requireId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 200 ||
    /^(?:blob|data|https?):/iu.test(normalized)
  ) {
    throw new CampaignRuleError('invalid-id', `${label} must be an opaque durable identifier.`);
  }
  return normalized;
};

const requireTimestamp = (value: string): string => {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.valueOf())) {
    throw new CampaignRuleError('invalid-timestamp', 'A valid Campaign timestamp is required.');
  }
  return timestamp.toISOString();
};

const stripControlCharacters = (value: string, preserveNewlines = false): string =>
  [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 || (preserveNewlines && (character === '\n' || character === '\t'));
    })
    .join('');

export const normalizeCampaignName = (value: string): string => {
  const normalized = stripControlCharacters(value).replaceAll(/\s+/gu, ' ').trim();
  if (normalized.length === 0 || normalized.length > CAMPAIGN_NAME_MAX_LENGTH) {
    throw new CampaignRuleError(
      'invalid-name',
      `A Campaign name must be between 1 and ${CAMPAIGN_NAME_MAX_LENGTH} characters.`,
    );
  }
  return normalized;
};

export const normalizeCampaignBrief = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = stripControlCharacters(value.replace(/\r\n?/gu, '\n'), true)
    .replaceAll(/[ \t]+/gu, ' ')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();
  if (normalized.length > CAMPAIGN_BRIEF_MAX_LENGTH) {
    throw new CampaignRuleError(
      'invalid-brief',
      `A Campaign brief cannot exceed ${CAMPAIGN_BRIEF_MAX_LENGTH} characters.`,
    );
  }
  return normalized.length === 0 ? null : normalized;
};

export const createCampaign = (
  input: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly name: string;
    readonly brief?: string | null;
  },
  context: CampaignMutationContext,
): Campaign => {
  const now = requireTimestamp(context.now);
  return {
    id: requireId(input.id, 'Campaign'),
    ownerUserId: requireId(input.ownerUserId, 'Campaign owner'),
    name: normalizeCampaignName(input.name),
    brief: normalizeCampaignBrief(input.brief),
    status: 'active',
    version: 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
};

const versionConflict = (
  campaign: Campaign,
  expectedVersion: number,
): CampaignMutationResult<never> => ({
  ok: false,
  conflict: {
    kind: 'campaign-version',
    campaignId: campaign.id,
    expectedVersion,
    actualVersion: campaign.version,
  },
});

export const editCampaign = (
  campaign: Campaign,
  input: { readonly name: string; readonly brief?: string | null },
  expectedVersion: number,
  nowValue: string,
): CampaignMutationResult<Campaign> => {
  if (campaign.version !== expectedVersion) return versionConflict(campaign, expectedVersion);
  if (campaign.deletedAt !== null) {
    throw new CampaignRuleError('invalid-transition', 'A deleted Campaign cannot be edited.');
  }
  return {
    ok: true,
    value: {
      ...campaign,
      name: normalizeCampaignName(input.name),
      brief: normalizeCampaignBrief(input.brief),
      version: campaign.version + 1,
      updatedAt: requireTimestamp(nowValue),
    },
  };
};

export const archiveCampaign = (
  campaign: Campaign,
  expectedVersion: number,
  nowValue: string,
): CampaignMutationResult<Campaign> => {
  if (campaign.version !== expectedVersion) return versionConflict(campaign, expectedVersion);
  if (campaign.status !== 'active' || campaign.archivedAt !== null || campaign.deletedAt !== null) {
    throw new CampaignRuleError('invalid-transition', 'Only an active Campaign can be archived.');
  }
  const now = requireTimestamp(nowValue);
  return {
    ok: true,
    value: {
      ...campaign,
      status: 'archived',
      version: campaign.version + 1,
      archivedAt: now,
      updatedAt: now,
    },
  };
};

export const restoreCampaign = (
  campaign: Campaign,
  expectedVersion: number,
  nowValue: string,
): CampaignMutationResult<Campaign> => {
  if (campaign.version !== expectedVersion) return versionConflict(campaign, expectedVersion);
  if (
    campaign.status !== 'archived' ||
    campaign.archivedAt === null ||
    campaign.deletedAt !== null
  ) {
    throw new CampaignRuleError('not-archived', 'Only an archived Campaign can be restored.');
  }
  return {
    ok: true,
    value: {
      ...campaign,
      status: 'active',
      version: campaign.version + 1,
      archivedAt: null,
      updatedAt: requireTimestamp(nowValue),
    },
  };
};

export const tombstoneCampaign = (
  campaign: Campaign,
  expectedVersion: number,
  attachedProjectCount: number,
  confirmation: 'tombstone' | null,
  nowValue: string,
): CampaignMutationResult<Campaign> => {
  if (campaign.version !== expectedVersion) return versionConflict(campaign, expectedVersion);
  if (campaign.status !== 'archived' || campaign.archivedAt === null) {
    throw new CampaignRuleError('not-archived', 'Archive the Campaign before deleting it.');
  }
  if (!Number.isInteger(attachedProjectCount) || attachedProjectCount < 0) {
    throw new CampaignRuleError('invalid-transition', 'Campaign membership facts are invalid.');
  }
  if (attachedProjectCount > 0) {
    const conflict: Extract<CampaignConflict, { readonly kind: 'campaign-not-empty' }> = {
      kind: 'campaign-not-empty',
      campaignId: campaign.id,
      attachedProjectCount,
    };
    return { ok: false, conflict };
  }
  if (confirmation !== 'tombstone') {
    throw new CampaignRuleError(
      'confirmation-required',
      'Campaign deletion requires explicit confirmation.',
    );
  }
  const now = requireTimestamp(nowValue);
  return {
    ok: true,
    value: {
      ...campaign,
      status: 'deleted',
      version: campaign.version + 1,
      deletedAt: now,
      updatedAt: now,
    },
  };
};
