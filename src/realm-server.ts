import axios from 'axios';
import { isValidRequest, getSignedRequest } from '@arken/node/util/web3';
import { log, logError, getTime, isEthereumAddress } from '@arken/node/util';
import { emitDirect } from '@arken/node/util/websocket';
import { upgradeCodebase } from '@arken/node/util/codebase';
import { initTRPC, TRPCError } from '@trpc/server';
import { customErrorFormatter, transformer, hasRole, validateRequest } from '@arken/node/util/rpc';
import shortId from 'shortId';
import packageJson from '../package.json';
import { z } from 'zod';
import type { Realm } from '@arken/evolution-protocol/types';
import { createRouter } from '@arken/evolution-protocol/realm/server';]

class RealmServer {
  app: Realm.Application;
  client: Realm.Client;
  shards: any;

  constructor(app: Realm.Application) {
    this.app = app;
    this.client = client;
    this.emit = createRouter(this);
  }

  async auth({ signature }: { signature: { address: string; hash: string } }) {
    const { address } = signature;

    if (this.app.seerList.includes(address)) {
      this.client.isSeer = true;
      this.client.isAdmin = true;
      this.client.isMod = true;
      // await this.onSeerConnected();
    } else if (this.app.adminList.includes(address)) {
      this.client.isSeer = false;
      this.client.isAdmin = true;
      this.client.isMod = true;
    } else if (this.app.modList.includes(address)) {
      this.client.isSeer = false;
      this.client.isAdmin = false;
      this.client.isMod = true;
    } else {
      this.client.isSeer = false;
      this.client.isAdmin = false;
      this.client.isMod = false;
    }

    return { status: 1 };
  }

  async setConfig({ data }: { data: { shardId: string; config: Record<string, any> } }) {
    this.app.config = {
      ...this.app.config,
      ...data.config,
    };

    await this.shards[data.shardId].router.setConfigRequest.mutate(
      await getSignedRequest(this.app.web3, this.app.secrets, data),
      data
    );

    return { status: 1 };
  }

  async ping() {
    return { status: 1 };
  }

  async info() {
    const games = this.clients.map((client) => client.info).filter((info) => !!info);
    const playerCount = games.reduce((total, game) => total + game.playerCount, 0);
    const speculatorCount = games.reduce((total, game) => total + game.speculatorCount, 0);

    return {
      status: 1,
      data: {
        playerCount,
        speculatorCount,
        version: this.app.version,
        games,
      },
    };
  }

  async addMod({
    signature,
    data: { target },
  }: {
    signature: { address: string; hash: string };
    data: { target: string };
  }) {
    this.app.modList.push(target);
    return { status: 1 };
  }

  async removeMod({
    signature,
    data: { target },
  }: {
    signature: { address: string; hash: string };
    data: { target: string };
  }) {
    this.app.modList = this.app.modList.filter((addr) => addr !== target);
    return { status: 1 };
  }

  async banClient({ data }: { data: { target: string } }) {
    for (const shardId of Object.keys(this.shards)) {
      const res = await this.shards[shardId].banClient.mutate(data);
      if (res.status !== 1) {
        log('Failed to ban client', data.target, shardId);
      }
    }
    return { status: 1 };
  }

  async banUser({
    data,
    signature,
  }: {
    data: { target: string; bannedReason: string; bannedUntil: string };
    signature: { address: string; hash: string };
  }) {
    this.seer.emit.banUser.mutate(data);

    for (const shardId of Object.keys(this.shards)) {
      const res = await this.shards[shardId].emit.kickClient.mutate(data);

      if (!res.status) {
        log('Failed to kick client', data.target, shardId);
      }
    }

    return { status: 1 };
  }

  async state() {
    return { status: 1, data: {
      config: this.app.config,
      adminList: this.app.adminList,
      modList: this.app.modList
    } };
  }

  async unbanClient({ data, signature }: { data: { target: string }; signature: { address: string; hash: string } }) {
    for (const shardId of Object.keys(this.shards)) {
      const res = await this.shards[shardId].unbanClient.mutate({ target: data.target });

      if (!res.status) {
        log('Failed to kick client', data.target, shardId);
      }
    }

    return { status: 1 }
  }

  async matchServer() {
    for (const server of Object.values(this.shards)) {
      if (server.clientCount < this.app.config.maxClients) {
        return { status: 1, endpoint: this.endpoint, port: 4020 };
      }
    }
    return { status: 0, message: 'Failed to find server' };
  }

  // async call({ data, signature }: { data: { method: string }; signature: { address: string; hash: string } }) {
  //   return await this.call(data.method, signature, data);
  // }

