import { sleep } from '@arken/node/util/time';
import axios from 'axios';
import semver from 'semver/preload.js';
import {
  log as logger,
  getTime,
  logError,
  shuffleArray,
  randomPosition,
  sha256,
  decodePayload,
  isNumeric,
  ipHashFromSocket,
} from '@arken/node/util';
import path from 'path';
import shortId from 'shortid';
import { initTRPC, TRPCError } from '@trpc/server';
import { createClient } from './trpc-client';
import mapData from './public/data/map.json';
import { UnsavedGame } from '../models';
import { z } from 'zod';
import { customErrorFormatter, validateMod } from '@arken/node/util/rpc';
import { testMode, baseConfig, sharedConfig, Config } from './config';
import { presets } from './presets';

let app: App;
const t = initTRPC
  .context<{
    socket: any;
    client: Client;
  }>()
  .create();

type Orb = {
  id: string;
  type: number;
  points: number;
  scale: number;
  enabledAt: number; // Timestamp or milliseconds
  position: Position;
};

interface App {
  io: any;
  state: any;
  realm: ReturnType<typeof createClient>;
  guestNames: string[];
  serverVersion: string;
  observers: any[];
  roundLoopTimeout?: NodeJS.Timeout;
  addressToUsername: Record<string, string>;
  announceReboot: boolean;
  rebootAfterRound: boolean;
  debugQueue: boolean;
  killSameNetworkClients: boolean;
  sockets: Record<string, any>;
  clientLookup: Record<string, Client>;
  powerups: any[];
  powerupLookup: Record<string, any>;
  currentReward?: any;
  orbs: any[];
  orbLookup: Record<string, any>;
  eventQueue: any[];
  clients: Client[];
  lastReward?: any;
  lastLeaderName?: string;
  config: Partial<Config>;
  sharedConfig: Partial<Config>;
  baseConfig: Partial<Config>;
  round: {
    startedAt: number;
    endedAt: number | null;
    events: any[];
    states: any[];
    players: Client[];
  };
  ranks: Record<string, any>;
  ioCallbacks: Record<string, any>;
  pandas: string[];
  rateLimitWindow: number;
  maxRequestsPerWindow: number;
  requestTimestamps: Record<string, number[]>;
  loggableEvents: string[];
  currentPreset: any;
  roundConfig: Config;
  spawnBoundary1: Boundary;
  spawnBoundary2: Boundary;
  mapBoundary: Boundary;
  playerSpawnPoints: Position[];
  lastFastGameloopTime: number;
  lastFastestGameloopTime: number;
}

interface Client {
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
  lastTouchPlayerId: string;
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
  };
}

interface Position {
  x: number;
  y: number;
}

interface Boundary {
  x: { min: number; max: number };
  y: { min: number; max: number };
}

function log(...args: any[]) {
  logger(...args);
}

interface Signature {
  hash: string;
  address: string;
}

type Reward = {
  id: string;
  rewardItemType: string | number;
  rewardItemName: string;
  quantity: number;
  position: Position;
};

type PowerUp = {
  id: string;
  type: number | string;
  scale: number;
  position: Position;
};

type RoundEvent = {
  type: string;
  name: string;
  args: any[];
  player?: string; // Optional player ID, depending on the event
};

// type Client = {
//   id: string;
//   name: string;
//   address: string;
//   [key: string]: any; // Additional player properties as needed
// };

type Round = {
  id: string;
  startedAt: number; // or Date if using Date objects
  endedAt: number | null;
  players: Client[];
  events: RoundEvent[];
  states: any[];
};

