// trpcClient.js
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { inferAsyncReturnType } from '@trpc/server';
import { customTransformer } from '../transformer';
import type { AppRouter } from '../app-router';

export const createClient = () => {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://localhost:2023', // Example URL, update as needed
      }),
    ],
    transformer: customTransformer,
  });
};

export type tRPCClient = inferAsyncReturnType<typeof createClient>;
