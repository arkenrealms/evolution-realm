import axios from 'axios';
import md5 from 'js-md5';
import dayjs from 'dayjs';
import jetpack from 'fs-jetpack';
import { spawn } from 'child_process';
import { io as ioClient } from 'socket.io-client';
import { isValidRequest, getSignedRequest } from '@arken/node/util/web3';
import { log, logError, random, getTime } from '@arken/node/util';
import { emitDirect } from '@arken/node/util/websocket';
import { upgradeGsCodebase, cloneGsCodebase } from '@arken/node/util/codebase';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { createTRPCProxyClient, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import { customErrorFormatter, transformer } from '@arken/node/util/rpc';
import type { Realm, Shard } from '@arken/evolution-protocol/types';
import { RealmServer } from './realm-server';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

const t = initTRPC.create();

function getSocket(app, endpoint) {
  log('Connecting to', endpoint);
  return ioClient(endpoint, {
    transports: ['websocket'],
    upgrade: false,
    autoConnect: false,
    // pingInterval: 5000,
    // pingTimeout: 20000
    // extraHeaders: {
    //   "my-custom-header": "1234"
    // }
  });
}

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

export class ShardBridge {
  emit: any;
  process: any;
  characters: any;
  spawnPort: any;
  info: any;
  isAuthed: boolean;
  socket: any;
  realm: RealmServer;
  shards: ShardProxyClient[];
  endpoint: string;
  key: string;

  constructor({ realm }: Context) {
    this.realm = realm;

    setInterval(() => {
      this.characters = {};
    }, 10 * 60 * 1000);

    setTimeout(() => {
      this.start();

      setTimeout(() => {
        this.connect();
      }, 10 * 1000);
    }, 1000);
  }

  start() {
    try {
      // const binaryPath = {
      //   linux: '../game-server/build/index.js',
      //   darwin: '../game-server/build/index.js',
      //   win32: ''
      // }[process.platform]

      process.env.GS_PORT = this.spawnPort + '';

      const env = {
        ...process.env,
        LOG_PREFIX: '[REGS]',
      };

      // Start the server
      this.process = spawn('node', ['-r', 'tsconfig-paths/register', 'build/index.js'], {
        cwd: path.resolve('./game-server'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process.stdout.pipe(process.stdout);
      this.process.stderr.pipe(process.stderr);

      this.process.on('exit', (code, signal) => {
        log(`Child process exited with code ${code} and signal ${signal}. Lets exit too.`);

        process.exit(1);
      });

      this.realm.subProcesses.push(this.process);

      process.env.GS_PORT = this.spawnPort + 1 + '';
    } catch (e) {
      log('startShardBridge error', e);
    }
  }

  async getSeerInfo(ctx: Context): Promise<any> {
    const res = await this.realm.seer.emit.info.query();
    if (res?.status === 1) {
      return res.data;
    }
    return null;
  }

  async connect(input: any, ctx: { client }) {
    log('Connected: ' + this.realm.config.serverKey);

    this.id = shortId();
    const data = { id: this.id };
    const signature = await getSignedRequest(this.realm.web3, this.realm.secrets, data);

    this.socket.emit('connected', { signature, data });

    return { status: 1 };
  }

  disconnect(input: any, { client }: any) {
    log('Disconnected: ' + client.id);
    return { status: 1 };
  }

  async init({ status }: { status: number }) {
    if (status !== 1) {
      logError('Could not init');
      return { status: 0 };
    }

    log('Shard instance initialized');
    const info = await this.getSeerInfo(this.ctx);

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

  configure({ clients }: { clients?: any[] }) {
    log('configure');
    const { config } = this.realm;
    this.realm.clients = clients;

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
    const { config } = this.realm;

    let failed = false;

    try {
      log('saveRound', data);

      const res = await this.realm.seer.emit.saveRound.mutate({
        shardId: client.id,
        roundId: config.roundId,
        round: data,
        rewardWinnerAmount: config.rewardWinnerAmount,
        lastClients: this.realm.clients,
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
      this.realm.unsavedGames.push({
        gsid: this.id,
        roundId: config.roundId,
        round: data,
        rewardWinnerAmount: config.rewardWinnerAmount,
      });

      return {
        status: 0,
        data: { rewardWinnerAmount: 0, rewardItemAmount: 0 },
      };
    } else {
      for (const game of this.realm.unsavedGames.filter((g) => g.status === undefined)) {
        const res = await this.realm.seer.emit.saveRound.mutate(game);
        game.status = res.status;
      }

      this.realm.unsavedGames = this.realm.unsavedGames.filter((g) => g.status !== 1);
    }

    this.realm.config.roundId++;

    return { status: 1 };
  }

  async confirmProfile({ data }: { data?: { address?: string } }) {
    log('confirmProfile', data);

    let profile = this.realm.profiles[data.address];

    if (!profile) {
      profile = await this.realm.seer.emit.getProfile(data.address).query();

      this.realm.profiles[data.address] = profile;
    }

    if (this.realm.clients.length > 100) {
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
    const { config } = this.realm;

    config.drops = config.drops || {};
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
          ? this.realm.config.rewardSpawnPoints2[random(0, this.realm.config.rewardSpawnPoints2.length - 1)]
          : this.realm.config.rewardSpawnPoints[random(0, this.realm.config.rewardSpawnPoints.length - 1)],
        enabledAt: now,
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
          ? this.realm.config.rewardSpawnPoints2[random(0, this.realm.config.rewardSpawnPoints2.length - 1)]
          : this.realm.config.rewardSpawnPoints[random(0, this.realm.config.rewardSpawnPoints.length - 1)],
        enabledAt: now,
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
          ? this.realm.config.rewardSpawnPoints2[random(0, this.realm.config.rewardSpawnPoints2.length - 1)]
          : this.realm.config.rewardSpawnPoints[random(0, this.realm.config.rewardSpawnPoints.length - 1)],
        enabledAt: now,
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

      const rewardType = this.realm.rewards[odds[random(0, odds.length - 1)]];
      if (!rewardType || rewardType.length === 0) {
        return { status: 2 };
      }

      const reward = rewardType[random(0, rewardType.length - 1)];
      if (reward.type === 'rune' && reward.quantity <= 0) {
        return { status: 3 };
      }

      tempReward = { ...reward, id: shortId.generate(), enabledAt: now };
      tempReward.position = config.level2open
        ? this.realm.config.rewardSpawnPoints2[random(0, this.realm.config.rewardSpawnPoints2.length - 1)]
        : this.realm.config.rewardSpawnPoints[random(0, this.realm.config.rewardSpawnPoints.length - 1)];
    }

    return {
      status: 1,
      reward: tempReward,
    };
  }

  bridge(id) {
    const existingShard = this.shards.find((s) => s.id === id);
    if (existingShard?.socket) {
      existingShard.socket.close();

      clearTimeout(existingShard.infoRequestTimeout);
      clearTimeout(existingShard.connectTimeout);
    }

    const shardProxyClient = new ShardProxyClient();

    shardProxyClient.emit = createTRPCProxyClient<Shard.Router>({
      links: [
        wsLink({
          client: this.socket.io.engine.transport.ws,
        }),
      ],
      transformer,
    });

    shardProxyClient.id = id;
    shardProxyClient.endpoint = 'localhost:' + app.spawnPort; // local.isles.arken.gg
    shardProxyClient.key = 'local1';
    shardProxyClient.socket = getSocket(app, (app.isHttps ? 'https://' : 'http://') + this.endpoint);
    shardProxyClient.socket.io.engine.on('upgrade', () => {
      console.log('Connection upgraded to WebSocket');
      console.log('WebSocket object:', this.socket.io.engine.transport.ws);
    });

    // Create WebSocket client for tRPC
    // const wsClient = createWSClient({
    //   url: (app.isHttps ? 'https://' : 'http://') + this.endpoint,
    //   // connectionParams: {}, // Optional: any params you want to pass during connection
    // });

    shardProxyClient.socket.on('trpc', async (message) => {
      const { id, method, params } = message;

      try {
        const ctx = { app, client };

        const createCaller = t.createCallerFactory(this.emit);
        const caller = createCaller(ctx);
        const result = await caller[method](params);
        this.socket.emit('trpcResponse', { id, result });
      } catch (e) {
        this.socket.emit('trpcResponse', { id, error: e.message });
      }
    });

    shardProxyClient.socket.on('disconnect', async () => {
      log('Room has disconnected');

      // if (client.isAdmin) {
      //   await this.seerDisconnected.mutate(await getSignedRequest(app.web3, app.secrets, {}), {});
      // }

      // client.log.clientDisconnected += 1;
      // delete app.sockets[client.id];
      // delete app.clientLookup[client.id];
      this.realm.clients = this.realm.clients.filter((c) => c.id !== client.id);
    });

    this.shards.push(shardProxyClient);
  }
}

const createShardBridgeRouter = (shardBridge: ShardBridge) => {
  return t.router({
    connect: t.procedure.input(z.object({})).mutation(() => shardBridge.connect()),

    disconnect: t.procedure.input(z.object({})).mutation(() => shardBridge.disconnect()),

    init: t.procedure.input(z.object({ status: z.number() })).mutation(({ input }) => shardBridge.init(input)),

    configure: t.procedure
      .input(z.object({ clients: z.array(z.any()) }))
      .mutation(({ input }) => shardBridge.configure(input)),

    saveRound: t.procedure
      .input(
        z.object({
          data: z.object({
            status: z.number(),
          }),
        })
      )
      .mutation(({ input }) => shardBridge.saveRound(input)),

    confirmProfile: t.procedure
      .input(z.object({ data: z.object({ address: z.string() }) }))
      .mutation(({ input }) => shardBridge.confirmProfile(input)),

    auth: t.procedure
      .input(z.object({ data: z.string(), signature: z.object({ hash: z.string(), address: z.string() }) }))
      .mutation(({ input }) => shardBridge.auth(input)),

    normalizeAddress: t.procedure
      .input(z.object({ address: z.string() }))
      .mutation(({ input }) => shardBridge.normalizeAddress(input)),

    getRandomReward: t.procedure
      .input(z.object({ id: z.string(), data: z.any() }))
      .mutation(({ input }) => shardBridge.getRandomReward(input)),
  });
};

export type Router = typeof createShardBridgeRouter;

export async function init(realm) {
  const shardBridge = new ShardBridge({ realm });

  shardBridge.emit = createShardBridgeRouter(shardBridge);

  // TODO: REMOVE, REPLACE WITH SEER
  await mongoose.connect('mongodb://localhost:27017/yourDatabase', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  let config = await Config.findOne();

  if (!config) {
    config = new Config({
      roundId: 1,
      rewardItemAmountPerLegitPlayer: 0,
      rewardItemAmountMax: 0,
      rewardWinnerAmountPerLegitPlayer: 0,
      rewardWinnerAmountMax: 0,
      rewardItemAmount: 0,
      rewardWinnerAmount: 0,
      drops: {
        guardian: 1633043139000,
        earlyAccess: 1633043139000,
        trinket: 1641251240764,
        santa: 1633043139000,
      },
    });

    await config.save();
  }
}
