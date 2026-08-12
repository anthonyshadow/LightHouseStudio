import type { Campaign, CampaignConflict } from '@studio/domain';

export interface CampaignCreateReceipt {
  readonly operationKey: string;
  readonly requestFingerprint: string;
  readonly campaignId: string;
  readonly createdAt: string;
}

export type CampaignCreatePersistenceResult =
  | { readonly kind: 'created' | 'replayed'; readonly campaign: Campaign }
  | {
      readonly kind: 'conflict';
      readonly conflict: Extract<CampaignConflict, { readonly kind: 'operation-key' }>;
    };

export type CampaignPersistenceMutationResult =
  | { readonly kind: 'updated' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict'; readonly conflict: CampaignConflict };

export interface CampaignSummaryCursor {
  readonly updatedAt: string;
  readonly campaignId: string;
}

export interface CampaignSummaryPageInput {
  readonly lifecycle: 'active' | 'archived';
  readonly cursor?: CampaignSummaryCursor;
  readonly pageSize: number;
}

export interface CampaignSummaryPage {
  readonly campaigns: readonly Campaign[];
  readonly nextCursor: CampaignSummaryCursor | null;
}

export interface CampaignWithAttachedProjectCount {
  readonly campaign: Campaign;
  readonly attachedProjectCount: number;
}

export interface CampaignRepository {
  createCampaignIdempotent(input: {
    readonly campaign: Campaign;
    readonly receipt: CampaignCreateReceipt;
  }): Promise<CampaignCreatePersistenceResult>;
  getCampaign(ownerUserId: string, campaignId: string): Promise<Campaign | null>;
  getCampaignWithAttachedProjectCount(
    ownerUserId: string,
    campaignId: string,
  ): Promise<CampaignWithAttachedProjectCount | null>;
  listCampaigns(ownerUserId: string, input: CampaignSummaryPageInput): Promise<CampaignSummaryPage>;
  updateCampaignMetadata(input: {
    readonly ownerUserId: string;
    readonly expectedVersion: number;
    readonly campaign: Campaign;
    readonly requireNoAttachedProjects?: boolean;
  }): Promise<CampaignPersistenceMutationResult>;
}