  // private async onSeerConnected() {
  //   return await this.emit.seerConnected.mutate(await getSignedRequest(this.app.web3, this.app.secrets, {}), {});
  // }
}

export function init(app: Realm.Application) {
  log('init realm server');

  app.version = packageJson.version;
  app.endpoint = 'ptr1.isles.arken.gg';
  app.clients = [];
  app.sockets = {};
  app.shards = {};
  app.profiles = {};
  app.adminList = ['0xDfA8f768d82D719DC68E12B199090bDc3691fFc7', '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C'];
  app.modList = [
    '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C',
    '0xa987f487639920A3c2eFe58C8FBDedB96253ed9B',
    '0x1a367CA7bD311F279F1dfAfF1e60c4d797Faa6eb',
    '0x545612032BeaDED7E9f5F5Ab611aF6428026E53E',
    '0x37470038C615Def104e1bee33c710bD16a09FdEf',
    '0x150F24A67d5541ee1F8aBce2b69046e25d64619c',
    '0xfE27380E57e5336eB8FFc017371F2147A3268fbE',
    '0x3551691499D740790C4511CDBD1D64b2f146f6Bd',
    '0xe563983d6f46266Ad939c16bD59E5535Ab6E774D',
    '0x62c79c01c33a3761fe2d2aD6f8df324225b8073b',
    '0x82b644E1B2164F5B81B3e7F7518DdE8E515A419d',
    '0xeb3fCb993dDe8a2Cd081FbE36238E4d64C286AC0',
  ];

  app.io.on('connection', (socket) => {
    const ip = 'HIDDEN';
    log('Client connected from ' + ip);

    const client: Realm.Client = {
      id: socket.id,
      name: 'Unknown' + Math.floor(Math.random() * 999),
      ip,
      info: null,
      lastReportedTime: getTime(),
      isMod: false,
      isAdmin: false,
      log: {
        clientDisconnected: 0,
      },
    };

    app.sockets[client.id] = socket;
    app.clients.push(client);
    app.shards = [];
    app.playerRewards = {} as any;
    this.spawnPort = app.isHttps ? process.env.GS_SSL_PORT || 8443 : process.env.GS_PORT || 8080;
    this.rewards = {
      runes: [
        {
          type: 'rune',
          symbol: 'solo',
          quantity: 100,
        },
        {
          type: 'rune',
          symbol: 'tyr',
          quantity: 100,
        },
        {
          type: 'rune',
          symbol: 'nen',
          quantity: 100,
        },
        {
          type: 'rune',
          symbol: 'isa',
          quantity: 10000,
        },
        {
          type: 'rune',
          symbol: 'han',
          quantity: 100,
        },
        {
          type: 'rune',
          symbol: 'ro',
          quantity: 10000,
        },
        {
          type: 'rune',
          symbol: 'thal',
          quantity: 10000,
        },
        {
          type: 'rune',
          symbol: 'ash',
          quantity: 10000,
        },
        {
          type: 'rune',
          symbol: 'ore',
          quantity: 10000,
        },
        {
          type: 'rune',
          symbol: 'sen',
          quantity: 100,
        },
        {
          type: 'rune',
          symbol: 'tai',
          quantity: 10000,
        },
        {
          type: 'rune',
          symbol: 'da',
          quantity: 100,
        },
        {
          type: 'rune',
          symbol: 'zel',
          quantity: 0,
        },
      ],
      items: [],
      characters: [
        {
          type: 'character',
          tokenId: '1',
        },
      ],
    } as any;

    app.profiles = {};

    // Override because we didnt get response from RS yet
    app.config.rewardItemAmount = 0;
    app.config.rewardWinnerAmount = 0;
    app.rewardSpawnPoints = [
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
    app.rewardSpawnPoints2 = [
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

    socket.on('trpc', async (message) => {
      const { id, method, params } = message;

      try {
        const ctx = { app, socket, client };
        const createCaller = t.createCallerFactory(app.router);
        const caller = createCaller(ctx);
        const result = await caller[method](params);
        socket.emit('trpcResponse', { id, result });
      } catch (error) {
        socket.emit('trpcResponse', { id, error: error.message });
      }
    });

    socket.on('disconnect', async () => {
      log('Client has disconnected');

      if (client.isSeer) {
        for (const shardId of Object.keys(app.shards)) {
        await app.shards[shardId].emit.seerDisconnected.mutate() // await getSignedRequest(app.web3, app.secrets, {}), {});
        }
      }

      // client.log.clientDisconnected += 1;
      // delete app.sockets[client.id];
      // delete app.clientLookup[client.id];
      // app.clients = app.clients.filter((c) => c.id !== client.id);
    });
  });

  // app.upgrade = upgradeCodebase;
  // app.call = sendEventToObshards.bind(null, app);
}
