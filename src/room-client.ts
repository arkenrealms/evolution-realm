import { z } from 'zod';
import { initTRPC, TRPCError } from '@trpc/server';
import { RoomClient } from './types';

interface RoomClientContext {
  client: RoomClient;
}

export const t = initTRPC
  .context<{
    client: RoomClient;
  }>()
  .create();
export const router = t.router;
export const procedure = t.procedure;

export const onEvents = z.array(z.object({ name: z.string(), args: z.array(z.any()) }));
export const onBroadcast = z.object({ message: z.string(), priority: z.number() });
export const onClearLeaderboard = z.object({});

export const onSpawnReward = z.tuple([
  z.string(), // id
  z.union([z.string(), z.number()]), // rewardItemType
  z.string(), // rewardItemName
  z.number(), // quantity
  z.number(), // position x
  z.number(), // position y
]);

export type OnEventsInput = z.infer<typeof onEvents>;
export type OnBroadcastInput = z.infer<typeof onBroadcast>;
export type OnClearLeaderboardInput = z.infer<typeof onBroadcast>;
export type OnSpawnRewardInput = z.infer<typeof onSpawnReward>;

export const createRouter = (handler) => {
  return router({
    onEvents: procedure
      .input(onEvents)
      .mutation(({ input, ctx }: { input: OnEventsInput; ctx: RoomClientContext }) => handler(input, ctx)),
    onBroadcast: procedure
      .input(onBroadcast)
      .mutation(({ input, ctx }: { input: OnBroadcastInput; ctx: RoomClientContext }) => handler(input, ctx)),
    onClearLeaderboard: procedure
      .input(onClearLeaderboard)
      .mutation(({ input, ctx }: { input: OnClearLeaderboardInput; ctx: RoomClientContext }) => handler(input, ctx)),
    onSpawnReward: procedure
      .input(onSpawnReward)
      .mutation(({ input, ctx }: { input: OnSpawnRewardInput; ctx: RoomClientContext }) => handler(input, ctx)),
  });
};

export type Router = ReturnType<typeof createRouter>;
