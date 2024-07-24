// src/trpc/index.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { Config, UnsavedGame } from './models';
import shortId from 'shortid';

const t = initTRPC.create();

export const appRouter = t.router({
  startGameServer: t.procedure.query(async () => {
    // Logic to start the game server
  }),
  callGameServer: t.procedure
    .input(
      z.object({
        name: z.string(),
        signature: z.string(),
        data: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { name, signature, data } = input;
      // Logic to call the game server
    }),
  connectGameServer: t.procedure.query(async () => {
    // Logic to connect to the game server
  }),
  initResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
          data: z
            .object({
              id: z.string(),
              roundId: z.number(),
            })
            .optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for initResponse
    }),
  configureResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
          data: z.object({
            rewardWinnerAmount: z.number(),
            rewardItemAmount: z.number(),
          }),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for configureResponse
    }),
  saveRoundResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for saveRoundResponse
    }),
  confirmUserResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
          isMod: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for confirmUserResponse
    }),
  getRandomRewardResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
          reward: z.any().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for getRandomRewardResponse
    }),
  verifySignatureResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
          verified: z.boolean(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for verifySignatureResponse
    }),
  verifyAdminSignatureResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
          address: z.string(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for verifyAdminSignatureResponse
    }),
  normalizeAddressResponse: t.procedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          status: z.number(),
          address: z.string(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      // Logic for normalizeAddressResponse
    }),
});

export type AppRouter = typeof appRouter;