type Preset = {
  gameMode: string;
  isOmit: boolean;
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

class GameWorld {
  io: any;
  state: any;
  realm: ReturnType<typeof createClient>;
  guestNames: string[];
  serverVersion: string;
  observers: any[];
  roundLoopTimeout?: NodeJS.Timeout;
  addressToUsername: Record<string, string>;
  announceReboot: boolean;
  rebootAfterRound: boolean;
  debugQueue: boolean;
  killSameNetworkClients: boolean;
  sockets: Record<string, any>;
  clientLookup: Record<string, Client>;
  powerups: PowerUp[];
  powerupLookup: Record<string, PowerUp>;
  currentReward?: Reward;
  orbs: Orb[];
  orbLookup: Record<string, Orb>;
  eventQueue: any[];
  clients: Client[];
  lastReward?: Reward;
  lastLeaderName?: string;
  config: Partial<Config>;
  sharedConfig: Partial<Config>;
  baseConfig: Partial<Config>;
  round: Round;
  ranks: Record<string, any>;
  pandas: string[];
  rateLimitWindow: number;
  maxRequestsPerWindow: number;
  requestTimestamps: Record<string, number[]>;
  loggableEvents: string[];
  currentPreset: Preset;
  roundConfig: Config;
  spawnBoundary1: Boundary;
  spawnBoundary2: Boundary;
  mapBoundary: Boundary;
  eventFlushedAt: number;
  playerSpawnPoints: Position[];
  lastFastGameloopTime: number;
  lastFastestGameloopTime: number;

  constructor(app: App) {
    this.realm = createClient();
    this.guestNames = [
      'Robin Banks',
      'Rick Axely',
      'Shorty McAngrystout',
      'Whiffletree',
      'Thistlebutt',
      'The Potato',
      'Gumbuns Moonbrain',
      'Drakus',
      'Nyx',
      'Aedigarr',
      'Vaergahl',
      'Anbraxas',
      'Rezoth',
      'Felscathor',
      'Kathax',
      'Rokk',
      'Terra',
      'Valaebal',
      'Nox',
      'Ulfryz',
      "X'ek",
      'Bastis',
      'Draugh',
      'Raek',
      'Zyphon',
      'Smaug',
    ];
    this.serverVersion = '2.0.0';
    this.observers = [];
    this.roundLoopTimeout;
    this.addressToUsername = {};
    this.announceReboot = false;
    this.rebootAfterRound = false;
    this.debugQueue = false;
    this.killSameNetworkClients = true;
    this.sockets = {};
    this.clientLookup = {};
    this.powerups = [];
    this.powerupLookup = {};
    this.currentReward = undefined;
    this.orbs = [];
    this.orbLookup = {};
    this.eventQueue = [];
    this.clients = [];
    this.lastReward = undefined;
    this.lastLeaderName = undefined;
    this.eventFlushedAt = getTime();
    this.round = { startedAt: Math.round(getTime() / 1000), endedAt: null, events: [], states: [], players: [] };
    this.ranks = {};
    this.realmServer = { socket: undefined };
    this.ioCallbacks = {};
    this.pandas = [
      '0x150F24A67d5541ee1F8aBce2b69046e25d64619c',
      '0x3551691499D740790C4511CDBD1D64b2f146f6Bd',
      '0x1a367CA7bD311F279F1dfAfF1e60c4d797Faa6eb',
      '0x82b644E1B2164F5B81B3e7F7518DdE8E515A419d',
      '0xeb3fCb993dDe8a2Cd081FbE36238E4d64C286AC0',
    ];
    this.rateLimitWindow = 60 * 1000;
    this.maxRequestsPerWindow = 5;
    this.requestTimestamps = {};
    this.realm = undefined;
    this.loggableEvents = ['onMaintenance', 'saveRound'];
    this.currentPreset = presets[Math.floor(Math.random() * presets.length)];
    this.baseConfig = baseConfig;
    this.sharedConfig = sharedConfig;
    this.config = { ...baseConfig, ...sharedConfig };
    this.roundConfig = { ...baseConfig, ...sharedConfig, ...this.currentPreset };
    this.spawnBoundary1 = { x: { min: -17, max: 0 }, y: { min: -13, max: -4 } };
    this.spawnBoundary2 = { x: { min: -37, max: 0 }, y: { min: -13, max: -2 } };
    this.mapBoundary = { x: { min: -38, max: 2 }, y: { min: -20, max: 2 } };
    this.playerSpawnPoints = [
      { x: -4.14, y: -11.66 },
      { x: -11.14, y: -8.55 },
      { x: -12.27, y: -14.24 },
      { x: -7.08, y: -12.75 },
      { x: -7.32, y: -15.29 },
    ];
    this.lastFastGameloopTime = getTime();
    this.lastFastestGameloopTime = getTime();
  }

  init() {
    if (Object.keys(app.clientLookup).length == 0) {
      this.randomRoundPreset();
      this.clearSprites();
      this.spawnSprites(app.config.spritesStartCount);
    }
    setTimeout(() => this.monitorObservers(), 30 * 1000);
    setTimeout(() => this.fastGameloop(), app.config.fastLoopSeconds * 1000);
    setTimeout(() => this.slowGameloop(), app.config.slowLoopSeconds * 1000);
    setTimeout(() => this.sendUpdates(), app.config.sendUpdateLoopSeconds * 1000);
    setTimeout(() => this.spawnRewards(), app.config.rewardSpawnLoopSeconds * 1000);
    setTimeout(() => this.checkConnectionLoop(), app.config.checkConnectionLoopSeconds * 1000);
    app.roundLoopTimeout = setTimeout(function () {
      this.resetLeaderboard();
    }, app.config.roundLoopSeconds * 1000);
  }

  monitorObservers(): void {
    this.updateObservers();

    if (this.observers.length === 0) {
      this.emitAll('onBroadcast', `Realm not connected. Contact support.`, 0);
      this.disconnectAllClients();
    }

    setTimeout(() => this.monitorObservers(), 5 * 1000);
  }

  fastGameloop(): void {
    try {
      const now = this.getTime();

      this.detectCollisions();

      for (let i = 0; i < this.clients.length; i++) {
        const client = this.clients[i];

        if (client.isDisconnected || client.isDead || client.isSpectating || client.isJoining) continue;

        const currentTime = Math.round(now / 1000);
        const isInvincible =
          this.config.isGodParty ||
          client.isSpectating ||
          client.isGod ||
          client.isInvincible ||
          client.invincibleUntil > currentTime;
        const isPhased = client.isPhased ? true : now <= client.phasedUntil;

        if (client.isPhased && now > client.phasedUntil) {
          client.isPhased = false;
          client.phasedUntil = 0;
        }

        if (client.overrideSpeed && client.overrideSpeedUntil && now > client.overrideSpeedUntil) {
          client.overrideSpeed = null;
          client.overrideSpeedUntil = 0;
        }

        client.speed = this.getClientSpeed(client, this.config);

        if (!this.config.isRoundPaused && this.config.gameMode !== 'Pandamonium') {
          let decay = this.config.noDecay
            ? 0
            : ((client.avatar + 1) / (1 / this.config.fastLoopSeconds)) *
              ((this.config['avatarDecayPower' + client.avatar] || 1) * this.config.decayPower);

          if (this.isMechanicEnabled(client, 1105) && this.isMechanicEnabled(client, 1104)) {
            decay = decay * (1 + (client.character.meta[1105] - client.character.meta[1104]) / 100);
          }

          this.handleClientDecay(client, decay, now, isInvincible, currentTime);
        }

        client.latency = (now - client.lastReportedTime) / 2;

        if (Number.isNaN(client.latency)) {
          client.latency = 0;
        }

        if (this.config.gameMode === 'Pandamonium' && this.pandas.includes(client.address)) {
          client.avatar = 2;
        }

        this.emitUpdatePlayer(client, isInvincible, isPhased, now);
      }

      this.flushEventQueue();

      if (this.config.gameMode === 'Hayai') {
        this.adjustGameSpeed();
      }

      this.checkBattleRoyaleEnd();

      this.lastFastGameloopTime = now;
    } catch (e) {
      log('Error:', e);
      this.disconnectAllClients();
      setTimeout(() => process.exit(1), 2 * 1000);
    }

    setTimeout(() => this.fastGameloop(), this.config.fastLoopSeconds * 1000);
  }

  disconnectAllClients(): void {
    if (this.clients.length === 0) return;

    log('Disconnecting all players');

    for (const client of this.clients) {
      this.disconnectClient(client, 'disconnect all players');
    }
  }

  handleClientDecay(client: Client, decay: number, now: number, isInvincible: boolean, currentTime: number): void {
    if (client.xp > client.maxHp) {
      if (decay > 0) {
        if (client.avatar < this.config.maxEvolves - 1) {
          client.xp = client.xp - client.maxHp;
          client.avatar = Math.max(
            Math.min(client.avatar + 1 * this.config.avatarDirection, this.config.maxEvolves - 1),
            0
          );
          client.evolves += 1;
          client.points += this.config.pointsPerEvolve;

          if (this.config.leadercap && client.name === this.lastLeaderName) {
            client.speed = client.speed * 0.8;
          }

          if (this.isMechanicEnabled(client, 1223) && client.character.meta[1223] > 0) {
            client.overrideSpeedUntil = this.getTime() + 1000;
            client.overrideSpeed = client.speed * (1 + client.character.meta[1223] / 100);

            if (this.isMechanicEnabled(client, 1030) && client.character.meta[1030] > 0) {
              client.overrideSpeed = client.overrideSpeed * (1 + client.character.meta[1030] / 100);
            }
          }

          this.emitAll('onUpdateEvolution', client.id, client.avatar, client.overrideSpeed || client.speed);
        } else {
          client.xp = client.maxHp;
        }
      } else {
        if (client.avatar >= this.config.maxEvolves - 1) {
          client.xp = client.maxHp;
        } else {
          client.xp = client.xp - client.maxHp;
          client.avatar = Math.max(
            Math.min(client.avatar + 1 * this.config.avatarDirection, this.config.maxEvolves - 1),
            0
          );
          client.evolves += 1;
          client.points += this.config.pointsPerEvolve;

          if (this.config.leadercap && client.name === this.lastLeaderName) {
            client.speed = client.speed * 0.8;
          }

          if (this.isMechanicEnabled(client, 1223) && client.character.meta[1223] > 0) {
            client.overrideSpeedUntil = this.getTime() + 1000;
            client.overrideSpeed = client.speed * (1 + client.character.meta[1223] / 100);

            if (this.isMechanicEnabled(client, 1030) && client.character.meta[1030] > 0) {
              client.overrideSpeed = client.overrideSpeed * (1 + client.character.meta[1030] / 100);
            }
          }

          this.emitAll('onUpdateEvolution', client.id, client.avatar, client.overrideSpeed || client.speed);
        }
      }
    } else {
      if (!isInvincible) {
        client.xp -= decay * client.decayPower;
      }

      if (client.xp <= 0) {
        client.xp = 0;

        if (decay > 0) {
          if (client.avatar === 0) {
            const isNew = client.joinedAt >= currentTime - this.config.immunitySeconds;

            if (!this.config.noBoot && !isInvincible && !isNew && !this.config.isGodParty) {
              client.log.ranOutOfHealth += 1;

              if (client.lastTouchTime > now - 2000) {
                this.registerKill(this.app, this.clientLookup[client.lastTouchPlayerId], client);
              } else {
                this.disconnectClient(client, 'starved');
              }
            }
          } else {
            client.xp = client.maxHp;
            client.avatar = Math.max(
              Math.min(client.avatar - 1 * this.config.avatarDirection, this.config.maxEvolves - 1),
              0
            );

            if (this.config.leadercap && client.name === this.lastLeaderName) {
              client.speed = client.speed * 0.8;
            }

            this.emitAll('onUpdateRegression', client.id, client.avatar, client.overrideSpeed || client.speed);
          }
        } else {
          if (client.avatar === 0) {
            client.xp = 0;
          } else {
            client.xp = client.maxHp;
            client.avatar = Math.max(
              Math.min(client.avatar - 1 * this.config.avatarDirection, this.config.maxEvolves - 1),
              0
            );

            if (this.config.leadercap && client.name === this.lastLeaderName) {
              client.speed = client.speed * 0.8;
            }

            this.emitAll('onUpdateRegression', client.id, client.avatar, client.overrideSpeed || client.speed);
          }
        }
      }
    }
  }

  registerKill(winner: Client, loser: Client): void {
    const now = this.getTime();

    if (this.config.isGodParty) return;
    if (winner.isInvincible || loser.isInvincible) return;
    if (winner.isGod || loser.isGod) return;
    if (winner.isDead) return;

    if (this.config.gameMode !== 'Pandamonium' || !this.pandas.includes(winner.address)) {
      if (this.config.preventBadKills && (winner.isPhased || now < winner.phasedUntil)) return;

      const totalKills = winner.log.kills.filter((h) => h === loser.hash).length;
      const notReallyTrying = this.config.antifeed1
        ? (totalKills >= 2 && loser.kills < 2 && loser.rewards <= 1) ||
          (totalKills >= 2 && loser.kills < 2 && loser.powerups <= 100)
        : false;
      const tooManyKills = this.config.antifeed2
        ? this.clients.length > 2 &&
          totalKills >= 5 &&
          totalKills > winner.log.kills.length / this.clients.filter((c) => !c.isDead).length
        : false;
      const killingThemselves = this.config.antifeed3 ? winner.hash === loser.hash : false;
      const allowKill = !notReallyTrying && !tooManyKills;

      if (notReallyTrying) {
        loser.log.notReallyTrying += 1;
      }
      if (tooManyKills) {
        loser.log.tooManyKills += 1;
        return;
      }
      if (killingThemselves) {
        loser.log.killingThemselves += 1;
      }

      if (this.config.preventBadKills && !allowKill) {
        loser.phasedUntil = this.getTime() + 2000;
        return;
      }
    }

    if (this.config.gameMode === 'Pandamonium' && !this.pandas.includes(winner.address)) {
      return;
    }

    loser.xp -= this.config.damagePerTouch;
    winner.xp -= this.config.damagePerTouch;

    const time = this.getTime();

    loser.overrideSpeed = 2.5;
    loser.overrideSpeedUntil = time + 2000;

    winner.overrideSpeed = 2.5;
    winner.overrideSpeedUntil = time + 2000;

    if (loser.avatar !== 0 || loser.xp > 0) {
      loser.lastTouchPlayerId = winner.id;
      winner.lastTouchPlayerId = loser.id;
      loser.lastTouchTime = time;
      winner.lastTouchTime = time;
      return;
    }

    winner.kills += 1;
    winner.killStreak += 1;
    winner.points += this.config.pointsPerKill * (loser.avatar + 1);
    winner.log.kills.push(loser.hash);

    let deathPenaltyAvoid = false;

    if (this.isMechanicEnabled(loser, 1102) && loser.character.meta[1102] > 0) {
      const r = this.random(1, 100);

      if (r <= loser.character.meta[1102]) {
        deathPenaltyAvoid = true;
        this.emitAll('onBroadcast', `${loser.name} avoided penalty!`, 0);
      }
    }

    let orbOnDeathPercent =
      this.config.orbOnDeathPercent > 0
        ? this.config.leadercap && loser.name === this.lastLeaderName
          ? 50
          : this.config.orbOnDeathPercent
        : 0;
    let orbPoints = Math.floor(loser.points * (orbOnDeathPercent / 100));

    if (deathPenaltyAvoid) {
      orbOnDeathPercent = 0;
      orbPoints = 0;
    } else {
      loser.points = Math.floor(loser.points * ((100 - orbOnDeathPercent) / 100));
    }

    loser.deaths += 1;
    loser.killStreak = 0;
    loser.isDead = true;
    loser.log.deaths.push(winner.hash);

    if (winner.points < 0) winner.points = 0;
    if (loser.points < 0) loser.points = 0;

    if (winner.log.deaths.length && winner.log.deaths[winner.log.deaths.length - 1] === loser.hash) {
      winner.log.revenge += 1;
    }

    if (this.isMechanicEnabled(winner, 1222) && winner.character.meta[1222] > 0) {
      winner.overrideSpeed =
        winner.speed * (1 + winner.character.meta[1222] / 100) * (1 + winner.character.meta[1030] / 100);
      winner.overrideSpeedUntil = this.getTime() + 5000;
    }

    if (this.isMechanicEnabled(winner, 1219) && winner.character.meta[1219] > 0) {
      winner.maxHp = winner.maxHp * (1 + winner.character.meta[1219] / 100);
    }

    winner.xp += 25;

    if (winner.xp > winner.maxHp) winner.xp = winner.maxHp;

    this.emitAll('onGameOver', loser.id, winner.id);

    this.disconnectClient(loser, 'got killed');

    const orb: Orb = {
      id: shortId.generate(),
      type: 4,
      points: orbPoints,
      scale: orbPoints,
      enabledAt: now + this.config.orbTimeoutSeconds * 1000,
      position: {
        x: loser.position.x,
        y: loser.position.y,
      },
    };

    const currentRound = this.config.roundId;

    if (this.config.orbOnDeathPercent > 0 && !this.roundEndingSoon(this.config.orbCutoffSeconds)) {
      setTimeout(() => {
        if (this.config.roundId !== currentRound) return;

        this.orbs.push(orb);
        this.orbLookup[orb.id] = orb;

        this.emitAll('onSpawnPowerUp', orb.id, orb.type, orb.position.x, orb.position.y, orb.scale);
      }, this.config.orbTimeoutSeconds * 1000);
    }
  }

  adjustGameSpeed(): void {
    const timeStep = 5 * 60 * (this.config.fastLoopSeconds * 1000);
    const speedMultiplier = 0.25;

    this.config.baseSpeed += this.normalizeFloat((5 * speedMultiplier) / timeStep);
    this.config.checkPositionDistance += this.normalizeFloat((6 * speedMultiplier) / timeStep);
    this.config.checkInterval += this.normalizeFloat((3 * speedMultiplier) / timeStep);
  }

  checkBattleRoyaleEnd(): void {
    const totalAlivePlayers = this.clients.filter((client) => !client.isGod && !client.isSpectating && !client.isDead);

    if (this.config.isBattleRoyale && totalAlivePlayers.length === 1) {
      this.emitAll('onBroadcast', `${totalAlivePlayers[0].name} is the last dragon standing`, 3);

      this.baseConfig.isBattleRoyale = false;
      this.config.isBattleRoyale = false;
      this.baseConfig.isGodParty = true;
      this.config.isGodParty = true;
    }
  }

  getTime(): number {
    return Date.now();
  }

  async connected(input: { signature: string }, ctx: { socket: any; client: Client }) {
    const { socket, client } = ctx;

    // Set the connected socket in the realm server state
    this.realmServer.socket = socket;

    // Disconnect any observers from the same network
    const sameNetworkObservers = this.observers.filter((r) => r.hash === client.hash);
    for (const observer of sameNetworkObservers) {
      this.disconnectClient(observer, 'same network observer');
    }

    // Add the current socket as an observer
    const observer = { socket };
    this.observers.push(observer);
    client.isRealm = true;

    // Initialize the realm server with status 1
    const res = await this.realm.router.init.mutate();
    log('init', res);

    // Check if initialization was successful
    if (res?.status !== 1) {
      logError('Could not init');
      return { status: 0 };
    }

    // Update app configuration based on the response
    this.baseConfig.id = res.id;
    this.config.id = res.id;
    this.baseConfig.roundId = res.data.roundId;
    this.config.roundId = res.data.roundId;

    return { status: 1 };
  }

  weightedRandom(items: { weight: number }[]): any {
    let table = items.flatMap((item) => Array(item.weight).fill(item));
    return table[Math.floor(Math.random() * table.length)];
  }

  randomRoundPreset(): void {
    const gameMode = this.config.gameMode;
    while (this.config.gameMode === gameMode) {
      const filteredPresets = presets.filter((p) => !p.isOmit);
      this.currentPreset = this.weightedRandom(filteredPresets);
      this.roundConfig = { ...this.baseConfig, ...this.sharedConfig, ...this.currentPreset };
      log('randomRoundPreset', this.config.gameMode, gameMode, this.currentPreset);
      this.config = JSON.parse(JSON.stringify(this.roundConfig));
    }
  }

  removeSprite(id: string): void {
    if (this.powerupLookup[id]) {
      delete this.powerupLookup[id];
    }
    for (let i = 0; i < this.powerups.length; i++) {
      if (this.powerups[i].id === id) {
        this.powerups.splice(i, 1);
        break;
      }
    }
  }

  removeOrb(id: string): void {
    if (this.orbLookup[id]) {
      delete this.orbLookup[id];
    }
    for (let i = 0; i < this.orbs.length; i++) {
      if (this.orbs[i].id === id) {
        this.orbs.splice(i, 1);
        break;
      }
    }
  }

  removeReward(): void {
    if (!this.currentReward) return;
    this.emitAll('onUpdateReward', 'null', this.currentReward.id);
    this.currentReward = undefined;
  }

  getUnobstructedPosition(): Position {
    const spawnBoundary = this.config.level2open ? this.spawnBoundary2 : this.spawnBoundary1;
    let res: Position | null = null;
    while (!res) {
      let collided = false;
      const position = {
        x: randomPosition(spawnBoundary.x.min, spawnBoundary.x.max),
        y: randomPosition(spawnBoundary.y.min, spawnBoundary.y.max),
      };
      for (const gameObject of mapData) {
        if (!gameObject.Colliders || !gameObject.Colliders.length) continue;
        for (const gameCollider of gameObject.Colliders) {
          const collider = {
            minX: gameCollider.Min[0],
            maxX: gameCollider.Max[0],
            minY: gameCollider.Min[1],
            maxY: gameCollider.Max[1],
          };
          if (this.config.level2open && gameObject.Name === 'Level2Divider') {
            const diff = 25;
            collider.minY -= diff;
            collider.maxY -= diff;
          }
          if (
            position.x >= collider.minX &&
            position.x <= collider.maxX &&
            position.y >= collider.minY &&
            position.y <= collider.maxY
          ) {
            collided = true;
            break;
          }
        }
        if (collided) break;
      }
      if (!collided) {
        res = position;
      }
    }
    return res;
  }

  spawnSprites(amount: number): void {
    for (let i = 0; i < amount; i++) {
      const position = this.getUnobstructedPosition();
      const powerupSpawnPoint = { id: shortId.generate(), type: Math.floor(Math.random() * 4), scale: 1, position };
      this.powerups.push(powerupSpawnPoint);
      this.powerupLookup[powerupSpawnPoint.id] = powerupSpawnPoint;
      this.emitAll(
        'onSpawnPowerUp',
        powerupSpawnPoint.id,
        powerupSpawnPoint.type,
        powerupSpawnPoint.position.x,
        powerupSpawnPoint.position.y,
        powerupSpawnPoint.scale
      );
    }
    this.config.spritesTotal = this.powerups.length;
  }

  addToRecentPlayers(player: Client): void {
    if (!player.address || !player.name) return;
    this.round.players = this.round.players.filter((r) => r.address !== player.address);
    this.round.players.push(player);
  }

  roundEndingSoon(sec: number): boolean {
    const roundTimer = this.round.startedAt + this.config.roundLoopSeconds - Math.round(this.getTime() / 1000);
    return roundTimer < sec;
  }

  generateGuestName(): string {
    const randomIndex = Math.floor(Math.random() * this.guestNames.length);
    return this.guestNames[randomIndex];
  }

  async apiConnected() {
    this.emitAll('onBroadcast', 'API connected', 0);
    return { status: 1 };
  }

  async apiDisconnected() {
    this.emitAll('onBroadcast', 'API disconnected', 0);
    return { status: 1 };
  }

  broadcastMechanics(client: Client): void {
    if (this.isMechanicEnabled(client, 1150))
      this.emit(
        client,
        'onBroadcast',
        `${this.formatNumber(client.character.meta[1150] - client.character.meta[1160])}% Rewards`,
        0
      );
    if (this.isMechanicEnabled(client, 1222))
      this.emit(client, 'onBroadcast', `${this.formatNumber(client.character.meta[1222])}% Movement Burst On Kill`, 0);
    if (this.isMechanicEnabled(client, 1223))
      this.emit(
        client,
        'onBroadcast',
        `${this.formatNumber(client.character.meta[1223])}% Movement Burst On Evolve`,
        0
      );
    if (this.isMechanicEnabled(client, 1030))
      this.emit(client, 'onBroadcast', `${this.formatNumber(client.character.meta[1030])}% Movement Burst Strength`, 0);
    if (this.isMechanicEnabled(client, 1102))
      this.emit(client, 'onBroadcast', `${this.formatNumber(client.character.meta[1102])}% Avoid Death Penalty`, 0);
    if (this.isMechanicEnabled(client, 1164))
      this.emit(client, 'onBroadcast', `${this.formatNumber(client.character.meta[1164])}% Double Pickup Chance`, 0);
    if (this.isMechanicEnabled(client, 1219))
      this.emit(
        client,
        'onBroadcast',
        `${this.formatNumber(client.character.meta[1219])}% Increased Health On Kill`,
        0
      );
    if (this.isMechanicEnabled(client, 1105))
      this.emit(
        client,
        'onBroadcast',
        `${this.formatNumber(client.character.meta[1105] - client.character.meta[1104])}% Energy Decay`,
        0
      );
    if (this.isMechanicEnabled(client, 1117))
      this.emit(
        client,
        'onBroadcast',
        `${this.formatNumber(client.character.meta[1117] - client.character.meta[1118])}% Sprite Fuel`,
        0
      );
  }

  // Helper methods for `broadcastMechanics`
  isMechanicEnabled(client: Client, id: number): boolean {
    // Implementation to check if a mechanic is enabled
    return !!client.character.meta[id];
  }

  async setPlayerCharacter(input: { data: any }, ctx: { client: Client }) {
    const { client } = ctx;

    // Check if the client is a realm client
    if (!client.isRealm) {
      return { status: 0 };
    }

    // Find the client with the specified address
    const newClient = this.clients.find((c) => c.address === input.data.address);
    if (!newClient) {
      return { status: 0 };
    }

    // Update the character information
    newClient.character = {
      ...input.data.character,
      meta: { ...newClient.character.meta, ...input.data.character.meta },
    };

    return { status: 1 };
  }

  async setConfig(input: { data: any }) {
    return { status: 1 };
  }

  async getConfig() {
    return { status: 1, data: this.config };
  }

  async load(input, ctx: { socket: any; client: Client }) {
    const { client } = ctx;
    log('Load', client.hash);
    this.emit(client, 'OnLoaded', 1);
    return { status: 1 };
  }

  async spectate(input, ctx: { client: Client }) {
    const { client } = ctx;
    log('Spectate', client.address);
    this.spectateClient(client);
    return { status: 1 };
  }

  syncSprites() {
    log('Syncing sprites');
    const playerCount = this.clients.filter((c) => !c.isDead && !c.isSpectating && !c.isGod).length;
    const length = this.config.spritesStartCount + playerCount * this.config.spritesPerPlayerCount;

    if (this.powerups.length > length) {
      const deletedPoints = this.powerups.splice(length);
      for (let i = 0; i < deletedPoints.length; i++) {
        this.emitAll('onUpdatePickup', 'null', deletedPoints[i].id, 0);
      }
      this.config.spritesTotal = length;
    } else if (length > this.powerups.length) {
      this.spawnSprites(length - this.powerups.length);
    }
  }

  emitAllDirect(...args: any[]) {
    this.io.emit(...args);
  }

  flushEventQueue() {
    const now = this.getTime();
    if (this.eventQueue.length) {
      if (this.debugQueue) log('Sending queue', this.eventQueue);

      let recordDetailed = now - this.eventFlushedAt > 500;
      if (recordDetailed) {
        this.eventFlushedAt = now;
      }

      const compiled: string[] = [];
      for (const e of this.eventQueue) {
        const name = e[0];
        const args = e.slice(1);
        compiled.push(`["${name}","${args.join(':')}"]`);

        if (name === 'OnUpdatePlayer' || name === 'OnSpawnPowerup') {
          if (recordDetailed) {
            this.round.events.push({ type: 'emitAll', name, args });
          }
        } else {
          this.round.events.push({ type: 'emitAll', name, args });
        }

        if (this.loggableEvents.includes(name)) {
          console.log(`Publish Event: ${name}`, args);
        }
      }

      this.emitAllDirect('events', this.getPayload(compiled));
      this.eventQueue = [];
    }
  }

  disconnectClient(player: Client, reason = 'Unknown', immediate = false) {
    if (player.isRealm) return;

    this.clients = this.clients.filter((c) => c.id !== player.id);

    if (this.config.gameMode === 'Pandamonium') {
      this.emitAll(
        'onBroadcast',
        `${
          this.clients.filter(
            (c) => !c.isDead && !c.isDisconnected && !c.isSpectating && !this.pandas.includes(c.address)
          ).length
        } alive`,
        0
      );
    }

    if (player.isDisconnected) return;

    try {
      log(`Disconnecting (${reason})`, player.id, player.name);
      delete this.clientLookup[player.id];
      player.isDisconnected = true;
      player.isDead = true;
      player.joinedAt = 0;
      player.latency = 0;

      const oldSocket = this.sockets[player.id];
      setTimeout(
        () => {
          this.emitAll('onUserDisconnected', player.id);
          this.syncSprites();
          this.flushEventQueue();
          if (oldSocket && oldSocket.emit && oldSocket.connected) oldSocket.disconnect();
          delete this.sockets[player.id];
        },
        immediate ? 0 : 1000
      );
    } catch (e) {
      log('Error:', e);
    }
  }

  async setInfo(input: { msg: any }, ctx: { socket: any; client: Client }) {
    const { client } = ctx;
    log('SetInfo', input.msg);

    try {
      const pack = decodePayload(input.msg);
      if (!pack.signature || !pack.network || !pack.device || !pack.address) {
        client.log.signinProblem += 1;
        this.disconnectClient(client, 'signin problem');
        return { status: 0 };
      }

      const address = await this.normalizeAddress(pack.address);
      log('SetInfo normalizeAddress', pack.address, address);
      if (!address) {
        client.log.addressProblem += 1;
        this.disconnectClient(client, 'address problem');
        return { status: 0 };
      }

      if (
        !(await this.auth({
          signature: { data: 'evolution', hash: pack.signature.trim(), address },
        }))
      ) {
        client.log.signatureProblem += 1;
        this.disconnectClient(client, 'signature problem');
        return { status: 0 };
      }

      if (client.isBanned) {
        this.emit(client, 'OnBanned', true);
        this.disconnectClient(client, 'banned');
        return { status: 0 };
      }

      if (this.config.isMaintenance && !client.isMod) {
        client.log.maintenanceJoin += 1;
        this.emit(client, 'onMaintenance', true);
        this.disconnectClient(client, 'maintenance');
        return { status: 0 };
      }

      let name = this.addressToUsername[address] || (await this.getUsername(address)) || this.generateGuestName();
      this.addressToUsername[address] = name;
      if (['Testman', 'join'].includes(name)) {
        client.overrideCameraSize = 12;
      }

      log('User ' + name + ' with address ' + address + ' with hash ' + client.hash);

      const now = getTime();
      if (client.name !== name || client.address !== address) {
        client.name = name;
        client.address = address;
        client.network = pack.network;
        client.device = pack.device;
        const recentPlayer = this.round.players.find((r) => r.address === address);
        if (recentPlayer && now - recentPlayer.lastUpdate < 3000) {
          client.log.recentJoinProblem += 1;
          this.disconnectClient(client, 'joined too soon', true);
          return { status: 0 };
        }
        Object.assign(client, recentPlayer);
        client.log.connects += 1;
      }

      this.emitAll('onSetInfo', client.id, client.name, client.network, client.address, client.device);

      if (this.config.log.connections) {
        log('Connected', { hash: client.hash, address: client.address, name: client.name });
      }

      return { status: 1 };
    } catch (e) {
      log('Error:', e);
      return { status: 0, error: e.message };
    }
  }

  // Method to compare players by their points
  comparePlayers(a: Client, b: Client): number {
    if (a.points > b.points) return -1;
    if (a.points < b.points) return 1;
    return 0;
  }

  // Method to generate a random number between min and max (inclusive)
  random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Method to normalize an address through an external service
  async normalizeAddress(address: string): Promise<string | false> {
    if (!address) return false;
    try {
      const res = await this.realm.router.normalizeAddress.mutate({ address });
      log('normalizeAddressResponse', res);
      return res.address;
    } catch (e) {
      log('Error:', e);
      return false;
    }
  }

  // Method to verify if a signature request is valid
  async auth({ data, signature }: { data: string; signature: Signature }, { client }): Promise<boolean> {
    log('Verifying', data);

    if (!signature.address) return false;

    try {
      const res = await this.realm.router.auth.mutate({ data, signature });

      if (res.status !== 1) return false;

      client.isSeer = res.groups.includes('seer');
      client.isAdmin = res.groups.includes('admin');
      client.isMod = res.groups.includes('mod');
    } catch (e) {
      log('Error:', e);
      return false;
    }

    return true;
  }

  // Method to format a number as a string with a sign
  formatNumber(num: number): string {
    return num >= 0 ? '+' + num : '-' + num;
  }

  // Method to calculate the speed of a client based on their config and base speed
  getClientSpeed(client: Client, config: Config): number {
    return this.normalizeFloat(
      this.config.baseSpeed * this.config['avatarSpeedMultiplier' + client.avatar!] * client.baseSpeed
    );
  }

  // Assume normalizeFloat is defined elsewhere in the class
  normalizeFloat(value: number, precision: number = 2): number {
    return parseFloat(value.toFixed(precision));
  }

  async joinRoom(ctx: { client: Client }) {
    const { client } = ctx;
    log('JoinRoom', client.id, client.hash);

    try {
      const confirmUser = await this.realm.router.confirmUser.mutate({ address: client.address });

      if (confirmUser?.status !== 1) {
        client.log.failedRealmCheck += 1;
        this.disconnectClient(client, 'failed realm check');
        return { status: 0 };
      }

      if (confirmUser.isMod) {
        client.isMod = true;
      }

      const now = getTime();
      const recentPlayer = this.round.players.find((r) => r.address === client.address);

      if (recentPlayer && now - recentPlayer.lastUpdate < 3000) {
        client.log.connectedTooSoon += 1;
        this.disconnectClient(client, 'connected too soon');
        return { status: 0 };
      }

      if (this.config.isMaintenance && !client.isMod) {
        this.emit(client, 'onMaintenance', true);
        this.disconnectClient(client, 'maintenance');
        return { status: 0 };
      }

      client.isJoining = true;
      client.avatar = this.config.startAvatar;
      client.speed = this.getClientSpeed(client);

      if (this.config.gameMode === 'Pandamonium' && this.pandas.includes(client.address)) {
        client.avatar = 2;
        this.emit(client, 'onUpdateEvolution', client.id, client.avatar, client.speed);
      }

      log('[INFO] player ' + client.id + ': logged!');
      log('[INFO] Total players: ' + Object.keys(this.clientLookup).length);

      const roundTimer = this.round.startedAt + this.config.roundLoopSeconds - Math.round(getTime() / 1000);
      this.emit(
        client,
        'onSetPositionMonitor',
        `${Math.round(this.config.checkPositionDistance)}:${Math.round(this.config.checkInterval)}:${Math.round(
          this.config.resetInterval
        )}`
      );
      this.emit(
        client,
        'onJoinGame',
        client.id,
        client.name,
        client.avatar,
        client.isMasterClient ? 'true' : 'false',
        roundTimer,
        client.position.x,
        client.position.y
      );

      if (this.observers.length === 0) {
        this.emit(client, 'onBroadcast', `Realm not connected. Contact support.`, 0);
        this.disconnectClient(client, 'realm not connected');
        return { status: 0 };
      }

      if (!this.config.isRoundPaused) {
        this.emit(
          client,
          'onSetRoundInfo',
          `${roundTimer}:${this.getRoundInfo().join(':')}:${this.getGameModeGuide().join(':')}`
        );
        this.emit(client, 'onBroadcast', `Game Mode - ${this.config.gameMode} (Round ${this.config.roundId})`, 0);
      }

      this.syncSprites();

      if (this.config.hideMap) {
        this.emit(client, 'onHideMinimap');
        this.emit(client, 'onBroadcast', `Minimap hidden in this mode!`, 2);
      }

      if (this.config.level2open) {
        this.emit(client, 'onOpenLevel2');
        this.emit(client, 'onBroadcast', `Wall going down!`, 0);
      } else {
        this.emit(client, 'onCloseLevel2');
      }

      for (const otherClient of this.clients) {
        if (
          otherClient.id === client.id ||
          otherClient.isDisconnected ||
          otherClient.isDead ||
          otherClient.isSpectating ||
          otherClient.isJoining
        )
          continue;

        this.emit(
          client,
          'onSpawnPlayer',
          otherClient.id,
          otherClient.name,
          otherClient.speed,
          otherClient.avatar,
          otherClient.position.x,
          otherClient.position.y,
          otherClient.position.x,
          otherClient.position.y
        );
      }

      for (const powerup of this.powerups) {
        this.emit(
          client,
          'onSpawnPowerUp',
          powerup.id,
          powerup.type,
          powerup.position.x,
          powerup.position.y,
          powerup.scale
        );
      }

      for (const orb of this.orbs) {
        this.emit(client, 'onSpawnPowerUp', orb.id, orb.type, orb.position.x, orb.position.y, orb.scale);
      }

      if (this.currentReward) {
        this.emit(
          client,
          'onSpawnReward',
          this.currentReward.id,
          this.currentReward.rewardItemType,
          this.currentReward.rewardItemName,
          this.currentReward.quantity,
          this.currentReward.position.x,
          this.currentReward.position.y
        );
      }

      client.lastUpdate = getTime();
      return { status: 1 };
    } catch (e) {
      log('Error:', e);
      this.disconnectClient(client, 'not sure: ' + e);
      return { status: 0 };
    }
  }

  async updateMyself(ctx: { client: Client }, input: { msg: string }) {
    const { client } = ctx;

    if (client.isDead && !client.isJoining) return { status: 0 };
    if (client.isSpectating) return { status: 0 };
    if (this.config.isMaintenance && !client.isMod) {
      this.emit(client, 'onMaintenance', true);
      this.disconnectClient(client, 'maintenance');
      return { status: 0 };
    }

    const now = getTime();
    if (now - client.lastUpdate < this.config.forcedLatency) return { status: 0 };
    if (client.name === 'Testman' && now - client.lastUpdate < 200) return { status: 0 };

    if (client.isJoining) {
      client.isDead = false;
      client.isJoining = false;
      client.joinedAt = Math.round(getTime() / 1000);
      client.invincibleUntil = client.joinedAt + this.config.immunitySeconds;

      if (this.config.isBattleRoyale) {
        this.emit(client, 'onBroadcast', 'Spectate until the round is over', 0);
        this.spectate(client);
        return { status: 1 };
      }

      this.addToRecentPlayers(client);
      this.emitAll(
        'onSpawnPlayer',
        client.id,
        client.name,
        client.overrideSpeed || client.speed,
        client.avatar,
        client.position.x,
        client.position.y,
        client.position.x,
        client.position.y
      );

      if (this.config.isRoundPaused) {
        this.emit(client, 'onRoundPaused');
        return { status: 0 };
      }
    }

    try {
      const pack = decodePayload(input.msg);
      const positionX = parseFloat(parseFloat(pack.position.split(':')[0].replace(',', '.')).toFixed(3));
      const positionY = parseFloat(parseFloat(pack.position.split(':')[1].replace(',', '.')).toFixed(3));
      const targetX = parseFloat(parseFloat(pack.target.split(':')[0].replace(',', '.')).toFixed(3));
      const targetY = parseFloat(parseFloat(pack.target.split(':')[1].replace(',', '.')).toFixed(3));

      if (
        !Number.isFinite(positionX) ||
        !Number.isFinite(positionY) ||
        !Number.isFinite(targetX) ||
        !Number.isFinite(targetY) ||
        positionX < this.mapBoundary.x.min ||
        positionX > this.mapBoundary.x.max ||
        positionY < this.mapBoundary.y.min ||
        positionY > this.mapBoundary.y.max
      )
        return { status: 0 };

      if (
        this.config.anticheat.disconnectPositionJumps &&
        this.distanceBetweenPoints(client.position, { x: positionX, y: positionY }) > 5
      ) {
        client.log.positionJump += 1;
        this.disconnectClient(client, 'position jumped');
        return { status: 0 };
      }

      client.clientPosition = { x: this.normalizeFloat(positionX, 4), y: this.normalizeFloat(positionY, 4) };
      client.clientTarget = { x: this.normalizeFloat(targetX, 4), y: this.normalizeFloat(targetY, 4) };
      client.lastReportedTime = client.name === 'Testman' ? parseFloat(pack.time) - 300 : parseFloat(pack.time);
      client.lastUpdate = now;
      return { status: 1 };
    } catch (e) {
      log('Error:', e);
      return { status: 0, error: e.message };
    }
  }

  async restart(ctx: { client: Client }, input: { signature: string }) {
    this.emitAll('onBroadcast', `Server is rebooting in 10 seconds`, 3);
    await sleep(10 * 1000);
    process.exit(1);
    return { status: 1 };
  }

  async maintenance(ctx: { client: Client }, input: { signature: string }) {
    this.sharedConfig.isMaintenance = true;
    this.config.isMaintenance = true;
    this.emitAll('onMaintenance', this.config.isMaintenance);
    return { status: 1 };
  }

  async unmaintenance(ctx: { client: Client }, input: { signature: string }) {
    this.sharedConfig.isMaintenance = false;
    this.config.isMaintenance = false;
    this.emitAll('onUnmaintenance', this.config.isMaintenance);
    return { status: 1 };
  }

  async startBattleRoyale(ctx: { client: Client }, input: { signature: string }) {
    this.emitAll('onBroadcast', `Battle Royale in 3...`, 1);
    await sleep(1 * 1000);
    this.emitAll('onBroadcast', `Battle Royale in 2...`, 1);
    await sleep(1 * 1000);
    this.emitAll('onBroadcast', `Battle Royale in 1...`, 1);
    await sleep(1 * 1000);
    this.baseConfig.isBattleRoyale = true;
    this.config.isBattleRoyale = true;
    this.baseConfig.isGodParty = false;
    this.config.isGodParty = false;
    this.emitAll('onBroadcast', `Battle Royale Started`, 3);
    this.emitAll('onBroadcast', `God Party Stopped`, 3);
    return { status: 1 };
  }

  async stopBattleRoyale(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.isBattleRoyale = false;
    this.config.isBattleRoyale = false;
    this.emitAll('onBroadcast', `Battle Royale Stopped`, 0);
    return { status: 1 };
  }

  async pauseRound(ctx: { client: Client }, input: { signature: string }) {
    clearTimeout(this.roundLoopTimeout);
    this.baseConfig.isRoundPaused = true;
    this.config.isRoundPaused = true;
    this.emitAll('onRoundPaused');
    this.emitAll('onBroadcast', `Round Paused`, 0);
    return { status: 1 };
  }

  async startRound(ctx: { client: Client }, input: { signature: string; data: any }) {
    clearTimeout(this.roundLoopTimeout);
    if (this.config.isRoundPaused) {
      this.baseConfig.isRoundPaused = false;
      this.config.isRoundPaused = false;
    }
    this.resetLeaderboard(presets.find((p) => p.gameMode === input.data.gameMode));
    return { status: 1 };
  }

  async enableForceLevel2(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.level2forced = true;
    this.config.level2forced = true;
    return { status: 1 };
  }

  async disableForceLevel2(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.level2forced = false;
    this.config.level2forced = false;
    return { status: 1 };
  }

  async startGodParty(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.isGodParty = true;
    this.config.isGodParty = true;
    this.emitAll('onBroadcast', `God Party Started`, 0);
    return { status: 1 };
  }

  async stopGodParty(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.isGodParty = false;
    this.config.isGodParty = false;
    for (const player of this.clients) {
      player.isInvincible = false;
    }
    this.emitAll('onBroadcast', `God Party Stopped`, 2);
    return { status: 1 };
  }

  async startRuneRoyale(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.isRuneRoyale = true;
    this.config.isRuneRoyale = true;
    this.emitAll('onBroadcast', `Rune Royale Started`, 0);
    return { status: 1 };
  }

  async pauseRuneRoyale(ctx: { client: Client }, input: { signature: string }) {
    this.emitAll('onBroadcast', `Rune Royale Paused`, 2);
    return { status: 1 };
  }

  async unpauseRuneRoyale(ctx: { client: Client }, input: { signature: string }) {
    this.emitAll('onBroadcast', `Rune Royale Unpaused`, 2);
    return { status: 1 };
  }

  async stopRuneRoyale(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.isRuneRoyale = false;
    this.config.isRuneRoyale = false;
    this.emitAll('onBroadcast', `Rune Royale Stopped`, 2);
    return { status: 1 };
  }

  async makeBattleHarder(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.dynamicDecayPower = false;
    this.config.dynamicDecayPower = false;
    this.sharedConfig.decayPower += 2;
    this.config.decayPower += 2;
    this.sharedConfig.baseSpeed += 1;
    this.config.baseSpeed += 1;
    this.sharedConfig.checkPositionDistance += 1;
    this.config.checkPositionDistance += 1;
    this.sharedConfig.checkInterval += 1;
    this.config.checkInterval += 1;
    this.sharedConfig.spritesStartCount -= 10;
    this.config.spritesStartCount -= 10;
    this.emitAll(
      'onSetPositionMonitor',
      `${this.config.checkPositionDistance}:${this.config.checkInterval}:${this.config.resetInterval}`
    );
    this.emitAll('onBroadcast', `Difficulty Increased!`, 2);
    return { status: 1 };
  }

  async makeBattleEasier(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.dynamicDecayPower = false;
    this.config.dynamicDecayPower = false;
    this.sharedConfig.decayPower -= 2;
    this.config.decayPower -= 2;
    this.sharedConfig.baseSpeed -= 1;
    this.config.baseSpeed -= 1;
    this.sharedConfig.checkPositionDistance -= 1;
    this.config.checkPositionDistance -= 1;
    this.sharedConfig.checkInterval -= 1;
    this.config.checkInterval -= 1;
    this.sharedConfig.spritesStartCount += 10;
    this.config.spritesStartCount += 10;
    this.emitAll(
      'onSetPositionMonitor',
      `${this.config.checkPositionDistance}:${this.config.checkInterval}:${this.config.resetInterval}`
    );
    this.emitAll('onBroadcast', `Difficulty Decreased!`, 0);
    return { status: 1 };
  }

  async resetBattleDifficulty(ctx: { client: Client }, input: { signature: string }) {
    this.baseConfig.dynamicDecayPower = true;
    this.config.dynamicDecayPower = true;
    this.sharedConfig.decayPower = 1.4;
    this.config.decayPower = 1.4;
    this.sharedConfig.baseSpeed = 3;
    this.config.baseSpeed = 3;
    this.sharedConfig.checkPositionDistance = 2;
    this.config.checkPositionDistance = 2;
    this.sharedConfig.checkInterval = 1;
    this.config.checkInterval = 1;
    this.emitAll(
      'onSetPositionMonitor',
      `${this.config.checkPositionDistance}:${this.config.checkInterval}:${this.config.resetInterval}`
    );
    this.emitAll('onBroadcast', `Difficulty Reset!`, 0);
    return { status: 1 };
  }

  async messageUser(ctx: { client: Client }, input: { data: any; signature: string }) {
    const targetClient = this.clients.find((c) => c.address === input.data.target);
    if (!targetClient) return { status: 0 };
    this.sockets[targetClient.id].emitAll('onBroadcast', input.data.message.replace(/:/gi, ''), 0);
    return { status: 1 };
  }

  async changeUser(ctx: { client: Client }, input: { data: any; signature: string }) {
    const newClient = this.clients.find((c) => c.address === input.data.target);
    if (!newClient) return { status: 0 };
    for (const key of Object.keys(input.data.app.config)) {
      const value = input.data.app.config[key];
      const val = value === 'true' ? true : value === 'false' ? false : isNumeric(value) ? parseFloat(value) : value;
      if (client.hasOwnProperty(key)) (newClient as any)[key] = val;
      else throw new Error("User doesn't have that option");
    }
    return { status: 1 };
  }

  async broadcast(ctx: { client: Client }, input: { data: any; signature: string }) {
    this.emitAll('onBroadcast', input.data.message.replace(/:/gi, ''), 0);
    return { status: 1 };
  }

  async kickClient(ctx: { client: Client }, input: { data: any; signature: string }) {
    const targetClient = this.clients.find((c) => c.address === input.data.target);
    if (!targetClient) return { status: 0 };
    this.disconnectClient(targetClient, 'kicked');
    return { status: 1 };
  }

  async info(ctx: { client: Client }, input: any) {
    return {
      status: 1,
      data: {
        id: this.config.id,
        version: this.serverVersion,
        port: this.state.spawnPort,
        round: { id: this.config.roundId, startedAt: this.round.startedAt },
        clientCount: this.clients.length,
        playerCount: this.clients.filter((c) => !c.isDead && !c.isSpectating).length,
        spectatorCount: this.clients.filter((c) => c.isSpectating).length,
        recentPlayersCount: this.round.players.length,
        spritesCount: this.config.spritesTotal,
        connectedPlayers: this.clients.filter((c) => !!c.address).map((c) => c.address),
        rewardItemAmount: this.config.rewardItemAmount,
        rewardWinnerAmount: this.config.rewardWinnerAmount,
        gameMode: this.config.gameMode,
        orbs: this.orbs,
        currentReward: this.currentReward,
      },
    };
  }

  // Implement other methods similarly...

  private emitAll(event: string, ...args: any[]) {
    this.io.emit(event, ...args);
  }

  emitDirect(socket: any, eventName: string, eventData: any): void {
    if (this.loggableEvents.includes(eventName)) {
      console.log(`Publish EventDirect: ${eventName}`, eventData);
    }
    socket.emit(eventName, eventData);
  }

  emit(client: Client, ...args: any[]): void {
    if (!client) {
      log('Emit Direct failed, no client', ...args);
      return;
    }
    const socket = this.sockets[client.id];
    if (!socket || !socket.emit) {
      log('Emit Direct failed, bad socket', ...args);
      return;
    }
    log('Emit Direct', ...args);
    const compiled: any[] = [];
    const eventQueue = [[...args]];
    for (const e of eventQueue) {
      const name = e[0];
      const args = e.slice(1);
      compiled.push(`["${name}","${args.join(':')}"]`);
      this.round.events.push({ type: 'emitDirect', player: socket.id, name, args });
    }
    this.emitDirect(socket, 'events', this.getPayload(compiled));
  }
}

export const createGameWorldRouter = (gameWorld: GameWorld) => {
  const ctx = { client };

  return t.router({
    connected: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ input }) => gameWorld.connected(input)),

    apiConnected: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(() => gameWorld.apiConnected()),

    apiDisconnected: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(() => gameWorld.apiDisconnected()),

    setPlayerCharacter: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ data: z.any() }))
      .mutation(({ input }) => gameWorld.setPlayerCharacter(input, ctx)),

    setConfig: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ data: z.any() }))
      .mutation(({ input }) => gameWorld.setConfig(input)),

    getConfig: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .mutation(() => gameWorld.getConfig()),

    load: t.procedure.use(customErrorFormatter(t)).mutation(() => gameWorld.load()),

    spectate: t.procedure.use(customErrorFormatter(t)).mutation(() => gameWorld.spectate()),

    setInfo: t.procedure
      .use(customErrorFormatter(t))
      .input(z.object({ msg: z.any() }))
      .mutation(({ input }) => gameWorld.setInfo(input)),

    joinRoom: t.procedure.use(customErrorFormatter(t)).mutation(() => gameWorld.joinRoom()),

    updateMyself: t.procedure
      .use(customErrorFormatter(t))
      .input(z.object({ msg: z.any() }))
      .mutation(({ input }) => gameWorld.updateMyself(input)),

    restart: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(() => gameWorld.restart()),

    maintenance: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(() => gameWorld.maintenance()),

    unmaintenance: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(() => gameWorld.unmaintenance()),

    startBattleRoyale: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.startBattleRoyale(ctx, input)),

    stopBattleRoyale: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.stopBattleRoyale(ctx, input)),

    pauseRound: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.pauseRound(ctx, input)),

    startRound: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string(), data: z.any() }))
      .mutation(({ ctx, input }) => gameWorld.startRound(ctx, input)),

    enableForceLevel2: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.enableForceLevel2(ctx, input)),

    disableForceLevel2: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.disableForceLevel2(ctx, input)),

    startGodParty: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.startGodParty(ctx, input)),

    stopGodParty: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.stopGodParty(ctx, input)),

    startRuneRoyale: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.startRuneRoyale(ctx, input)),

    pauseRuneRoyale: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.pauseRuneRoyale(ctx, input)),

    unpauseRuneRoyale: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.unpauseRuneRoyale(ctx, input)),

    stopRuneRoyale: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.stopRuneRoyale(ctx, input)),

    makeBattleHarder: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.makeBattleHarder(ctx, input)),

    makeBattleEasier: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.makeBattleEasier(ctx, input)),

    resetBattleDifficulty: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.resetBattleDifficulty(ctx, input)),

    messageUser: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ data: z.any(), signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.messageUser(ctx, input)),

    changeUser: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ data: z.any(), signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.changeUser(ctx, input)),

    broadcast: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ data: z.any(), signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.broadcast(ctx, input)),

    kickClient: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .input(z.object({ data: z.any(), signature: z.string() }))
      .mutation(({ ctx, input }) => gameWorld.kickClient(ctx, input)),

    info: t.procedure
      .use(validateMod(t))
      .use(customErrorFormatter(t))
      .mutation(({ ctx, input }) => gameWorld.info(ctx, input)),
  });
};

