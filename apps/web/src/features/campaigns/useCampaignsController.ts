import type { CampaignContract } from '@studio/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  archiveCampaign,
  createCampaign,
  editCampaign,
  getCampaign,
  listCampaigns,
  restoreCampaign,
  tombstoneCampaign,
} from './campaignsApi';
import { useStableOperationKey } from '../projects/useStableOperationKey';

const CAMPAIGN_PAGE_SIZE = 20;

export const campaignQueryKeys = {
  all: ['campaigns'] as const,
  lists: ['campaigns', 'list'] as const,
  list: (lifecycle: 'active' | 'archived') => ['campaigns', 'list', lifecycle] as const,
  detail: (campaignId: string) => ['campaigns', 'detail', campaignId] as const,
};

/**
 * `search` is part of the key, not just the request: a term identifies a different result set, so
 * its pages — and the cursors that walk them — must never be mixed with another term's.
 */
export const useCampaignList = (lifecycle: 'active' | 'archived', search?: string) =>
  useInfiniteQuery({
    queryKey: [...campaignQueryKeys.list(lifecycle), search ?? ''],
    queryFn: ({ pageParam, signal }) =>
      listCampaigns({
        lifecycle,
        ...(search === undefined ? {} : { search }),
        pageSize: CAMPAIGN_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });

export const useCampaignDetail = (campaignId: string | null) =>
  useQuery({
    queryKey: campaignQueryKeys.detail(campaignId ?? 'unassigned'),
    queryFn: ({ signal }) => {
      if (campaignId === null) throw new Error('A Campaign id is required.');
      return getCampaign(campaignId, signal);
    },
    enabled: campaignId !== null,
  });

export const useCampaignsController = () => {
  const queryClient = useQueryClient();
  const createOperation = useStableOperationKey();
  const reconcile = async (campaign: CampaignContract) => {
    queryClient.setQueryData(campaignQueryKeys.detail(campaign.id), campaign);
    await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.lists });
    return campaign;
  };
  const createMutation = useMutation({
    mutationFn: (input: { readonly name: string; readonly brief: string | null }) =>
      createCampaign(input, createOperation.keyFor(JSON.stringify({ kind: 'create', ...input }))),
    onSuccess: async (campaign) => {
      createOperation.reset();
      await reconcile(campaign);
    },
  });
  const editMutation = useMutation({
    mutationFn: (input: {
      readonly campaignId: string;
      readonly name: string;
      readonly brief: string | null;
      readonly expectedVersion: number;
    }) => {
      const { campaignId, ...request } = input;
      return editCampaign(campaignId, request);
    },
    onSuccess: reconcile,
  });
  const archiveMutation = useMutation({
    mutationFn: (input: { readonly campaignId: string; readonly expectedVersion: number }) =>
      archiveCampaign(input.campaignId, input.expectedVersion),
    onSuccess: reconcile,
  });
  const restoreMutation = useMutation({
    mutationFn: (input: { readonly campaignId: string; readonly expectedVersion: number }) =>
      restoreCampaign(input.campaignId, input.expectedVersion),
    onSuccess: reconcile,
  });
  const tombstoneMutation = useMutation({
    mutationFn: (input: { readonly campaignId: string; readonly expectedVersion: number }) =>
      tombstoneCampaign(input.campaignId, input.expectedVersion),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all });
    },
  });
  return {
    createMutation,
    editMutation,
    archiveMutation,
    restoreMutation,
    tombstoneMutation,
  } as const;
};
