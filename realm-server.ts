// import axios from 'axios';
import { getSignedRequest } from '@arken/node/web3';
import { getTime } from '@arken/node/util';
import { log, logError } from '@arken/node/log';
import { observable } from '@trpc/server/observable';
// import { emitDirect } from '@arken/websocket';
// import { upgradeCodebase } from '@arken/codebase';
// import { initTRPC, TRPCError } from '@trpc/server';
// import { customErrorFormatter, transformer, hasRole, validateRequest } from '@arken/node/rpc';
// import shortId from 'shortId';
import fs from 'fs';
import { createTRPCProxyClient, TRPCClientError, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { io as ioClient } from 'socket.io-client';
import { generateShortId } from '@arken/node/db';
import * as dotenv from 'dotenv';
import type { Types as SeerTypes } from '@arken/seer-protocol';
import { catchExceptions } from '@arken/node/process';
import type * as Arken from '@arken/seer-protocol/types';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketServer } from 'socket.io';
import { createRouter, createCallerFactory } from '@arken/evolution-protocol/realm/realm.router';
import type { Realm, Shard } from '@arken/evolution-protocol/types';
import { serialize, deserialize } from '@arken/node/rpc';
import { init as initShardbridge, ShardBridge } from './shard-bridge';
import { initWeb3 } from './web3';
import { initMonitor } from './monitor';
import packageJson from './package.json';

dotenv.config();

const SHARD_PORT_TO_HOSTNAME = new Map<number, string>([
  [4020, 'evolution-realm-shard-2.arken.gg'],
  [4021, 'evolution-realm-shard-3.arken.gg'],
  [4022, 'evolution-realm-shard-4.arken.gg'],
]);

const SHARD_PORTS = [4020, 4021, 4022] as const;

