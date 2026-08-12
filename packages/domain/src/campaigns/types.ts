export const CAMPAIGN_STATUSES = ['active', 'archived', 'deleted'] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface Campaign {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly brief: string | null;
  readonly status: CampaignStatus;
  /** CAS token for every Campaign metadata or lifecycle mutation. */
  readonly version: number;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CampaignConflict =
  | { readonly kind: 'operation-key'; readonly operation: 'campaign-create' }
  | {
      readonly kind: 'campaign-version';
      readonly campaignId: string;
      readonly expectedVersion: number;
      readonly actualVersion: number;
    }
  | {
      readonly kind: 'campaign-not-empty';
      readonly campaignId: string;
      readonly attachedProjectCount: number;
    };

export type CampaignMutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly conflict: CampaignConflict };

export interface CampaignMutationContext {
  readonly now: string;
}
