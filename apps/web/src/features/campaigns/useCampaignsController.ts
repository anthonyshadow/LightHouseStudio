import type { CampaignContract } from '@studio/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  archiveCampaign,
  createCampaign,
  editCampaign,
  getCampaign,
  listCampaigns,
  restoreCampaign,
  tombstoneCampaign,
} from './campaignsApi';

const CAMPAIGN_PAGE_SIZE = 20;

export const campaignQueryKeys = {
  all: ['campaigns'] as const,
  lists: ['campaigns', 'list'] as const,
  list: (lifecycle: 'active' | 'archived') => ['campaigns', 'list', lifecycle] as const,
  detail: (campaignId: string) => ['campaigns', 'detail', campaignId] as const,
};

export const useCampaignList = (lifecycle: 'active' | 'archived') =>
  useInfiniteQuery({
    queryKey: campaignQueryKeys.list(lifecycle),
    queryFn: ({ pageParam, signal }) =>
      listCampaigns({
        lifecycle,
        pageSize: CAMPAIGN_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export const useCampaignDetail = (campaignId: string) =>
  useQuery({
    queryKey: campaignQueryKeys.detail(campaignId),
    queryFn: ({ signal }) => getCampaign(campaignId, signal),
  });

export const useCampaignsController = () => {
  const queryClient = useQueryClient();
  const pendingCreateKey = useRef<string | null>(null);
  const reconcile = async (campaign: CampaignContract) => {
    queryClient.setQueryData(campaignQueryKeys.detail(campaign.id), campaign);
    await queryClient.invalidateQueries({ queryKey: campaignQueryKeys.lists });
    return campaign;
  };
  const createMutation = useMutation({
    mutationFn: (input: { readonly name: string; readonly brief: string | null }) => {
      const operationKey = pendingCreateKey.current ?? crypto.randomUUID();
      pendingCreateKey.current = operationKey;
      return createCampaign(input, operationKey);
    },
    onSuccess: async (campaign) => {
      pendingCreateKey.current = null;
      await reconcile(campaign);
    },
  });
  const editMutation = useMutation({
    mutationFn: (input: {
      readonly campaignId: string;
      readonly name: string;
      readonly brief: string | null;
      readonly expectedVersion: number;
    }) => editCampaign(input.campaignId, input),
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
