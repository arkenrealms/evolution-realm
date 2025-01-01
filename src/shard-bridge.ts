import dayjs from 'dayjs';
import { spawn } from 'child_process';
import { observable } from '@trpc/server/observable';
import { sleep } from '@arken/node/util/time';
import { io as ioClient } from 'socket.io-client';
import { isValidRequest, getSignedRequest } from '@arken/node/util/web3';
import { log, logError, random, getTime } from '@arken/node/util';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { createTRPCProxyClient, TRPCClientError, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import { generateShortId } from '@arken/node/util/db';
import { randomName } from '@arken/node/util/string';
import { Realm, Shard } from '@arken/evolution-protocol/types';
import {
  createRouter as createBridgeRouter,
  RouterInput,
  RouterOutput,
  RouterContext,
} from '@arken/evolution-protocol/bridge/bridge.router';
import type * as Bridge from '@arken/evolution-protocol/bridge/bridge.types';
import { serialize, deserialize } from '@arken/node/util/rpc';
import { RealmServer } from './realm-server';
// import SocketIOWebSocket from './trpc-websocket';
// import { TRPCLink } from '@trpc/client';
// import { AnyRouter } from '@trpc/server';

// Extend the context type to include 'client'
// interface CustomContext {
//   client: ShardProxyClient; // or Shard.Client, depending on your exact type
// }

// class NodeWebSocket extends WebSocket implements WebSocket {
//   // Add any methods that the `ws` WebSocket lacks
//   dispatchEvent(event: Event): boolean {
//     // Implement or mock this method if needed
//     return false;
//   }
// }

// Assign it globally
// (global as any).WebSocket = SocketIOWebSocket as any;

// const mongoose = require('mongoose');
// const Schema = mongoose.Schema;

// Define the schema for the configuration
// const configSchema = new Schema({
//   roundId: { type: Number, default: 1 },
//   rewardItemAmountPerLegitPlayer: { type: Number, default: 0 },
//   rewardItemAmountMax: { type: Number, default: 0 },
//   rewardWinnerAmountPerLegitPlayer: { type: Number, default: 0 },
//   rewardWinnerAmountMax: { type: Number, default: 0 },
//   rewardItemAmount: { type: Number, default: 0 },
//   rewardWinnerAmount: { type: Number, default: 0 },
//   drops: {
//     guardian: { type: Number, default: 1633043139000 },
//     earlyAccess: { type: Number, default: 1633043139000 },
//     trinket: { type: Number, default: 1641251240764 },
//     santa: { type: Number, default: 1633043139000 },
//   },
// });

const path = require('path');

export const t = initTRPC.create();
export const router = t.router;
export const procedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// function getSocket(endpoint: string): WebSocket {
//   log('Connecting to', endpoint);
//   return new WebSocket(endpoint);
// }
// function getSocket(endpoint) {
//   log('Connecting to', endpoint);
//   return ioClient(endpoint, {
//     transports: ['websocket'],
//     upgrade: false,
//     autoConnect: false,
//     // pingInterval: 5000,
//     // pingTimeout: 20000
//     // extraHeaders: {
//     //   "my-custom-header": "1234"
//     // }
//   });
// }

type Context = { realm: RealmServer };

class ShardProxyClient {
  infoRequestTimeout: any;
  connectTimeout: any;
  emit: ReturnType<typeof createTRPCProxyClient<Shard.Router>>;
  id: string;
  endpoint: string;
  key: string;
  socket: any;
  // info: UnwrapPromise<ReturnType<Shard.Service['info']>>;
  info: Shard.ServiceInfo;
  ioCallbacks: any;

  constructor() {}
}

type ShardBridgeConfig = {
  rewardItemAmountPerLegitPlayer: number;
  rewardItemAmountMax: number;
  rewardWinnerAmountPerLegitPlayer: number;
  rewardWinnerAmountMax: number;
  rewardItemAmount: number;
  rewardWinnerAmount: number;
  key: string;
  totalLegitPlayers: number;
  level2open: boolean;
  rewardSpawnLoopSeconds: number;
  drops: {
    guardian: number;
    earlyAccess: number;
    trinket: number;
    santa: number;
  };
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
};

export type Event2 = {
  name: string;
  args: Array<any>;
};
export class ShardBridge implements Bridge.Service {
  spawnPort: number;
  id: string;
  name: string;
  router: ReturnType<typeof createBridgeRouter>; // Shard.Router ??
  emit: ReturnType<typeof createTRPCProxyClient<Shard.Router>>;
  // emit: any; //Shard.Router;
  process: any;
  characters: any;
  info: any;
  isAuthed: boolean;
  socket: any;
  realm: RealmServer;
  shards: ShardProxyClient[];
  endpoint: string;
  key: string;
  config: ShardBridgeConfig;
  unsavedGames: any;
  clients: Shard.Client[];
  ioCallbacks: any;
  realmId: string;
  clientCount: number;
  status: string;

  constructor({ realm }: Context) {
    console.log('Construct shard bridge');
    this.realm = realm;
    this.shards = [];
    this.ioCallbacks = {};
    this.clients = [];
  }

  start() {
    try {
      setInterval(() => {
        this.characters = {};
      }, 10 * 60 * 1000);

      // const binaryPath = {
      //   linux: '../game-server/build/index.js',
      //   darwin: '../game-server/build/index.js',
      //   win32: ''
      // }[process.platform]

      const env = {
        ...process.env,
        LOG_PREFIX: '[SHARD]',
        SHARD_PORT: this.spawnPort + '',
      };

      console.log('Start shard bridge', env);

      // Start the server
      this.process = spawn(
        'node', // Start the Node.js runtime
        [
          '--inspect', // Enable debugging with the inspector
          '-r',
          'ts-node/register', // Use ts-node/register to execute TypeScript
          '-r',
          'dotenv/config', // Load dotenv config
          '-r',
          'tsconfig-paths/register', // Register tsconfig paths
          'src/index.ts', // Your TypeScript entry file
        ],
        {
          cwd: path.resolve('../shard'), // Set the current working directory
          env, // Set environment variables
          stdio: ['ignore', 'pipe', 'pipe'], // Configure stdio streams
        }
      );
      // this.process = spawn('node', ['-r', 'tsconfig-paths/register', 'build/index.js'], {
      //   cwd: path.resolve('../shard'),
      //   env,
      //   stdio: ['ignore', 'pipe', 'pipe'],
      // });

      this.process.stdout.pipe(process.stdout);
      this.process.stderr.pipe(process.stderr);

      this.process.on('exit', (code, signal) => {
        log(`Child process exited with code ${code} and signal ${signal}. Lets exit too.`);

        process.exit(1);
      });

      this.realm.subProcesses.push(this.process);
    } catch (e) {
      log('startShardBridge error', e);
    }
  }

  async connect(input: RouterInput['connect'], { client }: RouterContext): Promise<RouterOutput['connect']> {
    log('Connected: ' + client.key, client.id);

    const data = { id: client.id };
    const signature = await getSignedRequest(this.realm.web3, this.realm.secrets, data);

    await sleep(2000);

    await client.emit.connected.mutate(
      { signature: { hash: signature.hash, address: signature.address }, data }
      // { context: { client } }
    );

    // const info = await client.emit.evolution.info.mutate();

    // if (!info || typeof info !== 'object') {
    //   throw new Error('[SHARD.BRIDGE] invalid shard info' + info);
    // }

    // for (const key of Object.keys(info)) {
    //   this.info[key] = info[key];
    // }
  }

  async disconnect(input: any, { client }: any) {
    log('Disconnected: ' + client.id);
    return { status: 1 };
  }

  async init(input: RouterInput['init'], ctx: RouterContext): Promise<RouterOutput['init']> {
    // if (!input) throw new Error('Input should not be void');

    // if (input?.status !== 1) {
    //   throw new Error('Could not init');
    // }

    log('Shard instance initialized');
    log('Getting seer info');
    const res = await this.realm.seer.emit.evolution.info.query();

    if (!res) throw new Error('Could not fetch info');

    this.id = generateShortId();
    this.info = { ...res };
    this.isAuthed = true;

    log('Seer info', this.info);

    return {
      id: this.id,
      maxClients: this.info.maxClients,
      roundId: this.info.roundId,
      rewards: this.info.rewards,
    };
  }

  async configure(input: RouterInput['configure'], ctx: RouterContext): Promise<RouterOutput['configure']> {
    if (!input) throw new Error('Input should not be void');

    log('configure');
    const { config } = this;
    // TODO: add them
    this.clients = input.clients;

    for (const client of this.clients) {
      client.shardId = ctx.client.id;
    }

    config.totalLegitPlayers = 0;

    for (const client of this.clients) {
      if (client.isGuest) continue;

      try {
        if (
          (client.powerups > 100 && client.kills > 1) ||
          (client.evolves > 20 && client.powerups > 200) ||
          (client.rewards > 3 && client.powerups > 200) ||
          client.evolves > 100 ||
          client.points > 1000
        ) {
          config.totalLegitPlayers += 1;
        }
      } catch (e) {
        log('Error 9343', e);
      }
    }

    if (config.totalLegitPlayers === 0) config.totalLegitPlayers = 1;

    // config.rewardItemAmount = this.info.rewardItemAmount;
    // parseFloat(
    //   (
    //     Math.round(
    //       Math.min(config.totalLegitPlayers * config.rewardItemAmountPerLegitPlayer, config.rewardItemAmountMax) * 1000
    //     ) / 1000
    //   ).toFixed(3)
    // );

    // config.rewardWinnerAmount = this.info.rewardWinnerAmount;
    // parseFloat(
    //   (
    //     Math.round(
    //       Math.min(config.totalLegitPlayers * config.rewardWinnerAmountPerLegitPlayer, config.rewardWinnerAmountMax) *
    //         1000
    //     ) / 1000
    //   ).toFixed(3)
    // );

    console.log('Configured seer info', this.info);

    return {
      rewardWinnerAmount: this.info.rewardWinnerAmount,
      rewardItemAmount: this.info.rewardItemAmount,
    };
  }

  async saveRound(input: RouterInput['saveRound'], ctx: RouterContext): Promise<RouterOutput['saveRound']> {
    if (!input) throw new Error('Input should not be void');

    const { config } = this;

    let failed = false;

    try {
      log('saveRound', input);

      const res = await this.realm.seer.emit.evolution.saveRound.mutate({
        shardId: ctx.client.id,
        round: input,
        // rewardWinnerAmount: this.info.rewardWinnerAmount,
        // clients: this.clients,
      });

      return res;
    } catch (e) {
      logError('Save round failed', e);
      failed = true;
    }

    // if (failed) {
    //   this.unsavedGames.push({
    //     gsid: this.id,
    //     roundId: this.realm.config.roundId,
    //     round: input,
    //     rewardWinnerAmount: config.rewardWinnerAmount,
    //   });

    //   return { rewardWinnerAmount: 0, rewardItemAmount: 0 };
    // } else {
    //   for (const game of this.unsavedGames.filter((g) => g.status === undefined)) {
    //     const res = await this.realm.seer.emit.evolution.saveRound.mutate(game);
    //     game.status = res.status;
    //   }

    //   this.unsavedGames = this.unsavedGames.filter((g) => g.status !== 1);
    // }

    // this.realm.config.roundId++;
  }

  async confirmProfile(
    input: RouterInput['confirmProfile'],
    { client }: RouterContext
  ): Promise<RouterOutput['confirmProfile']> {
    if (!input) throw new Error('Input should not be void');

    log('confirmProfile', input);

    if (!this.realm.profiles[input.address]) {
      this.realm.profiles[input.address] = await this.realm.seer.emit.profile.getProfile.query({
        where: { address: { equals: input.address } },
      });
    }

    const profile = this.realm.profiles[input.address];
    if (!profile) throw new Error('Profile not found');

    if (this.clients.length > 100) {
      throw new Error('Too many clients'); // TODO: add to queue
    }

    const now = dayjs();

    if (profile.meta?.isBanned && dayjs(profile.meta?.banExpireDate).isAfter(now)) {
      throw new Error('Banned');
    }

    return {
      name: profile.name,
      address: profile.address,
      isBanned: profile.meta?.isBanned,
      isMod: this.realm.modList.includes(input.address) || this.realm.adminList.includes(input.address),
    };
  }

  async auth(input: RouterInput['auth'], { client }: RouterContext): Promise<RouterOutput['auth']> {
    if (!input) throw new Error('Input should not be void');

    // async auth({ data, signature }: { data?: string; signature?: { hash?: string; address?: string } }) {
    log('ShardBridge.auth', input);

    const roles = [];

    if (input.signature.address.length !== 42 || input.signature.address.slice(0, 2) !== '0x') return { status: 0 };

    const normalizedAddress = this.realm.web3.utils.toChecksumAddress(input.signature.address.trim());

    if (!normalizedAddress) return { status: 0 };

    if (
      this.realm.web3.eth.accounts.recover(input.data, input.signature.hash).toLowerCase() !==
      input.signature.address.toLowerCase()
    )
      return { status: 0 };

    if (this.realm.seerList.includes(normalizedAddress)) roles.push('seer');
    if (this.realm.adminList.includes(normalizedAddress)) roles.push('admin');
    if (this.realm.modList.includes(normalizedAddress)) roles.push('mod');

    return { roles };
  }

  async normalizeAddress(address: string) {
    return this.realm.web3.utils.toChecksumAddress(address.trim());
  }

  async getRandomReward() {
    const now = getTime();
    const { config } = this;

    // config.drops = config.drops || {};
    config.drops.guardian = config.drops.guardian || 1633043139000;
    config.drops.earlyAccess = config.drops.earlyAccess || 1633043139000;
    config.drops.trinket = config.drops.trinket || 1641251240764;
    config.drops.santa = config.drops.santa || 1633043139000;

    const timesPer10Mins = Math.round((10 * 60) / config.rewardSpawnLoopSeconds);
    const randPer10Mins = random(0, timesPer10Mins);
    const timesPerDay = Math.round((40 * 60 * 60) / config.rewardSpawnLoopSeconds);
    const randPerDay = random(0, timesPerDay);
    const timesPerWeek = Math.round((10 * 24 * 60 * 60) / config.rewardSpawnLoopSeconds);
    const randPerWeek = random(0, timesPerWeek);
    const timesPerBiweekly = Math.round((20 * 24 * 60 * 60) / config.rewardSpawnLoopSeconds);
    const randPerBiweekly = random(0, timesPerBiweekly);
    const timesPerMonth = Math.round((31 * 24 * 60 * 60) / config.rewardSpawnLoopSeconds);
    const randPerMonth = random(0, timesPerMonth);

    let tempReward: any;
    const dropItems = false; // Assuming this is determined elsewhere

    if (dropItems && now - config.drops.guardian > 48 * 60 * 60 * 1000 && randPerDay === Math.round(timesPerDay / 2)) {
      tempReward = {
        id: generateShortId(),
        position: config.level2open
          ? this.config.rewardSpawnPoints2[random(0, this.config.rewardSpawnPoints2.length - 1)]
          : this.config.rewardSpawnPoints[random(0, this.config.rewardSpawnPoints.length - 1)],
        enabledDate: now,
        name: 'Guardian Egg',
        rarity: 'Magical',
        quantity: 1,
        rewardItemType: 2,
      };

      const rand = random(0, 1000);
      if (rand === 1000) tempReward.rarity = 'Mythic';
      else if (rand > 950) tempReward.rarity = 'Epic';
      else if (rand > 850) tempReward.rarity = 'Rare';

      tempReward.rewardItemName = `${tempReward.rarity} ${tempReward.name}`;
      tempReward.rewardItemType = 2;

      config.drops.guardian = now;
    } else if (
      dropItems &&
      now - config.drops.earlyAccess > 30 * 24 * 60 * 60 * 1000 &&
      randPerMonth === Math.round(timesPerMonth / 2)
    ) {
      tempReward = {
        id: generateShortId(),
        position: config.level2open
          ? this.config.rewardSpawnPoints2[random(0, this.config.rewardSpawnPoints2.length - 1)]
          : this.config.rewardSpawnPoints[random(0, this.config.rewardSpawnPoints.length - 1)],
        enabledDate: now,
        name: `Early Access Founder's Cube`,
        rarity: 'Unique',
        quantity: 1,
        rewardItemType: 3,
      };

      tempReward.rewardItemName = tempReward.name;
      tempReward.rewardItemType = 3;

      config.drops.earlyAccess = now;
    } else if (
      dropItems &&
      now - config.drops.trinket > 24 * 60 * 60 * 1000 &&
      randPerDay === Math.round(timesPerDay / 4)
    ) {
      tempReward = {
        id: generateShortId(),
        position: config.level2open
          ? this.config.rewardSpawnPoints2[random(0, this.config.rewardSpawnPoints2.length - 1)]
          : this.config.rewardSpawnPoints[random(0, this.config.rewardSpawnPoints.length - 1)],
        enabledDate: now,
        name: 'Trinket',
        rarity: 'Magical',
        quantity: 1,
        rewardItemType: 4,
      };

      const rand = random(0, 1000);
      if (rand === 1000) tempReward.rarity = 'Mythic';
      else if (rand > 950) tempReward.rarity = 'Epic';
      else if (rand > 850) tempReward.rarity = 'Rare';

      tempReward.rewardItemName = `${tempReward.rarity} ${tempReward.name}`;
      tempReward.rewardItemType = 4;

      config.drops.trinket = now;
    } else if (now - config.drops.santa > 2 * 60 * 1000) {
      tempReward = {
        id: generateShortId(),
        position: config.level2open
          ? this.config.rewardSpawnPoints2[random(0, this.config.rewardSpawnPoints2.length - 1)]
          : this.config.rewardSpawnPoints[random(0, this.config.rewardSpawnPoints.length - 1)],
        enabledDate: now,
        name: 'Santa Christmas 2024 Ticket',
        rarity: 'Normal',
        quantity: 1,
        rewardItemType: 6,
      };

      tempReward.rewardItemName = tempReward.name;
      tempReward.rewardItemType = 6;

      config.drops.santa = now;
    } else {
      const odds = Array(1000).fill('tokens');

      const rewardType = this.info.rewards.tokens; // [odds[random(0, odds.length - 1)]];
      if (!rewardType || rewardType.length === 0) {
        throw new Error('Reward doesnt exist');
      }

      const reward = rewardType[random(0, rewardType.length - 1)];
      if (reward.type === 'token' && reward.quantity <= 0) {
        return this.getRandomReward();
      }

      tempReward = { ...reward, rewardItemType: 0, quantity: 1, id: generateShortId(), enabledDate: now };
      tempReward.rewardItemName = tempReward.symbol;
      tempReward.rewardItemType = 0;
      tempReward.position = config.level2open
        ? this.config.rewardSpawnPoints2[random(0, this.config.rewardSpawnPoints2.length - 1)]
        : this.config.rewardSpawnPoints[random(0, this.config.rewardSpawnPoints.length - 1)];
    }

    return tempReward;
  }

  bridge(bid) {
    const existingShard = this.shards.find((s) => s.id === bid);
    if (existingShard) {
      this.shards = this.shards.filter((s) => s.id !== bid);
      if (existingShard?.socket) {
        existingShard.socket.close();

        // clearTimeout(existingShard.infoRequestTimeout);
        // clearTimeout(existingShard.connectTimeout);
      }
    }

    const client = new ShardProxyClient();

    client.id = bid;
    client.key = 'local1';

    client.ioCallbacks = {};

    client.endpoint = (this.realm.isHttps ? 'https://' : 'http://') + 'hoff.arken.gg:' + this.spawnPort;

    client.socket = ioClient(client.endpoint, {
      transports: ['websocket'],
      upgrade: false,
      autoConnect: false,
      // pingInterval: 5000,
      // pingTimeout: 20000
      // extraHeaders: {
      //   "my-custom-header": "1234"
      // }
    });

    client.emit = createTRPCProxyClient<Shard.Router>({
      links: [
        () =>
          ({ op, next }) => {
            return observable((observer) => {
              const { input } = op;

              op.context.client = client;
              // @ts-ignore
              op.context.client.roles = ['admin', 'user', 'guest'];

              if (!client) {
                // console.log('Emit Direct failed, no client', op);
                // observer.complete();
                observer.error(new TRPCClientError('Emit Direct failed, no client'));
                return;
              }

              if (!client.socket || !client.socket.emit) {
                // console.log('Emit Direct failed, bad socket', op);
                // observer.complete();
                observer.error(new TRPCClientError('Emit Direct failed, bad socket'));
                return;
              }
              console.log('[REALM.SHARD_BRIDGE] Emit Direct', op);

              const id = generateShortId();

              client.socket.emit('trpc', { id, method: op.path, type: op.type, params: input });

              // save the ID and callback when finished
              const timeout = setTimeout(() => {
                console.log('[REALM.SHARD_BRIDGE] Request timed out', op);
                delete client.ioCallbacks[id];
                observer.error(new TRPCClientError('Request timeout'));
              }, 15000); // 15 seconds timeout

              client.ioCallbacks[id] = {
                timeout,
                resolve: (pack) => {
                  // log('[REALM.SHARD_BRIDGE] ioCallbacks.resolve', id, pack);
                  clearTimeout(timeout);
                  if (pack.error) {
                    observer.error(pack.error);
                  } else {
                    const result = deserialize(pack.result);
                    console.log('[REALM.SHARD_BRIDGE] ioCallbacks.resolve', result);

                    if (result?.status !== undefined && result?.status !== 1)
                      throw new Error('[REALM.SHARD_BRIDGE] callback status error' + result);

                    observer.next({
                      result: result ? result : { data: undefined },
                    });

                    observer.complete();
                  }
                  delete client.ioCallbacks[id]; // Cleanup after completion
                },
                reject: (error) => {
                  console.log('[REALM.SHARD_BRIDGE] ioCallbacks.reject', error);
                  clearTimeout(timeout);
                  observer.error(error);
                  delete client.ioCallbacks[id]; // Cleanup on error
                },
              };

              // const { input, context } = op;
              // const client = client;

              // if (!client) {
              //   console.log('Emit Bridge -> Shard failed, no client', op);
              //   observer.complete();
              //   return;
              // }

              // if (!client.socket || !client.socket.emit) {
              //   console.log('Emit Bridge -> Shard failed, bad socket', op);
              //   observer.complete();
              //   return;
              // }
              // console.log('Emit Bridge -> Shard', op);

              // client.socket.emit('trpc', { id: op.id, method: op.path, type: op.type, params: input });

              // observer.complete();
            });
          },
      ],
      // transformer: dummyTransformer,
    });

    client.socket.onAny(async (eventName, res) => {
      try {
        // log('client.socket.onAny', eventName, res);

        if (eventName === 'trpcResponse') {
          const { oid } = res;

          console.log(
            `[REALM.SHARD_BRIDGE] Callback ${client.ioCallbacks[oid] ? 'Exists' : 'Doesnt Exist'}`,
            eventName
          );

          if (client.ioCallbacks[oid]) {
            clearTimeout(client.ioCallbacks[oid].timeout);

            client.ioCallbacks[oid].resolve({ result: { data: deserialize(res.result) } });

            delete client.ioCallbacks[oid];
          }
        } else if (eventName === 'trpc') {
          if (res instanceof Buffer) return;

          const { method } = res;

          if (method === 'onEvents') return;

          console.log('[REALM.SHARD_BRIDGE] Shard bridge called', method, res.params);

          const id = generateShortId();

          try {
            const ctx = { client: client };

            const createCaller = createCallerFactory(this.router);
            const caller = createCaller(ctx);
            // @ts-ignore
            const result = res.params ? await caller[method](deserialize(res.params)) : await caller[method]();
            // socket.emit('trpcResponse', { id, result });
            client.socket.emit('trpcResponse', { id, oid: res.id, result: serialize(result) });
          } catch (e) {
            client.socket.emit('trpcResponse', { id, oid: res.id, error: e.stack + '' });
          }
        }
      } catch (e) {
        logError(e);
      }
    });

    // client.socket.addEventListener('message', async (message) => {
    //   const { type, id, method, params } = JSON.parse(message.data);

    //   if (type === 'trpc') {
    //     try {
    //       const ctx = { client: client };

    //       const createCaller = createCallerFactory(this.emit);
    //       const caller = createCaller(ctx);
    //       // @ts-ignore
    //       const result = await caller[method](params);
    //       // socket.emit('trpcResponse', { id, result });
    //       socket.send(JSON.stringify({ type: 'trpcResponse', id, result }));
    //     } catch (e) {
    //       socket.send(JSON.stringify({ type: 'trpcResponse', id, error: e.message }));
    //     }
    //   }
    // });

    client.socket.addEventListener('connect', async () => {
      this.connect(null, { client: client });
    });

    client.socket.addEventListener('disconnect', async () => {
      log('Shard has disconnected');

      // if (client.isAdmin) {
      //   await this.seerDisconnected.mutate(await getSignedRequest(app.web3, app.secrets, {}), {});
      // }

      // client.log.clientDisconnected += 1;
      // delete app.sockets[client.id];
      // delete app.clientLookup[client.id];
      this.clients = this.clients.filter((c) => c.shardId !== client.id);
    });

    this.shards.push(client);

    this.spawnPort += 1; // TODO: just have the shard tell us what it is via discovery

    client.socket.connect();
  }

  async seerDisconnected(
    input: RouterInput['seerDisconnected'],
    ctx: RouterContext
  ): Promise<RouterOutput['seerDisconnected']> {}
}

export async function init(realm, spawnPort) {
  const shardBridge = new ShardBridge({ realm });

  shardBridge.id = generateShortId();
  shardBridge.name = randomName();
  shardBridge.spawnPort = spawnPort;
  shardBridge.realmId = realm.id;
  shardBridge.clientCount = 0;
  shardBridge.endpoint = 'localhost:' + spawnPort;
  shardBridge.status = 'Active';

  shardBridge.router = createBridgeRouter(shardBridge);

  shardBridge.config = {} as ShardBridgeConfig;
  shardBridge.config.rewardSpawnPoints = [
    { x: -16.32, y: -15.7774 },
    { x: -9.420004, y: -6.517404 },
    { x: -3.130003, y: -7.537404 },
    { x: -7.290003, y: -12.9074 },
    { x: -16.09, y: -2.867404 },
    { x: -5.39, y: -3.76 },
    { x: -7.28, y: -15.36 },
    { x: -13.46, y: -13.92 },
    { x: -12.66, y: -1.527404 },
  ];
  shardBridge.config.rewardSpawnPoints2 = [
    { x: -16.32, y: -15.7774 },
    { x: -9.420004, y: -6.517404 },
    { x: -3.130003, y: -7.537404 },
    { x: -7.290003, y: -12.9074 },
    { x: -16.09, y: -2.867404 },
    { x: -5.39, y: -3.76 },
    { x: -12.66, y: -1.527404 },

    { x: -24.21, y: -7.58 },
    { x: -30.62, y: -7.58 },
    { x: -30.8, y: -14.52 },
    { x: -20.04, y: -15.11 },
    { x: -29.21, y: -3.76 },
    { x: -18.16, y: 0.06 },
    { x: -22.98, y: -3.35 },
    { x: -25.92, y: -7.64 },
    { x: -20.1, y: -6.93 },
    { x: -26.74, y: 0 },
    { x: -32.74, y: -5.17 },
    { x: -25.74, y: -15.28 },
    { x: -22.62, y: -11.69 },
    { x: -26.44, y: -4.05 },
  ];

  shardBridge.config.rewardItemAmountPerLegitPlayer = 0;
  shardBridge.config.rewardItemAmountMax = 0;
  shardBridge.config.rewardWinnerAmountPerLegitPlayer = 0;
  shardBridge.config.rewardWinnerAmountMax = 0;
  shardBridge.config.rewardItemAmount = 0;
  shardBridge.config.rewardWinnerAmount = 0;
  shardBridge.config.drops = {
    guardian: 1633043139000,
    earlyAccess: 1633043139000,
    trinket: 1641251240764,
    santa: 1633043139000,
  };

  setTimeout(() => {
    shardBridge.start();

    setTimeout(() => {
      shardBridge.bridge(generateShortId());
    }, 20 * 1000);
  }, 1000);

  return shardBridge;
}
