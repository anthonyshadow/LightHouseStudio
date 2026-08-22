import type { Campaign } from '@studio/domain';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { boundedListTotal, LIST_TOTAL_PROBE_LIMIT } from '../../application/list-total.js';
import { nullableIsoTimestamp, toIsoTimestamp } from '../../application/timestamps.js';
import type {
  CampaignCreatePersistenceResult,
  CampaignCreateReceipt,
  CampaignPersistenceMutationResult,
  CampaignRepository,
  CampaignSummaryPage,
  CampaignSummaryPageInput,
  CampaignWithAttachedProjectCount,
} from '../../features/campaigns/campaign-repository.js';
import type { LightframeDatabase } from './client.js';
import { searchTermMatches } from './search-pattern.js';
import { campaignOperationReceipts, campaigns, projects } from './schema.js';

type CampaignRow = typeof campaigns.$inferSelect;

const toCampaign = (row: CampaignRow): Campaign => ({
  id: row.id,
  ownerUserId: row.ownerUserId,
  name: row.name,
  brief: row.brief,
  status: row.status,
  version: row.version,
  archivedAt: nullableIsoTimestamp(row.archivedAt),
  deletedAt: nullableIsoTimestamp(row.deletedAt),
  createdAt: toIsoTimestamp(row.createdAt),
  updatedAt: toIsoTimestamp(row.updatedAt),
});

const campaignValues = (campaign: Campaign): typeof campaigns.$inferInsert => ({
  id: campaign.id,
  ownerUserId: campaign.ownerUserId,
  name: campaign.name,
  brief: campaign.brief,
  status: campaign.status,
  version: campaign.version,
  archivedAt: nullableIsoTimestamp(campaign.archivedAt),
  deletedAt: nullableIsoTimestamp(campaign.deletedAt),
  createdAt: toIsoTimestamp(campaign.createdAt),
  updatedAt: toIsoTimestamp(campaign.updatedAt),
});

