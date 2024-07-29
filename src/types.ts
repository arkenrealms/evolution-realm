import express, { Express } from 'express';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketServer } from 'socket.io';
import type { SeerRouter } from '@arken/seer';
import { createTRPCProxyClient, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import type { Router as RoomRouter } from './game-world';
export { createRouter as createRoomClientRouter } from './room-client';
export type { Router as RoomClientRouter } from './room-client';
export type { RoomRouter };
export interface RealmApplicationConfig {
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

export interface RealmApplicationModule {
  name: string;
  instance: (app: RealmApplication) => void | Promise<void>;
  async: boolean;
  timeout: number;
  unsavedGames: any[];
}

export interface RealmApplicationModules {
  [key: string]: (app: RealmApplication) => void | Promise<void>;
}

export interface RealmApplication {
  config: RealmApplicationConfig;
  server: Express;
  isHttps: boolean;
  https?: HttpsServer;
  http?: HttpServer;
  io: SocketServer;
  subProcesses: any[];
  moduleConfig: RealmApplicationModule[];
  modules: Record<string, RealmApplicationModule>;
  seerList: string[];
  adminList: string[];
  modList: string[];
  sockets: Record<string, any>;
  version: string;
  endpoint: string;
  rooms: Record<string, RoomServer>;
  profiles: Record<string, Profile>;
  web3: any; // Assume web3 is a configured instance
  secrets: any; // Secrets for signing
}

export interface RealmApplicationRouterContext {
  client: any;
  socket: any;
}

export interface Seer {
  router: SeerRouter;
}

export interface Profile {
  address: string;
}

export interface RealmClient {
  id: string;
  name: string;
  ip: string;
  info: any;
  lastReportedTime: number;
  isMod: boolean;
  isAdmin: boolean;
  log: {
    clientDisconnected: number;
  };
}

export interface Character {
  id: string;
  name: string;
  level: number;
  class: string;
}

export class RoomServer {
  app: RoomApplication;
  endpoint: string;
  key: string;
  bridge?: ReturnType<typeof createTRPCProxyClient<RoomRouter>>;
  router?: ReturnType<typeof t.router>;
  socket?: any;
  id: string;
  info: undefined;
  isAuthed: boolean;
  characters: Record<string, Character>;
  process: any;
  spawnPort: any;
}

export type Orb = {
  id: string;
  type: number;
  points: number;
  scale: number;
  enabledAt: number; // Timestamp or milliseconds
  position: Position;
};

export interface RoomApplication {
  io: any;
  state: any;
  realm: any; // ReturnType<typeof createClient>;
  config: any;
  // guestNames: string[];
  // serverVersion: string;
  // observers: any[];
  // roundLoopTimeout?: NodeJS.Timeout;
  // addressToUsername: Record<string, string>;
  // announceReboot: boolean;
  // rebootAfterRound: boolean;
  // debugQueue: boolean;
  // killSameNetworkClients: boolean;
  // sockets: Record<string, any>;
  // clientLookup: Record<string, Client>;
  // powerups: any[];
  // powerupLookup: Record<string, any>;
  // currentReward?: any;
  // orbs: any[];
  // orbLookup: Record<string, any>;
  // eventQueue: any[];
  // clients: Client[];
  // lastReward?: any;
  // lastLeaderName?: string;
  // config: Partial<Config>;
  // sharedConfig: Partial<Config>;
  // baseConfig: Partial<Config>;
  // round: {
  //   startedAt: number;
  //   endedAt: number | null;
  //   events: any[];
  //   states: any[];
  //   clients: Client[];
  // };
  // ranks: Record<string, any>;
  // ioCallbacks: Record<string, any>;
  // pandas: string[];
  // rateLimitWindow: number;
  // maxRequestsPerWindow: number;
  // requestTimestamps: Record<string, number[]>;
  // loggableEvents: string[];
  // currentPreset: any;
  // roundConfig: Config;
  // spawnBoundary1: Boundary;
  // spawnBoundary2: Boundary;
  // mapBoundary: Boundary;
  // clientSpawnPoints: Position[];
  // lastFastGameloopTime: number;
  // lastFastestGameloopTime: number;
}

export interface RoomClient {
  socket: any;
  name: string;
  id: string;
  startedRoundAt: number | null;
  avatar: number | null;
  network: string | null;
  address: string | null;
  device: string | null;
  position: Position;
  target: Position;
  clientPosition: Position;
  clientTarget: Position;
  phasedPosition: Position;
  rotation: any;
  xp: number;
  maxHp: number;
  latency: number;
  kills: number;
  killStreak: number;
  deaths: number;
  points: number;
  evolves: number;
  powerups: number;
  rewards: number;
  orbs: number;
  pickups: any[];
  isMod: boolean;
  isSeer: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  isMasterClient: boolean;
  isDisconnected: boolean;
  isDead: boolean;
  isJoining: boolean;
  isSpectating: boolean;
  isStuck: boolean;
  isGod: boolean;
  isRealm: boolean;
  isGuest: boolean;
  isInvincible: boolean;
  isPhased: boolean;
  overrideSpeed: number | null;
  overrideCameraSize: number | null;
  cameraSize: number;
  speed: number;
  joinedAt: number;
  invincibleUntil: number;
  decayPower: number;
  hash: string;
  lastReportedTime: number;
  lastUpdate: number;
  gameMode: string;
  phasedUntil: number;
  overrideSpeedUntil: number;
  joinedRoundAt: number;
  baseSpeed: number;
  lastTouchClientId: string;
  lastTouchTime: number;
  character: {
    meta: Record<number, number>;
  };
  log: {
    kills: string[];
    deaths: string[];
    revenge: number;
    resetPosition: number;
    phases: number;
    stuck: number;
    collided: number;
    timeoutDisconnect: number;
    speedProblem: number;
    clientDistanceProblem: number;
    outOfBounds: number;
    ranOutOfHealth: number;
    notReallyTrying: number;
    tooManyKills: number;
    killingThemselves: number;
    sameNetworkDisconnect: number;
    connectedTooSoon: number;
    clientDisconnected: number;
    positionJump: number;
    pauses: number;
    connects: number;
    path: string;
    positions: number;
    replay: any[];
    recentJoinProblem: number;
    usernameProblem: number;
    maintenanceJoin: number;
    signatureProblem: number;
    signinProblem: number;
    versionProblem: number;
    failedRealmCheck: number;
    spectating: number;
    addressProblem: number;
  };
}

export interface Position {
  x: number;
  y: number;
}

export interface Boundary {
  x: { min: number; max: number };
  y: { min: number; max: number };
}

export interface Signature {
  hash: string;
  address: string;
}

export type Reward = {
  id: string;
  rewardItemType: string | number;
  rewardItemName: string;
  quantity: number;
  position: Position;
  winner?: RoomClient;
};

export type PowerUp = {
  id: string;
  type: number | string;
  scale: number;
  position: Position;
};

export type RoundEvent = {
  type: string;
  name: string;
  args: any[];
  client?: string; // Optional client ID, depending on the event
};

// type Client = {
//   id: string;
//   name: string;
//   address: string;
//   [key: string]: any; // Additional client properties as needed
// };

export type Round = {
  id: string;
  startedAt: number; // or Date if using Date objects
  endedAt: number | null;
  clients: RoomClient[];
  events: RoundEvent[];
  states: any[];
};

export type Preset = {
  gameMode: string;
  isOmit?: boolean;
  maxEvolves?: number;
  pointsPerEvolve?: number;
  pointsPerKill?: number;
  damagePerTouch?: number;
  orbOnDeathPercent?: number;
  orbTimeoutSeconds?: number;
  orbCutoffSeconds?: number;
  decayPower?: number;
  baseSpeed?: number;
  checkPositionDistance?: number;
  checkInterval?: number;
  roundLoopSeconds?: number;
  avatarSpeedMultiplier?: number[];
  avatarDecayPower?: number[];
  preventBadKills?: boolean;
  antifeed1?: boolean;
  antifeed2?: boolean;
  antifeed3?: boolean;
  noDecay?: boolean;
  noBoot?: boolean;
  leadercap?: boolean;
  fastLoopSeconds?: number;
  [key: string]: any; // Additional properties as needed
};

export enum Mechanic {
  RewardsIncrease = 1150, // +rewards %
  RewardsDecrease = 1160, // -rewards %
  MovementBurstOnKill = 1222, // % Movement Burst On Kill
  MovementBurstOnEvolve = 1223, // % Movement Burst On Evolve
  MovementBurstStrength = 1030, // % Movement Burst Strength
  AvoidDeathPenalty = 1102, // % Avoid Death Penalty
  DoublePickupChance = 1164, // % Double Pickup Chance
  IncreasedHealthOnKill = 1219, // % Increased Health On Kill
  EnergyDecay = 1105, // % Energy Decay
  SpriteFuel = 1117, // % Sprite Fuel
}

export interface RoomContext {
  client: RoomClient;
}

export type Event = {
  name: string;
  args: Array<any>;
};
