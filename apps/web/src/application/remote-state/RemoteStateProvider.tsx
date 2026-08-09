import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';

export const createRemoteStateQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

export const RemoteStateProvider = ({ children }: PropsWithChildren) => {
  const ownerUserId = useAuth().session?.user.id ?? null;
  const ownedClient = useMemo(
    () => ({ ownerUserId, queryClient: createRemoteStateQueryClient() }),
    [ownerUserId],
  );

  useEffect(
    () => () => {
      ownedClient.queryClient.clear();
    },
    [ownedClient],
  );

  return <QueryClientProvider client={ownedClient.queryClient}>{children}</QueryClientProvider>;
};