export class DrizzleCampaignRepository implements CampaignRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async createCampaignIdempotent(input: {
    readonly campaign: Campaign;
    readonly receipt: CampaignCreateReceipt;
  }): Promise<CampaignCreatePersistenceResult> {
    return this.db.transaction(async (tx) => {
      if (input.receipt.campaignId !== input.campaign.id) {
        throw new Error('Campaign create receipt mismatch.');
      }
      const inserted = await tx
        .insert(campaignOperationReceipts)
        .values({
          ownerUserId: input.campaign.ownerUserId,
          operationKey: input.receipt.operationKey,
          operation: 'campaign-create',
          requestFingerprint: input.receipt.requestFingerprint,
          campaignId: input.receipt.campaignId,
          createdAt: toIsoTimestamp(input.receipt.createdAt),
        })
        .onConflictDoNothing({
          target: [campaignOperationReceipts.ownerUserId, campaignOperationReceipts.operationKey],
        })
        .returning({ operationKey: campaignOperationReceipts.operationKey });
      if (inserted.length > 0) {
        await tx.insert(campaigns).values(campaignValues(input.campaign));
        return { kind: 'created', campaign: input.campaign };
      }
      const [row] = await tx
        .select({ receipt: campaignOperationReceipts, campaign: campaigns })
        .from(campaignOperationReceipts)
        .leftJoin(
          campaigns,
          and(
            eq(campaigns.id, campaignOperationReceipts.campaignId),
            eq(campaigns.ownerUserId, campaignOperationReceipts.ownerUserId),
          ),
        )
        .where(
          and(
            eq(campaignOperationReceipts.ownerUserId, input.campaign.ownerUserId),
            eq(campaignOperationReceipts.operationKey, input.receipt.operationKey),
          ),
        )
        .for('update', { of: campaignOperationReceipts })
        .limit(1);
      if (
        row === undefined ||
        row.receipt.operation !== 'campaign-create' ||
        row.receipt.requestFingerprint !== input.receipt.requestFingerprint
      ) {
        return {
          kind: 'conflict',
          conflict: { kind: 'operation-key', operation: 'campaign-create' },
        };
      }
      if (row.campaign === null) throw new Error('Campaign create receipt has no result.');
      return { kind: 'replayed', campaign: toCampaign(row.campaign) };
    });
  }

  async getCampaign(ownerUserId: string, campaignId: string): Promise<Campaign | null> {
    const [row] = await this.db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.ownerUserId, ownerUserId),
          isNull(campaigns.deletedAt),
        ),
      )
      .limit(1);
    return row === undefined ? null : toCampaign(row);
  }

  async getCampaignWithAttachedProjectCount(
    ownerUserId: string,
    campaignId: string,
  ): Promise<CampaignWithAttachedProjectCount | null> {
    const [row] = await this.db
      .select({
        campaign: campaigns,
        attachedProjectCount: sql<number>`count(${projects.id})::integer`,
      })
      .from(campaigns)
      .leftJoin(
        projects,
        // Deleted Projects keep their `campaignId` but can never be moved off it again, so
        // counting them would block the Campaign's deletion against members nothing can detach.
        and(
          eq(projects.campaignId, campaigns.id),
          eq(projects.ownerUserId, campaigns.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.ownerUserId, ownerUserId),
          isNull(campaigns.deletedAt),
        ),
      )
      .groupBy(campaigns.id)
      .limit(1);
    return row === undefined
      ? null
      : { campaign: toCampaign(row.campaign), attachedProjectCount: row.attachedProjectCount };
  }

  async listCampaigns(
    ownerUserId: string,
    input: CampaignSummaryPageInput,
  ): Promise<CampaignSummaryPage> {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 40) {
      throw new Error('Use a bounded Campaign summary page.');
    }
    const cursorTimestamp =
      input.cursor === undefined ? undefined : toIsoTimestamp(input.cursor.updatedAt);
    // Shared by the page and the count, and deliberately free of the cursor: a total is of the
    // query, not of what is left after paging.
    const filters = and(
      eq(campaigns.ownerUserId, ownerUserId),
      eq(campaigns.status, input.lifecycle),
      isNull(campaigns.deletedAt),
      input.search === undefined ? undefined : searchTermMatches(campaigns.name, input.search),
    );
    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(campaigns)
        .where(
          and(
            filters,
            input.cursor === undefined
              ? undefined
              : or(
                  lt(campaigns.updatedAt, cursorTimestamp!),
                  and(
                    eq(campaigns.updatedAt, cursorTimestamp!),
                    lt(campaigns.id, input.cursor.campaignId),
                  ),
                ),
          ),
        )
        .orderBy(desc(campaigns.updatedAt), desc(campaigns.id))
        .limit(input.pageSize + 1),
      // Stops one row past the ceiling: enough to know it was passed, never a full scan.
      this.db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(filters)
        .limit(LIST_TOTAL_PROBE_LIMIT),
    ]);
    const page = rows.slice(0, input.pageSize).map(toCampaign);
    const last = page.at(-1);
    return {
      campaigns: page,
      nextCursor:
        rows.length > input.pageSize && last !== undefined
          ? { updatedAt: last.updatedAt, campaignId: last.id }
          : null,
      total: boundedListTotal(countRows.length),
    };
  }

  async updateCampaignMetadata(input: {
    readonly ownerUserId: string;
    readonly expectedVersion: number;
    readonly campaign: Campaign;
    readonly requireNoAttachedProjects?: boolean;
  }): Promise<CampaignPersistenceMutationResult> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, input.campaign.id),
            eq(campaigns.ownerUserId, input.ownerUserId),
            isNull(campaigns.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (current === undefined) return { kind: 'not-found' } as const;
      if (current.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'campaign-version',
            campaignId: current.id,
            expectedVersion: input.expectedVersion,
            actualVersion: current.version,
          },
        } as const;
      }
      if (
        input.campaign.ownerUserId !== current.ownerUserId ||
        input.campaign.version !== current.version + 1 ||
        toIsoTimestamp(input.campaign.createdAt) !== toIsoTimestamp(current.createdAt)
      ) {
        throw new Error('A Campaign metadata update changed immutable identity.');
      }
      if (input.requireNoAttachedProjects) {
        const [attached] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(projects)
          // A deleted Project keeps its `campaignId` and can never be detached again, so it must
          // not hold the Campaign open against a member nothing can move.
          .where(
            and(
              eq(projects.ownerUserId, current.ownerUserId),
              eq(projects.campaignId, current.id),
              isNull(projects.deletedAt),
            ),
          );
        const attachedProjectCount = attached?.count ?? 0;
        if (attachedProjectCount > 0) {
          return {
            kind: 'conflict',
            conflict: { kind: 'campaign-not-empty', campaignId: current.id, attachedProjectCount },
          } as const;
        }
      }
      await tx
        .update(campaigns)
        .set({
          name: input.campaign.name,
          brief: input.campaign.brief,
          status: input.campaign.status,
          version: input.campaign.version,
          archivedAt: nullableIsoTimestamp(input.campaign.archivedAt),
          deletedAt: nullableIsoTimestamp(input.campaign.deletedAt),
          updatedAt: toIsoTimestamp(input.campaign.updatedAt),
        })
        .where(and(eq(campaigns.id, current.id), eq(campaigns.ownerUserId, current.ownerUserId)));
      return { kind: 'updated' } as const;
    });
  }
}