const REALM_KEY = 'asia1'; // you already used this in updateRealm
const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 2_500;
const HEARTBEAT_FAILS_TO_OFFLINE = 2; // require 2 consecutive fails before offline

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
  shardBridges: ShardBridge[];
  profiles: Record<string, Arken.Profile.Types.Profile>;
  web3: any; // Assume web3 is a configured instance
  secrets: any; // Secrets for signing
  // emit: Realm.Router;
  router: Realm.Router;
  seer: Realm.Seer;
  clients: Realm.Client[];
  playerRewards: Record<string, any>;
  spawnPort: number;
  id: string;

  constructor() {
    log('Process running on PID: ' + process.pid);

    this.id = generateShortId();
    this.router = createRouter(this as Realm.Service);

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

    this.isHttps = process.env.ARKEN_ENV !== 'local';

    if (this.isHttps) {
      this.https = require('https').createServer(
        {
          key: fs.readFileSync('/etc/letsencrypt/live/hoff.arken.gg/privkey.pem'), //fs.readFileSync(path.resolve('./privkey.pem')),
          cert: fs.readFileSync('/etc/letsencrypt/live/hoff.arken.gg/fullchain.pem'), // fs.readFileSync(path.resolve('./fullchain.pem')),
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
    catchExceptions(true);

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
      this.endpoint = 'evolution-realm-shard-1.arken.gg';
      this.clients = [];
      // this.sockets = {};
      this.shardBridges = [];
      this.profiles = {};
      this.seerList = ['0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C'];
      this.adminList = [
        '0xDfA8f768d82D719DC68E12B199090bDc3691fFc7',
        '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C',
        '0x954246b18fee13712C48E5a7Da5b78D88e8891d5',
      ];
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
        // const ip = socket.handshake.address.split('.').slice(0, 3).join('.');

        const ip = socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0] ?? socket.handshake.address;

        const baseIp = ip.includes(':')
          ? ip.split(':').slice(0, -1).join(':') // IPv6
          : ip.split('.').slice(0, -1).join('.'); // IPv4

        // const ip = 'HIDDEN';
        // @ts-ignore
        const client: Realm.Client = {
          id: socket.id,
          name: 'Unknown' + Math.floor(Math.random() * 999),
          address: null,
          ip: baseIp,
          info: null,
          lastReportedTime: getTime(),
          isSeer: false,
          isMod: false,
          isAdmin: false,
          log: {
            clientDisconnected: 0,
          },
        };

        log(`Client connected from ${client.ip} (${client.name})`);

        // this.sockets[client.id] = socket;
        this.clients.push(client);

        socket.on('trpc', async (message) => {
          const { id, method, params } = message;

          try {
            const ctx = { client, app: this };
            const createCaller = createCallerFactory(this.router);
            const caller = createCaller(ctx);
            log('Realm calling trpc service', id, method, params);
            const result = params ? await caller[method](deserialize(params)) : await caller[method]();
            log('Realm sending trpc response', method, params, result);
            socket.emit('trpcResponse', { id, result: result ? serialize(result) : {} });
          } catch (error) {
            log('Error while sending trpc message', method, params, error);
            socket.emit('trpcResponse', { id, result: {}, error: error.stack + '' });
          }
        });

        socket.on('trpcResponse', async (message) => {
          log('Realm trpcResponse message', message);
          const pack = message;
          log('Realm trpcResponse pack', pack);
          const { id } = pack;

          if (pack.error) {
            log('Realm callback - error occurred', pack, client.ioCallbacks[id] ? client.ioCallbacks[id].request : '');
            return;
          }

          try {
            log(`Realm callback ${client.ioCallbacks[id] ? 'Exists' : 'Doesnt Exist'}`);

            if (client.ioCallbacks[id]) {
              clearTimeout(client.ioCallbacks[id].timeout);

              client.ioCallbacks[id].resolve(pack);

              delete client.ioCallbacks[id];
            }
          } catch (e) {
            log('Realm trpcResponse error', id, e);
          }
        });

        socket.on('disconnect', async () => {
          log(`Client has disconnected: ${client.name} (${client.address})`);

          // TODO
          // if (client.isSeer) {
          //   for (const shard of this.shardBridges) {
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

  private pickNextAvailableShardTarget(): { spawnPort: number; endpoint: string } {
    const used = new Set<number>();

    for (const b of this.shardBridges ?? []) {
      used.add(b.spawnPort);
    }

    for (const port of SHARD_PORTS) {
      if (!used.has(port)) {
        const endpoint = SHARD_PORT_TO_HOSTNAME.get(port);
        if (!endpoint) throw new Error(`No hostname mapping found for port ${port}`);
        return { spawnPort: port, endpoint };
      }
    }

    throw new Error(
      `No shard ports available. In use: ${
        Array.from(used)
          .sort((a, b) => a - b)
          .join(', ') || '(none)'
      }`
    );
  }

  async createShard(
    input: Realm.RouterInput['createShard'],
    ctx: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['createShard']> {
    if (!this.seer) {
      throw new Error('Seer not connected');
    }

    log('Creating shard');

    try {
      const target = this.pickNextAvailableShardTarget();

      const shard: any = await initShardbridge(this, target.spawnPort);
      if (!shard) throw new Error('Could not create shard.');

      shard.spawnPort = target.spawnPort;
      shard.endpoint = target.endpoint;
      shard.status = 'Online';
      shard.heartbeatFails = 0;
      shard.lastHeartbeatOkAt = Date.now();

      await shard.init();

      this.shardBridges.push(shard);

      await this.pushRealmUpdateIfChanged();

      return {
        data: {
          id: shard.id,
          name: shard.name,
          realmId: shard.realmId,
        },
        message: `Shard ${shard.name} (${shard.id}) created.`,
      };
    } catch (e) {
      throw new Error('Unable to create shard: ' + e?.message);
    }
  }

  async getShards(
    input: Realm.RouterInput['getShards'],
    ctx: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['getShards']> {
    return [];
  }

  async connectSeer() {
    if (this.seer?.client?.status === 'Connected') {
      return { message: 'Seer already connected.' };
    }

    log('Connecting to seer');

    return new Promise((resolve, reject) => {
      // @ts-ignore
      const client: Realm.Client = {};

      client.ioCallbacks = {};

      const isLocal = process.env.ARKEN_ENV === 'local';

      client.endpoint = process.env['SEER_ENDPOINT' + (isLocal ? '_LOCAL' : '')];

      log('Connecting to Seer', client.endpoint);

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

      this.seer = {
        client,
        emit: createTRPCProxyClient<SeerTypes.Router>({
          links: [
            () =>
              ({ op, next }) => {
                return observable((observer) => {
                  const { input } = op;

                  op.context.client = client;

                  // @ts-ignore
                  op.context.client.roles = ['seer', 'admin', 'mod', 'user', 'guest'];

                  if (!client) {
                    log('Realm -> Seer: Emit Direct failed, no client', op);
                    observer.complete();
                    return;
                  }

                  if (!client.socket || !client.socket.emit) {
                    log('Realm -> Seer: Emit Direct failed, bad socket', op);
                    observer.complete();
                    return;
                  }

                  log('Realm -> Seer: Emit Direct', op);

                  const uuid = generateShortId();

                  const request = { id: uuid, method: op.path, type: op.type, params: serialize(input) };
                  client.socket.emit('trpc', request);

                  // save the ID and callback when finished
                  const timeout = setTimeout(() => {
                    log('Realm -> Seer: Request timed out', op);
                    delete client.ioCallbacks[uuid];
                    observer.error(new TRPCClientError('Realm -> Seer: Request timeout'));
                  }, 30000); // 15 seconds timeout

                  client.ioCallbacks[uuid] = {
                    request,
                    timeout,
                    resolve: (pack) => {
                      // log('Realm -> Seer: ioCallbacks.resolve', uuid, pack);
                      clearTimeout(timeout);
                      if (pack.error) {
                        observer.error(pack.error);
                      } else {
                        const result = deserialize(pack.result);
                        console.log('Realm -> Seer: ioCallbacks.resolve', result);

                        // @ts-ignore
                        if (result?.status !== 1) throw new Error('Realm -> Seer callback status error' + result);

                        observer.next({
                          // @ts-ignore
                          result: result ? result : { data: undefined },
                        });

                        observer.complete();
                      }
                      delete client.ioCallbacks[uuid]; // Cleanup after completion
                    },
                    reject: (error) => {
                      log('Realm -> Seer: ioCallbacks.reject', error);
                      clearTimeout(timeout);
                      observer.error(error);
                      delete client.ioCallbacks[uuid]; // Cleanup on error
                    },
                  };
                });
              },
          ],
          // transformer: dummyTransformer,
        }),
      };

      client.socket.on('trpcResponse', async (message) => {
        log('Seer client trpcResponse message', message);
        const pack = message;
        log('Seer trpcResponse pack', pack);
        const { id } = pack;

        if (pack.error) {
          log(
            'Seer client callback - error occurred',
            pack,
            client.ioCallbacks[id] ? client.ioCallbacks[id].request : ''
          );
          return;
        }

        try {
          log(`Seer client callback ${client.ioCallbacks[id] ? 'Exists' : 'Doesnt Exist'}`);

          if (client.ioCallbacks[id]) {
            clearTimeout(client.ioCallbacks[id].timeout);

            client.ioCallbacks[id].resolve(pack);

            delete client.ioCallbacks[id];
          }
        } catch (e) {
          log('Seer client trpcResponse error', id, e);
        }
      });

      const connect = async () => {
        log('Seer connected');
        // Initialize the realm server with status 1
        const signature = await getSignedRequest(this.web3, this.secrets, 'evolution');

        const res: Realm.RouterOutput['auth'] = await this.seer.emit.core.authorize.mutate({
          address: signature.address,
          token: signature.hash,
          data: signature.data,
        });

        log('Seer auth res', res);

        const profile: Realm.RouterOutput['auth'] = await this.seer.emit.profile.me.query();

        log('Seer profile res', profile);

        // Check if initialization was successful
        if (!profile) {
          console.error('Could not connect to seer. Retrying in 10 seconds.');
          // resolve({ status: 0 });

          setTimeout(connect, 10 * 1000);

          return;
        }

        // this.config = {
        //   ...this.config,
        //   profile,
        // };

        client.status = 'Connected';
        client.roles = profile.roles;
        client.permissions = profile.permissions;
        client.profile = profile;

        log('Seer connected', profile);

        this.startShardHeartbeatLoop();

        resolve({ message: 'Seer connected.' });
      };

      client.socket.addEventListener('connect', connect);
      client.socket.connect();
    });
  }

  async auth(input: Realm.RouterInput['auth'], { client }: Realm.ServiceContext): Promise<Realm.RouterOutput['auth']> {
    if (!input) throw new Error('Input should not be void');

    const { signature } = input;

    if (this.seerList.includes(signature.address)) {
      client.isSeer = true;
      client.isAdmin = true;
      client.isMod = true;
      client.roles = ['seer', 'admin', 'mod', 'user', 'guest'];
      // await this.onSeerConnected();
    } else if (this.adminList.includes(signature.address)) {
      client.isSeer = false;
      client.isAdmin = true;
      client.isMod = true;
      client.roles = ['admin', 'mod', 'user', 'guest'];
    } else if (this.modList.includes(signature.address)) {
      client.isSeer = false;
      client.isAdmin = false;
      client.isMod = true;
      client.roles = ['mod', 'user', 'guest'];
    } else {
      client.isSeer = false;
      client.isAdmin = false;
      client.isMod = false;
      client.roles = ['user', 'guest'];
    }

    return { roles: client.roles };
  }

  async setConfig(
    input: Realm.RouterInput['setConfig'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['setConfig']> {
    if (!input) throw new Error('Input should not be void');
    this.config = {
      ...this.config,
      ...input.config,
    };

    await this.shardBridges[input.shardId].router.setConfigRequest.mutate(
      await getSignedRequest(this.web3, this.secrets, input),
      input
    );
  }

  async ping(input: Realm.RouterInput['ping'], { client }: Realm.ServiceContext): Promise<Realm.RouterOutput['ping']> {}

  async info(input: Realm.RouterInput['info'], { client }: Realm.ServiceContext): Promise<Realm.RouterOutput['info']> {
    const games = this.shardBridges.map((shard) => shard.info).filter((info) => !!info);
    const playerCount = games.reduce((total, game) => total + game.playerCount, 0);
    const speculatorCount = games.reduce((total, game) => total + game.speculatorCount, 0);

    if (!this.config) {
      throw new Error('Config is not setup.');
    }

    const res = {
      playerCount: playerCount || 0,
      speculatorCount: speculatorCount || 0,
      version: this.version,
      authorizedProfile: {
        id: client.id,
      },
      games: games.map((game: any) => ({ id: game.id, gameMode: game.gameMode })),
      isSeerConnected: !!this.seer, // TODO: improve with heartbeat check
      // roundId: this.config.roundId,
      // gameMode: this.config.gameMode,
      // isRoundPaused: this.config.isRoundPaused,
      // isBattleRoyale: this.config.isBattleRoyale,
      // isGodParty: this.config.isGodParty,
      // level2open: this.config.level2open,
    };

    log('info res', res);

    return res;
  }

  async addMod(
    input: Realm.RouterInput['addMod'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['addMod']> {
    if (!input) throw new Error('Input should not be void');

    this.modList.push(input.target);
  }

  async removeMod(
    input: Realm.RouterInput['removeMod'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['removeMod']> {
    if (!input) throw new Error('Input should not be void');

    this.modList = this.modList.filter((addr) => addr !== input.target);
  }

  async claimMaster(
    input: Realm.RouterInput['claimMaster'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['claimMaster']> {
    if (!input) throw new Error('Input should not be void');

    // const bridge = this.shardBridges[input.shardId];
    // const res = await bridge.shard.emit.claimMaster.mutate(input.address);

    // if (res.status !== 1) {
    //   log('Failed to ban client', input);
    // }
  }

  async banClient(
    input: Realm.RouterInput['banClient'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['banClient']> {
    if (!input) throw new Error('Input should not be void');

    for (const shardId of Object.keys(this.shardBridges)) {
      const res = await this.shardBridges[shardId].banClient.mutate(input);
      if (res.status !== 1) {
        log('Failed to ban client', input.target, shardId);
      }
    }
  }

  async broadcast(
    input: Realm.RouterInput['broadcast'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['broadcast']> {
    if (!input) throw new Error('Input should not be void');

    // TODO: call seer
    // this.seer.emit.banUser.mutate(input);

    for (const shardId of Object.keys(this.shardBridges)) {
      await this.shardBridges[shardId].shard.emit.broadcast.mutate(input);
    }
  }

  async banUser(
    input: Realm.RouterInput['banUser'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['banUser']> {
    if (!input) throw new Error('Input should not be void');

    // TODO: call seer
    // this.seer.emit.banUser.mutate(input);

    for (const shardId of Object.keys(this.shardBridges)) {
      const res = await this.shardBridges[shardId].emit.kickClient.mutate(input);

      if (!res.status) {
        log('Failed to kick client', input.target, shardId);
      }
    }
  }

  async getState() {
    return {
      config: this.config,
      adminList: this.adminList,
      modList: this.modList,
    };
  }

  async unbanClient(
    input: Realm.RouterInput['unbanClient'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['unbanClient']> {
    if (!input) throw new Error('Input should not be void');

    for (const shardId of Object.keys(this.shardBridges)) {
      const res = await this.shardBridges[shardId].unbanClient.mutate({ target: input.target });

      if (!res) {
        log('Failed to kick client', input.target, shardId);
      }
    }
  }

  async matchShard(
    input: Realm.RouterInput['matchShard'],
    { client }: Realm.ServiceContext
  ): Promise<Realm.RouterOutput['matchShard']> {
    for (const shard of Object.values(this.shardBridges)) {
      if (shard.info.clientCount < this.config.maxClients) {
        return { endpoint: shard.endpoint, port: 80 };
      }
    }
    throw new Error('Failed to find shard');
  }

  // async call({ data, signature }: { data: { method: string }; signature: { address: string; hash: string } }) {
  //   return await this.call(data.method, signature, data);
  // }

  // private async onSeerConnected() {
  //   return await this.emit.seerConnected.mutate(await getSignedRequest(this.web3, this.secrets, {}), {});
  // }

  private heartbeatTimer?: NodeJS.Timeout;
  private lastPushedShardStateJson = '';

  private withTimeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(label)), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  private buildRealmShardsPayload() {
    return this.shardBridges
      .filter((s: any) => !!s?.endpoint)
      .map((s: any) => ({
        endpoint: s.endpoint,
        status: s.status ?? 'Offline',
        clientCount: s.clientCount ?? s.info?.clientCount ?? 0,
        clientMax: s.clientMax ?? this.config?.maxClients ?? 30,
        spawnPort: s.spawnPort, // optional but useful for debugging
        lastHeartbeatOkAt: s.lastHeartbeatOkAt ?? null, // optional if schema allows
      }));
  }

  private async pushRealmUpdateIfChanged() {
    if (!this.seer) return;

    const realmShards = this.buildRealmShardsPayload();
    const clientCount = realmShards.reduce((sum, s) => sum + (s.clientCount ?? 0), 0);

    // Only include fields you actually store in Realm schema
    const payload = {
      status: 'Online',
      regionCode: process.env.REGION,
      clientCount,
      clientMax: 30,
      realmShards,
    };

    const json = JSON.stringify(payload);
    if (json === this.lastPushedShardStateJson) return; // no changes -> no DB write

    this.lastPushedShardStateJson = json;

    try {
      await this.seer.emit.core.updateRealm.mutate({
        where: { key: { equals: REALM_KEY } },
        data: payload as any,
      });
    } catch (e: any) {
      logError('Failed to push realm update', e?.message ?? e);
      // Don't throw: heartbeat loop should keep running even if seer hiccups
    }
  }

  private async checkShardHeartbeat(shard: any, shardId: number) {
    // Initialize tracking fields if missing
    if (typeof shard.heartbeatFails !== 'number') shard.heartbeatFails = 0;
    if (!shard.status) shard.status = 'Online';

    try {
      const res = await this.withTimeout(
        shard.shard.emit.heartbeat.query({ realmId: this.id }),
        HEARTBEAT_TIMEOUT_MS,
        'heartbeat timeout'
      );

      if (res !== 'OK') throw new Error(`Unexpected heartbeat response: ${String(res)}`);

      shard.heartbeatFails = 0;
      shard.lastHeartbeatOkAt = Date.now();

      if (shard.status !== 'Online') {
        shard.status = 'Online';
        log(`Shard ${shardId} is back Online (${shard.endpoint})`);
      }
    } catch (e: any) {
      shard.heartbeatFails += 1;

      if (shard.heartbeatFails >= HEARTBEAT_FAILS_TO_OFFLINE && shard.status !== 'Offline') {
        shard.status = 'Offline';
        logError(`Shard ${shardId} marked Offline (${shard.endpoint}): ${e?.message ?? e}`);
      } else {
        logError(
          `Shard ${shardId} heartbeat failed (${shard.heartbeatFails}/${HEARTBEAT_FAILS_TO_OFFLINE}) (${shard.endpoint}): ${
            e?.message ?? e
          }`
        );
      }
    }
  }

  private startShardHeartbeatLoop() {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(async () => {
      if (!this.seer) return; // no point writing updates until connected

      // Run checks sequentially to avoid stampeding; change to Promise.allSettled if you prefer parallel.
      for (let i = 0; i < this.shardBridges.length; i++) {
        const shard = this.shardBridges[i];
        if (!shard) continue;
        // If shard bridge exists but shard client isn't ready yet, mark offline
        if (!(shard as any).shard?.emit?.heartbeat?.query) {
          (shard as any).status = 'Offline';
          continue;
        }

        await this.checkShardHeartbeat(shard as any, i);
      }

      await this.pushRealmUpdateIfChanged();
    }, HEARTBEAT_INTERVAL_MS);

    // Don't keep process alive solely because of the interval (optional)
    this.heartbeatTimer.unref?.();
  }
}

export function init() {
  const realmServer = new RealmServer();

  realmServer.init();

  return realmServer;
}
