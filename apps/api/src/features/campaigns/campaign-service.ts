import { createHash, randomUUID } from 'node:crypto';
import {
  campaignSchema,
  campaignsResponseSchema,
  type CampaignContract,
  type CampaignsQuery,
} from '@studio/contracts';
import {
  archiveCampaign,
  CampaignRuleError,
  createCampaign,
  editCampaign,
  normalizeCampaignBrief,
  normalizeCampaignName,
  restoreCampaign,
  tombstoneCampaign,
  type Campaign,
  type CampaignConflict,
} from '@studio/domain';
import { AppError } from '../../http/app-error.js';
import { decodePageCursor, encodePageCursor } from '../../http/page-cursor.js';
import type { CampaignRepository, CampaignSummaryCursor } from './campaign-repository.js';

const publicCampaign = (campaign: Campaign): CampaignContract =>
  campaignSchema.parse({
    id: campaign.id,
    name: campaign.name,
    brief: campaign.brief,
    status: campaign.status,
    version: campaign.version,
    archivedAt: campaign.archivedAt,
    deletedAt: campaign.deletedAt,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  });

const cursorCriteria = (query: CampaignsQuery): string =>
  JSON.stringify({
    lifecycle: query.lifecycle,
    search: query.search ?? null,
    pageSize: query.pageSize,
  });

const CAMPAIGN_CURSOR = {
  timestampKey: 'updatedAt',
  idKey: 'campaignId',
  invalidMessage: 'Use a valid Campaign page cursor.',
} as const;

const encodeCursor = (cursor: CampaignSummaryCursor, query: CampaignsQuery): string =>
  encodePageCursor(cursor, cursorCriteria(query));

const decodeCursor = (
  cursor: string | undefined,
  query: CampaignsQuery,
): CampaignSummaryCursor | undefined =>
  decodePageCursor(cursor, cursorCriteria(query), CAMPAIGN_CURSOR);

export type CampaignServiceMutationResult =
  | { readonly ok: true; readonly campaign: CampaignContract }
  | { readonly ok: false; readonly conflict: CampaignConflict };

