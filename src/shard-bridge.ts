import axios from 'axios';
import md5 from 'js-md5';
import dayjs from 'dayjs';
import jetpack from 'fs-jetpack';
import { spawn } from 'child_process';
import { observable } from '@trpc/server/observable';
import WebSocket from 'isomorphic-ws';
import { sleep } from '@arken/node/util/time';
import { generateUuid } from '@arken/node/util/guid';
import { io as ioClient } from 'socket.io-client';
import { isValidRequest, getSignedRequest } from '@arken/node/util/web3';
import { log, logError, random, getTime } from '@arken/node/util';
import { emitDirect } from '@arken/node/util/websocket';
import { upgradeGsCodebase, cloneGsCodebase } from '@arken/node/util/codebase';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { createTRPCProxyClient, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import { customErrorFormatter, transformer, dummyTransformer } from '@arken/node/util/rpc';
import { Realm, Shard } from '@arken/evolution-protocol/types';
import { RealmServer } from './realm-server';
import SocketIOWebSocket from './trpc-websocket';
import { TRPCLink } from '@trpc/client';
import { AnyRouter } from '@trpc/server';

// Extend the context type to include 'client'
interface CustomContext {
  client: ShardProxyClient; // or Shard.Client, depending on your exact type
}

// class NodeWebSocket extends WebSocket implements WebSocket {
//   // Add any methods that the `ws` WebSocket lacks
//   dispatchEvent(event: Event): boolean {
//     // Implement or mock this method if needed
//     return false;
//   }
// }

// Assign it globally
(global as any).WebSocket = SocketIOWebSocket as any;

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the schema for the configuration
const configSchema = new Schema({
  roundId: { type: Number, default: 1 },
  rewardItemAmountPerLegitPlayer: { type: Number, default: 0 },
  rewardItemAmountMax: { type: Number, default: 0 },
  rewardWinnerAmountPerLegitPlayer: { type: Number, default: 0 },
  rewardWinnerAmountMax: { type: Number, default: 0 },
  rewardItemAmount: { type: Number, default: 0 },
  rewardWinnerAmount: { type: Number, default: 0 },
  drops: {
    guardian: { type: Number, default: 1633043139000 },
    earlyAccess: { type: Number, default: 1633043139000 },
    trinket: { type: Number, default: 1641251240764 },
    santa: { type: Number, default: 1633043139000 },
  },
});

// Create the model from the schema
const Config = mongoose.model('Config', configSchema);

const path = require('path');
const shortId = require('shortid');

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
export class ShardBridge {
  spawnPort: number;
  id: string;
  emit: ReturnType<typeof createShardBridgeRouter>;
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

  async getSeerInfo(): Promise<any> {
    const res = await this.realm.seer.emit.info.query();
    if (res?.status === 1) {
      return res.data;
    }
    return null;
  }

  async connect(input: any, { client }: { client: ShardProxyClient }) {
    log('Connected: ' + client.key, client.id);

    const data = { id: client.id };
    const signature = await getSignedRequest(this.realm.web3, this.realm.secrets, data);

    await sleep(5000);
    console.log(client.emit.connected.mutate);
    client.emit.connected.mutate(
      { signature: { hash: signature.hash, address: signature.address }, data }
      // { context: { client } }
    );

    return { status: 1 };
  }

  disconnect(input: any, { client }: any) {
    log('Disconnected: ' + client.id);
    return { status: 1 };
  }

  async init({ status }: { status?: number }) {
    if (status !== 1) {
      logError('Could not init');
      return { status: 0 };
    }

    log('Shard instance initialized');
    const info = await this.getSeerInfo();

    if (!info) {
      logError('Could not fetch info');
      return { status: 0 };
    }

    this.info = info;
    this.isAuthed = true;

    return {
      status: 1,
      data: {
        id: shortId(),
        roundId: this.realm.config.roundId,
      },
    };
  }

  configure({ clients }: { clients?: Shard.Client[] }, ctx: any) {
    log('configure');
    const { config } = this;
    // TODO: add them
    this.clients = clients;

    for (const client of clients) {
      client.shardId = ctx.client.id;
    }

    config.totalLegitPlayers = 0;

    for (const client of clients) {
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

    config.rewardItemAmount = parseFloat(
      (
        Math.round(
          Math.min(config.totalLegitPlayers * config.rewardItemAmountPerLegitPlayer, config.rewardItemAmountMax) * 1000
        ) / 1000
      ).toFixed(3)
    );

    config.rewardWinnerAmount = parseFloat(
      (
        Math.round(
          Math.min(config.totalLegitPlayers * config.rewardWinnerAmountPerLegitPlayer, config.rewardWinnerAmountMax) *
            1000
        ) / 1000
      ).toFixed(3)
    );

    return {
      status: 1,
      data: {
        rewardWinnerAmount: config.rewardWinnerAmount,
        rewardItemAmount: config.rewardItemAmount,
      },
    };
  }

  async saveRound({ data }: { data?: any }, { client }: any) {
    const { config } = this;

    let failed = false;

    try {
      log('saveRound', data);

      const res = await this.realm.seer.emit.saveRound.mutate({
        shardId: client.id,
        roundId: this.realm.config.roundId,
        round: data,
        rewardWinnerAmount: config.rewardWinnerAmount,
        lastClients: this.clients,
      });

      if (res.status === 1) {
        return {
          status: 1,
          data: res,
        };
      } else {
        failed = true;
        log('Save round failed', res);
      }
    } catch (e) {
      logError('Save round failed', e);
      failed = true;
    }

    if (failed) {
      this.unsavedGames.push({
        gsid: this.id,
        roundId: this.realm.config.roundId,
        round: data,
        rewardWinnerAmount: config.rewardWinnerAmount,
      });

      return {
        status: 0,
        data: { rewardWinnerAmount: 0, rewardItemAmount: 0 },
      };
    } else {
      for (const game of this.unsavedGames.filter((g) => g.status === undefined)) {
        const res = await this.realm.seer.emit.saveRound.mutate(game);
        game.status = res.status;
      }

      this.unsavedGames = this.unsavedGames.filter((g) => g.status !== 1);
    }

    this.realm.config.roundId++;

    return { status: 1 };
  }

  async confirmProfile({ data }: { data?: { address?: string } }) {
    log('confirmProfile', data);

    let profile = this.realm.profiles[data.address];

    if (!profile) {
      const res = await this.realm.seer.emit.getProfile.query(data.address);

      if (res.data) {
        this.realm.profiles[data.address] = profile;
      }
    }

    if (this.clients.length > 100) {
      console.log('Too many clients'); // TODO: add to queue
      return { status: 0 };
    }

    const now = dayjs();

    if (profile.isBanned && dayjs(profile.banExpireDate).isAfter(now)) {
      return { status: 0 };
    }

    return {
      status: 1,
      isMod: this.realm.modList.includes(data.address) || this.realm.adminList.includes(data.address),
    };
  }

  auth({ data, signature }: { data?: string; signature?: { hash?: string; address?: string } }) {
    log('ShardBridge.auth', data, signature);

    const roles = [];

    if (signature.address.length !== 42 || signature.address.slice(0, 2) !== '0x') return { status: 0 };

    const normalizedAddress = this.realm.web3.utils.toChecksumAddress(signature.address.trim());

    if (!normalizedAddress) return { status: 0 };

    if (this.realm.web3.eth.accounts.recover(data, signature.hash).toLowerCase() !== signature.address.toLowerCase())
      return { status: 0 };

    if (this.realm.seerList.includes(normalizedAddress)) roles.push('seer');
    if (this.realm.adminList.includes(normalizedAddress)) roles.push('admin');
    if (this.realm.modList.includes(normalizedAddress)) roles.push('mod');

    return {
      status: 1,
      data: { roles },
    };
  }

  normalizeAddress({ address }: { address?: string }) {
    return {
      status: 1,
      data: { address: this.realm.web3.utils.toChecksumAddress(address.trim()) },
    };
  }

  getRandomReward({ data }: { data?: any }) {
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
        id: shortId.generate(),
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
      config.drops.guardian = now;
    } else if (
      dropItems &&
      now - config.drops.earlyAccess > 30 * 24 * 60 * 60 * 1000 &&
      randPerMonth === Math.round(timesPerMonth / 2)
    ) {
      tempReward = {
        id: shortId.generate(),
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
      config.drops.earlyAccess = now;
    } else if (
      dropItems &&
      now - config.drops.trinket > 24 * 60 * 60 * 1000 &&
      randPerDay === Math.round(timesPerDay / 4)
    ) {
      tempReward = {
        id: shortId.generate(),
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
      config.drops.trinket = now;
    } else {
      const odds = Array(1000).fill('runes');

      const rewardType = this.config.rewards[odds[random(0, odds.length - 1)]];
      if (!rewardType || rewardType.length === 0) {
        return { status: 2 };
      }

      const reward = rewardType[random(0, rewardType.length - 1)];
      if (reward.type === 'rune' && reward.quantity <= 0) {
        return { status: 3 };
      }

      tempReward = { ...reward, id: shortId.generate(), enabledDate: now };
      tempReward.position = config.level2open
        ? this.config.rewardSpawnPoints2[random(0, this.config.rewardSpawnPoints2.length - 1)]
        : this.config.rewardSpawnPoints[random(0, this.config.rewardSpawnPoints.length - 1)];
    }

    return {
      status: 1,
      reward: tempReward,
    };
  }

  bridge(id) {
    const existingShard = this.shards.find((s) => s.id === id);
    if (existingShard) {
      this.shards = this.shards.filter((s) => s.id !== id);
      if (existingShard?.socket) {
        existingShard.socket.close();

        // clearTimeout(existingShard.infoRequestTimeout);
        // clearTimeout(existingShard.connectTimeout);
      }
    }

    const shardProxyClient = new ShardProxyClient();

    shardProxyClient.id = id;
    shardProxyClient.key = 'local1';

    shardProxyClient.endpoint = (this.realm.isHttps ? 'https://' : 'http://') + 'localhost:' + this.spawnPort;

    shardProxyClient.socket = ioClient(shardProxyClient.endpoint, {
      transports: ['websocket'],
      upgrade: false,
      autoConnect: false,
      // pingInterval: 5000,
      // pingTimeout: 20000
      // extraHeaders: {
      //   "my-custom-header": "1234"
      // }
    });
    const customLink: TRPCLink<Shard.Router> =
      () =>
      ({ op, next }) => {
        return observable((observer) => {
          const { input, context } = op;
          const client = shardProxyClient;

          if (!client) {
            console.log('Emit Direct failed, no client', op);
            observer.complete();
            return;
          }

          if (!client.socket || !client.socket.emit) {
            console.log('Emit Direct failed, bad socket', op);
            observer.complete();
            return;
          }
          console.log('Emit Direct', op);

          client.socket.emit('trpc', { id: op.id, method: op.path, type: op.type, params: input });

          observer.complete();
        });
      };

    shardProxyClient.emit = createTRPCProxyClient<Shard.Router>({
      links: [customLink],
      transformer: dummyTransformer,
    });

    shardProxyClient.socket.onAny(async (eventName, res) => {
      try {
        log('shardProxyClient.socket.onAny', eventName, res);
        if (eventName === 'Events') return;

        if (res.id) {
          const { data } = res;

          log(`Callback ${this.ioCallbacks[id] ? 'Exists' : 'Doesnt Exist'}`, eventName);

          if (this.ioCallbacks[id]) {
            clearTimeout(this.ioCallbacks[id].timeout);

            this.ioCallbacks[id].resolve(data);

            delete this.ioCallbacks[id];
          }
        } else {
          const { method, params } = res;

          log('Shard bridge called', method, params);

          try {
            const ctx = { client: shardProxyClient };

            const createCaller = createCallerFactory(this.emit);
            const caller = createCaller(ctx);
            // @ts-ignore
            const result = await caller[method](params);
            // socket.emit('trpcResponse', { id, result });
            shardProxyClient.socket.emit('trpcResponse', { id, result });
          } catch (e) {
            shardProxyClient.socket.emit('trpcResponse', { id, error: e.message });
          }
        }
      } catch (e) {
        logError(e);
      }
    });

    // shardProxyClient.socket.addEventListener('message', async (message) => {
    //   const { type, id, method, params } = JSON.parse(message.data);

    //   if (type === 'trpc') {
    //     try {
    //       const ctx = { client: shardProxyClient };

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

    shardProxyClient.socket.addEventListener('connect', async () => {
      this.connect(null, { client: shardProxyClient });
    });

    shardProxyClient.socket.addEventListener('disconnect', async () => {
      log('Shard has disconnected');

      // if (client.isAdmin) {
      //   await this.seerDisconnected.mutate(await getSignedRequest(app.web3, app.secrets, {}), {});
      // }

      // client.log.clientDisconnected += 1;
      // delete app.sockets[client.id];
      // delete app.clientLookup[client.id];
      this.clients = this.clients.filter((c) => c.shardId !== shardProxyClient.id);
    });

    shardProxyClient.socket.connect();

    this.shards.push(shardProxyClient);

    this.spawnPort += 1; // TODO: just have the shard tell us what it is via discovery
  }
}

const createShardBridgeRouter = (shardBridge: ShardBridge) => {
  return router({
    // @ts-ignore
    connect: procedure.input(z.object({})).mutation(({ input, ctx }) => shardBridge.connect(input, ctx)),

    // @ts-ignore
    disconnect: procedure.input(z.object({})).mutation(({ input, ctx }) => shardBridge.disconnect(input, ctx)),

    init: procedure.input(z.object({ status: z.number() })).mutation(({ input }) => shardBridge.init(input)),

    configure: procedure
      .input(z.object({ clients: z.array(z.any()) }))
      .mutation(({ input, ctx }) => shardBridge.configure(input, ctx)),

    saveRound: procedure
      .input(
        z.object({
          data: z.object({
            status: z.number(),
            id: z.string(),
            startedDate: z.number(), // or Date if using Date objects
            endedAt: z.number().optional(),
            clients: z.array(z.any()),
            events: z.array(z.any()),
            states: z.array(z.any()),
          }),
        })
      )
      // @ts-ignore
      .mutation(({ input, ctx }) => shardBridge.saveRound(input, ctx)),

    confirmProfile: procedure
      .input(z.object({ data: z.object({ address: z.string() }) }))
      .mutation(({ input }) => shardBridge.confirmProfile(input)),

    auth: procedure
      .input(z.object({ data: z.string(), signature: z.object({ hash: z.string(), address: z.string() }) }))
      .mutation(({ input }) => shardBridge.auth(input)),

    normalizeAddress: procedure
      .input(z.object({ address: z.string() }))
      .mutation(({ input }) => shardBridge.normalizeAddress(input)),

    getRandomReward: procedure
      .input(z.object({ id: z.string(), data: z.any() }))
      .mutation(({ input }) => shardBridge.getRandomReward(input)),
  });
};

export async function init(realm, spawnPort) {
  const shardBridge = new ShardBridge({ realm });

  shardBridge.spawnPort = spawnPort;

  shardBridge.emit = createShardBridgeRouter(shardBridge);

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
      shardBridge.bridge(generateUuid());
    }, 20 * 1000);
  }, 1000);

  return shardBridge;
}
