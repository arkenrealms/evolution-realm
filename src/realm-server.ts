// import axios from 'axios';
import { getSignedRequest } from '@arken/node/util/web3';
import { log, logError, getTime } from '@arken/node/util';
import { observable } from '@trpc/server/observable';
// import { emitDirect } from '@arken/node/util/websocket';
// import { upgradeCodebase } from '@arken/node/util/codebase';
// import { initTRPC, TRPCError } from '@trpc/server';
// import { customErrorFormatter, transformer, hasRole, validateRequest } from '@arken/node/util/rpc';
// import shortId from 'shortId';
import fs from 'fs';
import { createTRPCProxyClient, TRPCClientError, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { io as ioClient } from 'socket.io-client';
import { generateShortId } from '@arken/node/util/db';
import * as dotenv from 'dotenv';
import type { Router as SeerRouter } from '@arken/evolution-protocol/realm/seer.router';
// import mongoose from 'mongoose';
import { catchExceptions } from '@arken/node/util/process';
import { dummyTransformer } from '@arken/node/util/rpc';
import type * as Arken from '@arken/node/types';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import packageJson from '../package.json';
// import { z } from 'zod';
import { createRouter, createCallerFactory } from '@arken/evolution-protocol/realm/realm.router';
import { initWeb3 } from './web3';
import { initMonitor } from './monitor';
import type { Realm, Shard } from '@arken/evolution-protocol/types';
import { init as initShardbridge, ShardBridge } from './shard-bridge';

dotenv.config();

export class RealmServer implements Realm.Service {
  client: Realm.Client;
  state: Arken.Core.Types.Data;
  server: Express;
  isHttps: boolean;
  https?: HttpsServer;
  http?: HttpServer;
  io: SocketServer;
  config: Realm.ApplicationConfig;
  maxClients: number;
  subProcesses: any[];
  seerList: string[];
  adminList: string[];
  modList: string[];
  // sockets: Record<string, any>;
  version: string;
  endpoint: string;
  shards: ShardBridge[];
  profiles: Record<string, Arken.Profile.Types.Profile>;
  web3: any; // Assume web3 is a configured instance
  secrets: any; // Secrets for signing
  emit: Realm.Router;
  seer: Realm.Seer;
  clients: Realm.Client[];
  playerRewards: Record<string, any>;
  spawnPort: number;

  constructor() {
    log('Process running on PID: ' + process.pid);

    this.emit = createRouter(this as Realm.Service);

    this.subProcesses = [];

    this.server = express();
    this.server.set('trust proxy', 1);
    this.server.use(helmet());
    this.server.use(
      cors({
        allowedHeaders: [
          'Accept',
          'Authorization',
          'Cache-Control',
          'X-Requested-With',
          'Content-Type',
          'applicationId',
        ],
      })
    );

    this.isHttps = false; // process.env.ARKEN_ENV !== 'local';

    if (this.isHttps) {
      this.https = require('https').createServer(
        {
          key: fs.readFileSync(path.resolve('./privkey.pem')),
          cert: fs.readFileSync(path.resolve('./fullchain.pem')),
        },
        this.server
      );
    } else {
      this.http = require('http').Server(this.server);
    }

    this.io = new SocketServer(this.isHttps ? this.https : this.http, {
      pingInterval: 30 * 1000,
      pingTimeout: 90 * 1000,
      upgradeTimeout: 20 * 1000,
      allowUpgrades: true,
      cookie: false,
      serveClient: false,
      allowEIO3: true,
      cors: {
        origin: '*',
      },
    });
  }

  async init() {
    catchExceptions();

    try {
      log('RealmServer init');

      // await mongoose.connect(process.env.DATABASE_URL!, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // });

      if (this.isHttps) {
        const sslPort = process.env.REALM_SSL_PORT || 443;
        this.https.listen(sslPort, function () {
          log(`:: Server ready and listening on *:${sslPort} (https)`);
        });
      } else {
        // Finalize
        const port = process.env.REALM_PORT || 80;
        this.http.listen(port, function () {
          log(`:: Server ready and listening on *:${port} (http)`);
        });
      }

      this.version = packageJson.version;
      this.endpoint = 'rs1.evolution.arken.asi.sh';
      this.clients = [];
      // this.sockets = {};
      this.shards = [];
      this.profiles = {};
      this.seerList = ['0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C'];
      this.adminList = ['0xDfA8f768d82D719DC68E12B199090bDc3691fFc7', '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C'];
      this.modList = [
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
      this.playerRewards = {} as any;
      this.spawnPort = this.isHttps
        ? parseInt(process.env.SHARD_SSL_PORT || '8443')
        : parseInt(process.env.SHARD_PORT || '8080');

      await initWeb3(this);

      // this.connectSeer()
      // this.initShard();
      // Override because we didnt get response from RS yet

      this.io.on('connection', (socket) => {
        const ip = 'HIDDEN';
        log('Client connected from ' + ip);

        // @ts-ignore
        const client: Realm.Client = {
          id: socket.id,
          name: 'Unknown' + Math.floor(Math.random() * 999),
          ip,
          info: null,
          lastReportedTime: getTime(),
          isSeer: false,
          isMod: false,
          isAdmin: false,
          log: {
            clientDisconnected: 0,
          },
        };

        // this.sockets[client.id] = socket;
        this.clients.push(client);

        socket.on('trpc', async (message) => {
          const { id, method, params } = message;

          try {
            const ctx = { client, app: this };
            const createCaller = createCallerFactory(this.emit);
            const caller = createCaller(ctx);
            console.log('Realm calling trpc service', id, method, params);
            const result = await caller[method](params);
            console.log('Realm sending trpc response', result);
            socket.emit('trpcResponse', { id, result });
          } catch (error) {
            socket.emit('trpcResponse', { id, error: error.message });
          }
        });

        socket.on('trpcResponse', async (message) => {
          log('Shard client trpcResponse message', message);
          const pack = message;
          console.log('Shard client trpcResponse pack', pack);
          const { id } = pack;

          if (pack.error) {
            console.log(
              'Shard client callback - error occurred',
              pack,
              client.ioCallbacks[id] ? client.ioCallbacks[id].request : ''
            );
            return;
          }

          try {
            log(`Shard client callback ${client.ioCallbacks[id] ? 'Exists' : 'Doesnt Exist'}`);

            if (client.ioCallbacks[id]) {
              clearTimeout(client.ioCallbacks[id].timeout);

              client.ioCallbacks[id].resolve(pack.result);

              delete client.ioCallbacks[id];
            }
          } catch (e) {
            console.log('Shard client trpcResponse error', id, e);
          }
        });

        socket.on('disconnect', async () => {
          log('Client has disconnected');

          // TODO
          // if (client.isSeer) {
          //   for (const shard of this.shards) {
          //     await shard.emit.seerDisconnected.query(); // await getSignedRequest(this.web3, this.secrets, {}), {});
          //   }
          // }

          // client.log.clientDisconnected += 1;
          // delete this.sockets[client.id];
          // delete this.clientLookup[client.id];
          // this.clients = this.clients.filter((c) => c.id !== client.id);
        });
      });

      // await this.connectSeer();

      // this.upgrade = upgradeCodebase;
      // this.call = sendEventToObshards.bind(null, app);

      if (process.env.ARKEN_ENV !== 'local') await initMonitor(this);

      // await initWebServer(this);
    } catch (e) {
      console.error(e);
    }
  }

  async createShard(
    input: Realm.RouterInput['createShard'],
    ctx: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['createShard']> {
    if (!this.seer) {
      return {
        status: 0,
        error: 'Seer not connected',
      };
    }

    const shard = await initShardbridge(this, this.spawnPort);

    this.spawnPort += 1;

    this.shards.push(shard);

    return {
      status: 1,
      data: shard,
    };
  }

  async getShards(
    input: Realm.RouterInput['getShards'],
    ctx: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['getShards']> {
    return {
      status: 1,
      data: [],
    };
  }

  async connectSeer() {
    // @ts-ignore
    const client: Realm.Client = {};

    client.ioCallbacks = {};

    client.endpoint = process.env.SEER_ENDPOINT;

    client.socket = ioClient(client.endpoint, {
      transports: ['websocket'],
      upgrade: true,
      autoConnect: false,
      // pingInterval: 5000,
      // pingTimeout: 20000
      // extraHeaders: {
      //   "my-custom-header": "1234"
      // }
    });

    this.seer = {
      client,
      emit: createTRPCProxyClient<SeerRouter>({
        links: [
          () =>
            ({ op, next }) => {
              const uuid = generateShortId();
              return observable((observer) => {
                const { input } = op;

                op.context.client = client;
                // @ts-ignore
                op.context.client.roles = ['admin', 'user', 'guest'];

                if (!client) {
                  console.log('Realm -> Seer: Emit Direct failed, no client', op);
                  observer.complete();
                  return;
                }

                if (!client.socket || !client.socket.emit) {
                  console.log('Realm -> Seer: Emit Direct failed, bad socket', op);
                  observer.complete();
                  return;
                }
                console.log('Realm -> Seer: Emit Direct', op, client.socket);

                const request = { id: uuid, method: op.path, type: op.type, params: input };
                client.socket.emit('trpc', request);

                // save the ID and callback when finished
                const timeout = setTimeout(() => {
                  console.log('Realm -> Seer: Request timed out', op);
                  delete client.ioCallbacks[uuid];
                  observer.error(new TRPCClientError('Realm -> Seer: Request timeout'));
                }, 15000); // 15 seconds timeout

                client.ioCallbacks[uuid] = {
                  request,
                  timeout,
                  resolve: (response) => {
                    console.log('Realm -> Seer: ioCallbacks.resolve', uuid, response);
                    clearTimeout(timeout);
                    observer.next(response);
                    observer.complete();
                    delete client.ioCallbacks[uuid]; // Cleanup after completion
                  },
                  reject: (error) => {
                    console.log('Realm -> Seer: ioCallbacks.reject', error);
                    clearTimeout(timeout);
                    observer.error(error);
                    delete client.ioCallbacks[uuid]; // Cleanup on error
                  },
                };
              });
            },
        ],
        transformer: dummyTransformer,
      }),
    };

    client.socket.on('trpcResponse', async (message) => {
      log('Shard seer client trpcResponse message', message);
      const pack = message;
      console.log('Shard client trpcResponse pack', pack);
      const { id } = pack;

      if (pack.error) {
        console.log(
          'Shard seer client callback - error occurred',
          pack,
          client.ioCallbacks[id] ? client.ioCallbacks[id].request : ''
        );
        return;
      }

      try {
        log(`Shard  seerclient callback ${client.ioCallbacks[id] ? 'Exists' : 'Doesnt Exist'}`);

        if (client.ioCallbacks[id]) {
          clearTimeout(client.ioCallbacks[id].timeout);

          client.ioCallbacks[id].resolve(pack.result);

          delete client.ioCallbacks[id];
        }
      } catch (e) {
        console.log('Shard seer client trpcResponse error', id, e);
      }
    });

    client.socket.connect();

    // Initialize the realm server with status 1
    const data = { address: this.secrets.address }; // TODO: timestamp
    const signature = await getSignedRequest(this.web3, this.secrets, data);

    const res = await this.seer.emit.auth.mutate({
      data,
      signature: { hash: signature.hash, address: signature.address },
    });

    // Check if initialization was successful
    if (res?.status !== 1) {
      console.error('Could not connect to seer');
      return { status: 0 };
    }

    this.config = {
      ...this.config,
      ...(res.config as any),
    };

    log('Seer connected', res);
  }

  async auth(input: Realm.RouterInput['auth'], ctx: Realm.ServiceContext) {
    if (!input) throw new Error('Input should not be void');

    const { signature } = input;

    if (this.seerList.includes(signature.address)) {
      ctx.client.isSeer = true;
      ctx.client.isAdmin = true;
      ctx.client.isMod = true;
      // await this.onSeerConnected();
    } else if (this.adminList.includes(signature.address)) {
      ctx.client.isSeer = false;
      ctx.client.isAdmin = true;
      ctx.client.isMod = true;
    } else if (this.modList.includes(signature.address)) {
      ctx.client.isSeer = false;
      ctx.client.isAdmin = false;
      ctx.client.isMod = true;
    } else {
      ctx.client.isSeer = false;
      ctx.client.isAdmin = false;
      ctx.client.isMod = false;
    }

    return { status: 1 };
  }

  async setConfig({ data }: { data?: { shardId?: string; config?: Record<string, any> } }) {
    this.config = {
      ...this.config,
      ...data.config,
    };

    await this.shards[data.shardId].router.setConfigRequest.mutate(
      await getSignedRequest(this.web3, this.secrets, data),
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
        version: this.version,
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
    this.modList.push(target);
    return { status: 1 };
  }

  async removeMod({
    signature,
    data: { target },
  }: {
    signature: { address: string; hash: string };
    data: { target: string };
  }) {
    this.modList = this.modList.filter((addr) => addr !== target);
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
    data: { target: string; banReason: string; banExpireDate: string };
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

  async getState() {
    return {
      status: 1,
      data: {
        config: this.config,
        adminList: this.adminList,
        modList: this.modList,
      },
    };
  }

  async unbanClient({ data, signature }: { data: { target: string }; signature: { address: string; hash: string } }) {
    for (const shardId of Object.keys(this.shards)) {
      const res = await this.shards[shardId].unbanClient.mutate({ target: data.target });

      if (!res.status) {
        log('Failed to kick client', data.target, shardId);
      }
    }

    return { status: 1 };
  }

  async matchShard() {
    for (const shard of Object.values(this.shards)) {
      if (shard.info.clientCount < this.config.maxClients) {
        return { status: 1, endpoint: shard.endpoint, port: 80 };
      }
    }
    return { status: 0, message: 'Failed to find shard' };
  }

  // async call({ data, signature }: { data: { method: string }; signature: { address: string; hash: string } }) {
  //   return await this.call(data.method, signature, data);
  // }

  // private async onSeerConnected() {
  //   return await this.emit.seerConnected.mutate(await getSignedRequest(this.web3, this.secrets, {}), {});
  // }
}

export function init() {
  const realmServer = new RealmServer();

  realmServer.init();

  return realmServer;
}
