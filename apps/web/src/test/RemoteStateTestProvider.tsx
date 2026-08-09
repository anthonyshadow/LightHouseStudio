import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { createRemoteStateQueryClient } from '../application/remote-state/RemoteStateProvider';

export const RemoteStateTestProvider = ({ children }: PropsWithChildren) => {
  const [queryClient] = useState(createRemoteStateQueryClient);

  useEffect(
    () => () => {
      queryClient.clear();
    },
    [queryClient],
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
