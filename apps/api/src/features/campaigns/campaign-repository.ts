import type { ListTotal } from '@studio/contracts';
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
  /**
   * Matched case-insensitively against the Campaign name. Already trimmed and length-bounded by
   * the contract, so an implementation applies it rather than re-validating it.
   */
  readonly search?: string;
  readonly cursor?: CampaignSummaryCursor;
  readonly pageSize: number;
}

export interface CampaignSummaryPage {
  readonly campaigns: readonly Campaign[];
  readonly nextCursor: CampaignSummaryCursor | null;
  /**
   * How many Campaigns match the query as a whole, independent of where the cursor is. Bounded, so
   * it never costs a full scan.
   */
  readonly total: ListTotal;
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