export type Router = typeof createGameWorldRouter;

export async function init(app) {
  try {
    const gameWorld = new GameWorld(app);

    log('Starting event handler');
    app.io.on('connection', function (socket) {
      try {
        log('Connection', socket.id);

        const router = createGameWorldRouter(gameWorld);

        const spawnPoint = gameWorld.playerSpawnPoints[Math.floor(Math.random() * gameWorld.playerSpawnPoints.length)];
        const client: Client = {
          name: 'Unknown' + Math.floor(Math.random() * 999),
          startedRoundAt: null,
          lastTouchPlayerId: null,
          lastTouchTime: null,
          id: socket.id,
          avatar: null as any,
          network: null as any,
          address: null as any,
          device: null as any,
          position: spawnPoint,
          target: spawnPoint,
          clientPosition: spawnPoint,
          clientTarget: spawnPoint,
          rotation: null as any,
          xp: 50,
          maxHp: 100,
          latency: 0,
          kills: 0,
          killStreak: 0,
          deaths: 0,
          points: 0,
          evolves: 0,
          powerups: 0,
          rewards: 0,
          orbs: 0,
          pickups: [],
          isMod: false,
          isBanned: false,
          isMasterClient: false,
          isDisconnected: false,
          isDead: true,
          isJoining: false,
          isSpectating: false,
          isStuck: false,
          isGod: false,
          isRealm: false,
          isGuest: false,
          isInvincible: gameWorld.config.isGodParty ? true : false,
          isPhased: false,
          overrideSpeed: null as any,
          overrideCameraSize: null as any,
          cameraSize: gameWorld.config.cameraSize,
          speed: gameWorld.config.baseSpeed * gameWorld.config.avatarSpeedMultiplier0,
          joinedAt: 0,
          invincibleUntil: 0,
          decayPower: 1,
          hash: ipHashFromSocket(socket),
          lastReportedTime: getTime(),
          lastUpdate: 0,
          gameMode: app.config.gameMode,
          phasedUntil: getTime(),
          overrideSpeedUntil: 0,
          joinedRoundAt: getTime(),
          baseSpeed: 1,
          character: {
            meta: {
              1030: 0,
              1102: 0,
              1104: 0,
              1105: 0,
              1150: 0,
              1160: 0,
              1222: 0,
              1223: 0,
              1164: 0,
              1219: 0,
              1117: 0,
              1118: 0,
            },
          },
          log: {
            kills: [],
            deaths: [],
            revenge: 0,
            resetPosition: 0,
            phases: 0,
            stuck: 0,
            collided: 0,
            timeoutDisconnect: 0,
            speedProblem: 0,
            clientDistanceProblem: 0,
            outOfBounds: 0,
            ranOutOfHealth: 0,
            notReallyTrying: 0,
            tooManyKills: 0,
            killingThemselves: 0,
            sameNetworkDisconnect: 0,
            connectedTooSoon: 0,
            clientDisconnected: 0,
            positionJump: 0,
            pauses: 0,
            connects: 0,
            path: '',
            positions: 0,
            spectating: 0,
            replay: [],
            recentJoinProblem: 0,
            usernameProblem: 0,
            maintenanceJoin: 0,
            signatureProblem: 0,
            signinProblem: 0,
            versionProblem: 0,
            failedRealmCheck: 0,
          },
        };
        log('User connected from hash ' + hash);
        if (!testMode && app.killSameNetworkClients) {
          const sameNetworkClient = app.clients.find((r) => r.hash === client.hash && r.id !== client.id);
          if (sameNetworkClient) {
            client.log.sameNetworkDisconnect += 1;
            gameWorld.disconnectClient(client, 'same network');
            return;
          }
        }
        gameWorld.sockets[client.id] = socket;
        gameWorld.clientLookup[client.id] = client;
        if (Object.keys(gameWorld.clientLookup).length == 1) {
          client.isMasterClient = true;
        }
        gameWorld.clients = gameWorld.clients.filter((c) => c.hash !== client.hash);
        gameWorld.clients.push(client);

        const ctx = { client };

        socket.on('trpc', async (message) => {
          const { id, method, params } = message;
          try {
            const ctx = { socket, client };

            const createCaller = t.createCallerFactory(router);
            const caller = createCaller(ctx);
            const result = await caller[method](params);

            socket.emitAll('trpcResponse', { id, result });
          } catch (error) {
            console.log('user connection error', id, error.message);
            socket.emitAll('trpcResponse', { id, error: error.message });
          }
        });

        socket.on('disconnect', function () {
          log('User has disconnected');
          client.log.clientDisconnected += 1;
          gameWorld.disconnectClient(client, 'client disconnected');
          if (client.isRealm) {
            gameWorld.emitAll('onBroadcast', `Realm disconnected`, 0);
          }
        });
      } catch (e) {
        console.log('initEventHandler error', e);
      }
    });
  } catch (e) {
    log('init game world failed', e);
  }
}

export default { init };
