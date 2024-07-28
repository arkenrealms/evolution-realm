import express, { Express } from 'express';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketServer } from 'socket.io';
import { createTRPCProxyClient, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import type { Router as GameWorldRouter } from './game-world';
export type { GameWorldRouter };
export interface ApplicationConfig {
  testBanSystem: boolean;
  roundId: number;
  rewardItemAmountPerLegitPlayer: number;
  rewardItemAmountMax: number;
  rewardWinnerAmountPerLegitPlayer: number;
  rewardWinnerAmountMax: number;
  rewardItemAmount: number;
  rewardWinnerAmount: number;
  drops: {
    guardian: number;
    earlyAccess: number;
    trinket: number;
    santa: number;
  };
  totalLegitPlayers: number;
  isBattleRoyale: boolean;
  isGodParty: boolean;
  level2open: boolean;
  isRoundPaused: boolean;
  gameMode: string;
  maxEvolves: number;
  pointsPerEvolve: number;
  pointsPerKill: number;
  decayPower: number;
  dynamicDecayPower: boolean;
  baseSpeed: number;
  avatarSpeedMultiplier: Record<number, number>;
  avatarDecayPower: Record<number, number>;
  preventBadKills: boolean;
  antifeed1: boolean;
  antifeed2: boolean;
  antifeed3: boolean;
  noDecay: boolean;
  noBoot: boolean;
  rewardSpawnLoopSeconds: number;
  orbOnDeathPercent: number;
  orbTimeoutSeconds: number;
  orbCutoffSeconds: number;
  orbLookup: Record<string, any>;
  roundLoopSeconds: number;
  fastLoopSeconds: number;
  leadercap: boolean;
  hideMap: boolean;
  checkPositionDistance: number;
  checkInterval: number;
  resetInterval: number;
  loggableEvents: string[];
  rewardSpawnPoints: { x: number; y: number }[];
  rewardSpawnPoints2: { x: number; y: number }[];
  mapBoundary: {
    x: { min: number; max: number };
    y: { min: number; max: number };
  };
  spawnBoundary1: {
    x: { min: number; max: number };
    y: { min: number; max: number };
  };
  spawnBoundary2: {
    x: { min: number; max: number };
    y: { min: number; max: number };
  };
  rewards: Record<string, any>;
}

export interface ApplicationModule {
  name: string;
  instance: (app: Application) => void | Promise<void>;
  async: boolean;
  timeout: number;
  unsavedGames: any[];
}

export interface ApplicationModules {
  [key: string]: (app: Application) => void | Promise<void>;
}

export interface Application {
  config: ApplicationConfig;
  server: Express;
  isHttps: boolean;
  https?: HttpsServer;
  http?: HttpServer;
  io: SocketServer;
  subProcesses: any[];
  moduleConfig: ApplicationModule[];
  modules: Record<string, ApplicationModule>;
  seerList: string[];
  adminList: string[];
  modList: string[];
  sockets: Record<string, any>;
  version: string;
  endpoint: string;
  servers: Record<string, Server>;
  profiles: Record<string, Profile>;
  web3: any; // Assume web3 is a configured instance
  secrets: any; // Secrets for signing
}

export interface Character {
  id: string;
  name: string;
  level: number;
  class: string;
}

export class Server {
  app: Application;
  endpoint: string;
  key: string;
  bridge?: ReturnType<typeof createTRPCProxyClient<GameWorldRouter>>;
  router?: ReturnType<typeof t.router>;
  socket?: any;
  id: string;
  info: undefined;
  isAuthed: boolean;
  characters: Record<string, Character>;
  process: any;
  spawnPort: any;
}