export class CampaignService {
  readonly #repository: CampaignRepository;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(
    repository: CampaignRepository,
    options: { readonly now?: () => Date; readonly createId?: () => string } = {},
  ) {
    this.#repository = repository;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async create(
    ownerUserId: string,
    operationKey: string,
    input: { readonly name: string; readonly brief?: string | null },
  ): Promise<CampaignServiceMutationResult> {
    let name: string;
    let brief: string | null;
    try {
      name = normalizeCampaignName(input.name);
      brief = normalizeCampaignBrief(input.brief);
    } catch (error) {
      throw this.#mapRuleError(error);
    }
    const now = this.#now().toISOString();
    const campaignId = this.#createId();
    const campaign = createCampaign({ id: campaignId, ownerUserId, name, brief }, { now });
    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ version: 1, operation: 'campaign-create', name, brief }))
      .digest('hex');
    const result = await this.#repository.createCampaignIdempotent({
      campaign,
      receipt: { operationKey, requestFingerprint, campaignId, createdAt: now },
    });
    return result.kind === 'conflict'
      ? { ok: false, conflict: result.conflict }
      : { ok: true, campaign: publicCampaign(result.campaign) };
  }

  async list(ownerUserId: string, query: CampaignsQuery) {
    const cursor = decodeCursor(query.cursor, query);
    const page = await this.#repository.listCampaigns(ownerUserId, {
      lifecycle: query.lifecycle,
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(cursor === undefined ? {} : { cursor }),
      pageSize: query.pageSize,
    });
    return campaignsResponseSchema.parse({
      campaigns: page.campaigns.map(publicCampaign),
      nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor, query),
      total: page.total,
    });
  }

  async get(ownerUserId: string, campaignId: string): Promise<CampaignContract> {
    const campaign = await this.#repository.getCampaign(ownerUserId, campaignId);
    if (campaign === null) throw new AppError(404, 'not_found', 'That Campaign is unavailable.');
    return publicCampaign(campaign);
  }

  async edit(
    ownerUserId: string,
    campaignId: string,
    expectedVersion: number,
    input: { readonly name: string; readonly brief?: string | null },
  ): Promise<CampaignServiceMutationResult> {
    return this.#metadataMutation(ownerUserId, campaignId, expectedVersion, (campaign, now) =>
      editCampaign(campaign, input, expectedVersion, now),
    );
  }

  async archive(
    ownerUserId: string,
    campaignId: string,
    expectedVersion: number,
  ): Promise<CampaignServiceMutationResult> {
    return this.#metadataMutation(ownerUserId, campaignId, expectedVersion, (campaign, now) =>
      archiveCampaign(campaign, expectedVersion, now),
    );
  }

  async restore(
    ownerUserId: string,
    campaignId: string,
    expectedVersion: number,
  ): Promise<CampaignServiceMutationResult> {
    return this.#metadataMutation(ownerUserId, campaignId, expectedVersion, (campaign, now) =>
      restoreCampaign(campaign, expectedVersion, now),
    );
  }

  async tombstone(
    ownerUserId: string,
    campaignId: string,
    expectedVersion: number,
    confirmation: 'tombstone',
  ): Promise<CampaignServiceMutationResult> {
    const current = await this.#repository.getCampaignWithAttachedProjectCount(
      ownerUserId,
      campaignId,
    );
    if (current === null) throw new AppError(404, 'not_found', 'That Campaign is unavailable.');
    let next;
    try {
      next = tombstoneCampaign(
        current.campaign,
        expectedVersion,
        current.attachedProjectCount,
        confirmation,
        this.#now().toISOString(),
      );
    } catch (error) {
      throw this.#mapRuleError(error);
    }
    if (!next.ok) return { ok: false, conflict: next.conflict };
    return this.#persist(ownerUserId, expectedVersion, next.value, true);
  }

  async #metadataMutation(
    ownerUserId: string,
    campaignId: string,
    expectedVersion: number,
    mutate: (
      campaign: Campaign,
      now: string,
    ) =>
      | { readonly ok: true; readonly value: Campaign }
      | { readonly ok: false; readonly conflict: CampaignConflict },
  ): Promise<CampaignServiceMutationResult> {
    const campaign = await this.#repository.getCampaign(ownerUserId, campaignId);
    if (campaign === null) throw new AppError(404, 'not_found', 'That Campaign is unavailable.');
    let next;
    try {
      next = mutate(campaign, this.#now().toISOString());
    } catch (error) {
      throw this.#mapRuleError(error);
    }
    if (!next.ok) return { ok: false, conflict: next.conflict };
    return this.#persist(ownerUserId, expectedVersion, next.value, false);
  }

  async #persist(
    ownerUserId: string,
    expectedVersion: number,
    campaign: Campaign,
    requireNoAttachedProjects: boolean,
  ): Promise<CampaignServiceMutationResult> {
    const result = await this.#repository.updateCampaignMetadata({
      ownerUserId,
      expectedVersion,
      campaign,
      ...(requireNoAttachedProjects ? { requireNoAttachedProjects: true } : {}),
    });
    if (result.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Campaign is unavailable.');
    }
    return result.kind === 'conflict'
      ? { ok: false, conflict: result.conflict }
      : { ok: true, campaign: publicCampaign(campaign) };
  }

  #mapRuleError(error: unknown): Error {
    if (!(error instanceof CampaignRuleError)) return error as Error;
    const validation =
      error.reason === 'invalid-name' ||
      error.reason === 'invalid-brief' ||
      error.reason === 'invalid-timestamp';
    return new AppError(
      validation ? 400 : 409,
      validation ? 'validation_error' : 'conflict',
      error.message,
    );
  }
}
