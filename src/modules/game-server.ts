import axios from 'axios';
import md5 from 'js-md5';
import jetpack from 'fs-jetpack';
import { spawn } from 'child_process';
import { io as ioClient } from 'socket.io-client';
import { isValidRequest, getSignedRequest } from '@arken/node/util/web3';
import { log, logError, random, getTime } from '@arken/node/util';
import { emitDirect } from '@arken/node/util/websocket';
import { upgradeGsCodebase, cloneGsCodebase } from '@arken/node/util/codebase';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { createClient } from './trpc-client';
import { Config, GameState, ServerState } from './types';
import type { Router as GameWorldRouter } from '../game-world';
import { createTRPCProxyClient, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import { customErrorFormatter, transformer } from '@arken/node/util/rpc';
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

function startGameServer(app) {
  try {
    // const binaryPath = {
    //   linux: '../game-server/build/index.js',
    //   darwin: '../game-server/build/index.js',
    //   win32: ''
    // }[process.platform]

    process.env.GS_PORT = app.gameBridge.state.spawnPort + '';

    const env = {
      ...process.env,
      LOG_PREFIX: '[REGS]',
    };

    // Start the server
    app.gameBridge.process = spawn('node', ['-r', 'tsconfig-paths/register', 'build/index.js'], {
      cwd: path.resolve('./game-server'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    app.gameBridge.process.stdout.pipe(process.stdout);
    app.gameBridge.process.stderr.pipe(process.stderr);

    app.gameBridge.process.on('exit', (code, signal) => {
      log(`Child process exited with code ${code} and signal ${signal}. Lets exit too.`);

      process.exit(1);
      // setTimeout(() => {
      //   startGameServer(app)
      // }, 1000)
    });

    app.subProcesses.push(app.gameBridge.process);

    process.env.GS_PORT = app.gameBridge.state.spawnPort + 1 + '';
  } catch (e) {
    log('startGameServer error', e);
  }
}

async function callGameServer(app, name, signature, data = {}) {
  if (!app.gameBridge.socket?.connected) {
    log(`Can't send GS message, not connected.`);
    return Promise.reject();
  }

  return new Promise((resolve, reject) => {
    const id = shortId();

    const timeout = setTimeout(function () {
      resolve({ status: 0, message: 'Request timeout to GS' });

      delete app.gameBridge.ioCallbacks[id];
    }, 30 * 1000);

    app.gameBridge.ioCallbacks[id] = { resolve, reject, timeout };

    log('GS call: ', name, { id, data });

    app.gameBridge.socket.emit(name, { id, signature, data });
  });
}

async function fetchInfo(ctx: Context): Promise<any> {
  const res = await ctx.app.seer.info.query();
  if (res?.status === 1) {
    return res.data;
  }
  return null;
}
interface Context {
  app: AppContext;
}

interface AppContext {
  config: Config;
  gameState: GameState;
  serverState: ServerState;
  realm: ReturnType<typeof createClient>;
  gameBridge: any; // Placeholder for game bridge state
}

interface Context {
  app: AppContext;
}

interface AppContext {
  config: Config;
  gameState: GameState;
  serverState: ServerState;
  realm: ReturnType<typeof createClient>;
  web3: any; // Assume web3 is a configured instance
  secrets: any; // Secrets for signing
  gameBridge: any; // Placeholder for game bridge state
}

export class GameServer {
  endpoint: string;
  key: string;
  bridge?: ReturnType<typeof createTRPCProxyClient<GameBridgeRouter>>;
  router?: ReturnType<typeof t.router>;
  socket?: any;
  id: string;
  info: undefined;
  isAuthed: false;

  constructor(private ctx: Context) {}

  async connect() {
    log('Connected: ' + this.ctx.app.config.serverKey);

    this.id = shortId();
    const data = { id: this.id };
    const signature = await getSignedRequest(this.ctx.app.web3, this.ctx.app.secrets, data);

    this.ctx.app.serverState.socket.emit('connected', { signature, data });

    return { status: 1 };
  }

  disconnect() {
    log('Disconnected: ' + this.ctx.app.config.serverKey);
    return { status: 1 };
  }

  async init({ status }: { status: number }) {
    if (status !== 1) {
      logError('Could not init');
      return { status: 0 };
    }

    log('GS initialized');
    const info = await fetchInfo(this.ctx);

    if (!info) {
      logError('Could not fetch info');
      return { status: 0 };
    }

    this.ctx.app.serverState.info = info;
    this.ctx.app.serverState.isAuthed = true;

    return {
      status: 1,
      data: {
        id: shortId(),
        roundId: this.ctx.app.state.config.roundId,
      },
    };
  }

  configure({ clients }: { clients: any[] }) {
    log('configure');
    const { config } = this.ctx.app.state;
    this.ctx.app.state.clients = clients;

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

  async saveRound({ data }: { data: any }) {
    const { config } = this.ctx.app.state;

    let failed = false;

    try {
      log('saveRound', data);

      // Update player stat DB
      const res = await this.ctx.app.seer.saveRound.mutate({
        gsid: this.ctx.app.serverState.id,
        roundId: config.roundId,
        round: data,
        rewardWinnerAmount: config.rewardWinnerAmount,
        lastClients: this.ctx.app.state.clients,
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

    try {
      if (failed) {
        this.ctx.app.state.unsavedGames.push({
          gsid: this.ctx.app.serverState.id,
          roundId: config.roundId,
          round: data,
          rewardWinnerAmount: config.rewardWinnerAmount,
        });

        return {
          status: 0,
          data: { rewardWinnerAmount: 0, rewardItemAmount: 0 },
        };
      } else {
        for (const game of this.ctx.app.state.unsavedGames.filter((g) => g.status === undefined)) {
          const res = await this.ctx.app.seer.router.saveRound.mutate(game);
          game.status = res.status;
        }

        this.ctx.app.state.unsavedGames = this.ctx.app.state.unsavedGames.filter((g) => g.status !== 1);
      }

      this.ctx.app.state.config.roundId++;
    } catch (e) {
      logError(e);
      return { status: 0, data: { rewardWinnerAmount: 0, rewardItemAmount: 0 } };
    }

    return { status: 1 };
  }

  async confirmProfile({ data }: { data: { address: string } }) {
    try {
      log('confirmProfile', data);

      let overview = this.ctx.app.userCache[data.address];

      if (!overview) {
        try {
          overview = (await axios.get(`https://cache.arken.gg/profiles/${data.address}/overview.json`)).data;

          this.ctx.app.userCache[data.address] = overview;
        } catch (e) {
          return { status: 0 };
        }
      }

      if (this.ctx.app.state.clients.length > 50) {
        return { status: 0 };
      }

      const now = Date.now() / 1000;

      if (overview.isBanned && overview.bannedUntil > now) {
        return { status: 0 };
      }

      return {
        status: 1,
        isMod:
          this.ctx.app.realm.state.modList.includes(data.address) ||
          this.ctx.app.realm.state.adminList.includes(data.address),
      };
    } catch (e) {
      logError(e);
      return { status: 0 };
    }
  }

  verifySignature({ signature }: { signature: { data: string; hash: string; address: string } }) {
    try {
      return {
        status: 1,
        verified:
          this.ctx.app.web3.eth.accounts.recover(signature.data, signature.hash).toLowerCase() ===
          signature.address.toLowerCase(),
      };
    } catch (e) {
      logError(e);
      return { status: 0, verified: false };
    }
  }

  verifyAdminSignature({ signature }: { signature: { data: string; hash: string; address: string } }) {
    try {
      const normalizedAddress = this.ctx.app.web3.utils.toChecksumAddress(signature.address.trim());
      const isValid =
        this.ctx.app.web3.eth.accounts.recover(signature.data, signature.hash).toLowerCase() ===
          signature.address.toLowerCase() &&
        (this.ctx.app.realm.state.adminList.includes(normalizedAddress) ||
          this.ctx.app.realm.state.modList.includes(normalizedAddress));

      return {
        status: isValid ? 1 : 0,
        address: normalizedAddress,
      };
    } catch (e) {
      logError(e);
      return { status: 0, address: signature.address };
    }
  }

  normalizeAddress({ address }: { address: string }) {
    try {
      return {
        status: 1,
        address: this.ctx.app.web3.utils.toChecksumAddress(address.trim()),
      };
    } catch (e) {
      logError(e);
      return { status: 0, address };
    }
  }

  getRandomReward({ id, data }: { id: string; data: any }) {
    try {
      const now = getTime();
      const { config } = this.ctx.app.state;

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

      if (
        dropItems &&
        now - config.drops.guardian > 48 * 60 * 60 * 1000 &&
        randPerDay === Math.round(timesPerDay / 2)
      ) {
        tempReward = {
          id: shortId.generate(),
          position: config.level2open
            ? this.ctx.app.state.rewardSpawnPoints2[random(0, this.ctx.app.state.rewardSpawnPoints2.length - 1)]
            : this.ctx.app.state.rewardSpawnPoints[random(0, this.ctx.app.state.rewardSpawnPoints.length - 1)],
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
            ? this.ctx.app.state.rewardSpawnPoints2[random(0, this.ctx.app.state.rewardSpawnPoints2.length - 1)]
            : this.ctx.app.state.rewardSpawnPoints[random(0, this.ctx.app.state.rewardSpawnPoints.length - 1)],
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
            ? this.ctx.app.state.rewardSpawnPoints2[random(0, this.ctx.app.state.rewardSpawnPoints2.length - 1)]
            : this.ctx.app.state.rewardSpawnPoints[random(0, this.ctx.app.state.rewardSpawnPoints.length - 1)],
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

        const rewardType = this.ctx.app.state.rewards[odds[random(0, odds.length - 1)]];
        if (!rewardType || rewardType.length === 0) {
          return { status: 2 };
        }

        const reward = rewardType[random(0, rewardType.length - 1)];
        if (reward.type === 'rune' && reward.quantity <= 0) {
          return { status: 3 };
        }

        tempReward = { ...reward, id: shortId.generate(), enabledAt: now };
        tempReward.position = config.level2open
          ? this.ctx.app.state.rewardSpawnPoints2[random(0, this.ctx.app.state.rewardSpawnPoints2.length - 1)]
          : this.ctx.app.state.rewardSpawnPoints[random(0, this.ctx.app.state.rewardSpawnPoints.length - 1)];
      }

      return {
        status: 1,
        reward: tempReward,
      };
    } catch (e) {
      logError(e);
      return { status: 4 };
    }
  }

  connectGameServer(app, serverId) {
    if (app.realm.servers[serverId].socket) {
      app.gameBridge.socket.close();

      clearTimeout(app.gameBridge.infoRequestTimeout);
      clearTimeout(app.gameBridge.connectTimeout);
    }

    this.endpoint = 'localhost:' + app.realm.state.spawnPort; // local.isles.arken.gg
    this.key = 'local1';
    this.socket = getSocket(app, (app.isHttps ? 'https://' : 'http://') + this.endpoint);
    this.socket.io.engine.on('upgrade', () => {
      console.log('Connection upgraded to WebSocket');
      console.log('WebSocket object:', this.socket.io.engine.transport.ws);

      this.world = createTRPCProxyClient<GameWorldRouter>({
        links: [
          wsLink({
            client: this.socket.io.engine.transport.ws,
          }),
        ],
        transformer,
      });
    });

    // Create WebSocket client for tRPC
    // const wsClient = createWSClient({
    //   url: (app.isHttps ? 'https://' : 'http://') + this.endpoint,
    //   // connectionParams: {}, // Optional: any params you want to pass during connection
    // });

    this.socket.on('trpc', async (message) => {
      const { id, method, params } = message;

      try {
        const ctx = { ...app, socket, client };

        const createCaller = t.createCallerFactory(this.router);
        const caller = createCaller(ctx);
        const result = await caller[method](params);
        socket.emit('trpcResponse', { id, result });
      } catch (error) {
        socket.emit('trpcResponse', { id, error: error.message });
      }
    });

    this.socket.on('disconnect', async () => {
      log('Client has disconnected');

      if (client.isAdmin) {
        await app.gameBridge.apiDisconnected.mutate(await getSignedRequest(app.web3, app.secrets, {}), {});
      }

      client.log.clientDisconnected += 1;
      delete app.realm.sockets[client.id];
      delete app.realm.clientLookup[client.id];
      app.realm.clients = app.realm.clients.filter((c) => c.id !== client.id);
    });

    const t = initTRPC.create();

    this.router = t
      .router<Context>()
      .mutation('init', {
        input: z.object({ status: z.number() }),
        resolve: async ({ input, ctx }) => {
          if (input.status !== 1) {
            logError('Could not init');
            return { status: 0 };
          }

          log('GS initialized');
          const info = await fetchInfo(ctx);

          if (!info) {
            logError('Could not fetch info');
            return { status: 0 };
          }

          ctx.app.serverState.info = info;
          ctx.app.serverState.isAuthed = true;

          return {
            status: 1,
            data: {
              id: shortId(),
              roundId: ctx.app.state.config.roundId,
            },
          };
        },
      })
      .mutation('configure', {
        input: z.object({
          clients: z.array(z.any()),
        }),
        resolve: ({ input, ctx }) => {
          log('configure');
          const { config } = ctx.app.state;
          ctx.app.state.clients = input.clients;

          config.totalLegitPlayers = 0;

          for (const client of input.clients) {
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
                Math.min(config.totalLegitPlayers * config.rewardItemAmountPerLegitPlayer, config.rewardItemAmountMax) *
                  1000
              ) / 1000
            ).toFixed(3)
          );
          config.rewardWinnerAmount = parseFloat(
            (
              Math.round(
                Math.min(
                  config.totalLegitPlayers * config.rewardWinnerAmountPerLegitPlayer,
                  config.rewardWinnerAmountMax
                ) * 1000
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
        },
      })
      .mutation('saveRound', {
        input: z.object({ data: z.any() }),
        resolve: async ({ input, ctx }) => {
          const { config } = ctx.app.state;

          let failed = false;

          try {
            log('saveRound', input);

            // Update player stat DB
            const res = await ctx.app.seer.saveRound.mutate({
              gsid: ctx.app.serverState.id,
              roundId: config.roundId,
              round: input.data,
              rewardWinnerAmount: config.rewardWinnerAmount,
              lastClients: ctx.app.state.clients,
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

          try {
            if (failed) {
              ctx.app.state.unsavedGames.push({
                gsid: ctx.app.serverState.id,
                roundId: config.roundId,
                round: input.data,
                rewardWinnerAmount: config.rewardWinnerAmount,
              });

              return {
                status: 0,
                data: { rewardWinnerAmount: 0, rewardItemAmount: 0 },
              };
            } else {
              for (const game of ctx.app.state.unsavedGames.filter((g) => g.status === undefined)) {
                const res = await ctx.app.seer.router.saveRound.mutate(game);
                game.status = res.status;
              }

              ctx.app.state.unsavedGames = ctx.app.state.unsavedGames.filter((g) => g.status !== 1);
            }

            ctx.app.state.config.roundId++;
          } catch (e) {
            logError(e);
            return { status: 0, data: { rewardWinnerAmount: 0, rewardItemAmount: 0 } };
          }

          return { status: 1 };
        },
      })
      .mutation('confirmProfile', {
        input: z.object({
          data: z.object({
            address: z.string(),
          }),
        }),
        resolve: async ({ input, ctx }) => {
          try {
            log('confirmProfile', input);

            let overview = ctx.app.userCache[input.address];

            if (!overview) {
              try {
                overview = (await axios.get(`https://cache.arken.gg/profiles/${input.address}/overview.json`)).data;

                ctx.app.userCache[input.address] = overview;
              } catch (e) {
                return { status: 0 };
              }
            }

            if (ctx.app.state.clients.length > 50) {
              return { status: 0 };
            }

            const now = Date.now() / 1000;

            if (overview.isBanned && overview.bannedUntil > now) {
              return { status: 0 };
            }

            return {
              status: 1,
              isMod:
                ctx.app.realm.state.modList.includes(input.address) ||
                ctx.app.realm.state.adminList.includes(input.address),
            };
          } catch (e) {
            logError(e);
            return { status: 0 };
          }
        },
      })
      .mutation('verifySignature', {
        input: z.object({
          signature: z.object({
            data: z.string(),
            hash: z.string(),
            address: z.string(),
          }),
        }),
        resolve: ({ input, ctx }) => {
          try {
            return {
              status: 1,
              verified:
                ctx.app.web3.eth.accounts.recover(input.signature.data, input.signature.hash).toLowerCase() ===
                input.signature.address.toLowerCase(),
            };
          } catch (e) {
            logError(e);
            return { status: 0, verified: false };
          }
        },
      })
      .mutation('verifyAdminSignature', {
        input: z.object({
          data: z.object({
            signature: z.object({
              data: z.string(),
              hash: z.string(),
              address: z.string(),
            }),
          }),
        }),
        resolve: ({ input, ctx }) => {
          try {
            const normalizedAddress = ctx.app.web3.utils.toChecksumAddress(input.signature.address.trim());
            const isValid =
              ctx.app.web3.eth.accounts.recover(input.signature.data, input.signature.hash).toLowerCase() ===
                input.signature.address.toLowerCase() &&
              (ctx.app.realm.state.adminList.includes(normalizedAddress) ||
                ctx.app.realm.state.modList.includes(normalizedAddress));

            return {
              status: isValid ? 1 : 0,
              address: normalizedAddress,
            };
          } catch (e) {
            logError(e);
            return { status: 0, address: input.signature.address };
          }
        },
      })
      .mutation('normalizeAddress', {
        input: z.object({
          address: z.string(),
        }),
        resolve: ({ input, ctx }) => {
          try {
            return {
              status: 1,
              address: ctx.app.web3.utils.toChecksumAddress(input.address.trim()),
            };
          } catch (e) {
            logError(e);
            return { status: 0, address: input.address };
          }
        },
      })
      .mutation('getRandomReward', {
        input: z.object({
          id: z.string(),
          data: z.any(),
        }),
        resolve: ({ input, ctx }) => {
          try {
            const now = getTime();
            const { config } = ctx.app.state;

            config.drops = config.drops || {};
            config.drops.guardian = config.drops.guardian || 1633043139000;
            config.drops.earlyAccess = config.drops.earlyAccess || 1633043139000;
            config.drops.trinket = config.drops.trinket || 1633043139000;
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

            if (
              dropItems &&
              now - config.drops.guardian > 48 * 60 * 60 * 1000 &&
              randPerDay === Math.round(timesPerDay / 2)
            ) {
              tempReward = {
                id: shortId.generate(),
                position: config.level2open
                  ? ctx.app.state.rewardSpawnPoints2[random(0, ctx.app.state.rewardSpawnPoints2.length - 1)]
                  : ctx.app.state.rewardSpawnPoints[random(0, ctx.app.state.rewardSpawnPoints.length - 1)],
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
                  ? ctx.app.state.rewardSpawnPoints2[random(0, ctx.app.state.rewardSpawnPoints2.length - 1)]
                  : ctx.app.state.rewardSpawnPoints[random(0, ctx.app.state.rewardSpawnPoints.length - 1)],
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
                  ? ctx.app.state.rewardSpawnPoints2[random(0, ctx.app.state.rewardSpawnPoints2.length - 1)]
                  : ctx.app.state.rewardSpawnPoints[random(0, ctx.app.state.rewardSpawnPoints.length - 1)],
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

              const rewardType = ctx.app.state.rewards[odds[random(0, odds.length - 1)]];
              if (!rewardType || rewardType.length === 0) {
                return { status: 2 };
              }

              const reward = rewardType[random(0, rewardType.length - 1)];
              if (reward.type === 'rune' && reward.quantity <= 0) {
                return { status: 3 };
              }

              tempReward = { ...reward, id: shortId.generate(), enabledAt: now };
              tempReward.position = config.level2open
                ? ctx.app.state.rewardSpawnPoints2[random(0, ctx.app.state.rewardSpawnPoints2.length - 1)]
                : ctx.app.state.rewardSpawnPoints[random(0, ctx.app.state.rewardSpawnPoints.length - 1)];
            }

            return {
              status: 1,
              reward: tempReward,
            };
          } catch (e) {
            logError(e);
            return { status: 4 };
          }
        },
      });
  }
}

const createGameServerRouter = (ctx: Context) => {};

export type Router = typeof createGameServerRouter;

export async function init(app) {
  const gameServer = new GameServer({ app });

  gameServer.router = t.router({
    connect: t.procedure.input(z.object({})).mutation(() => gameServer.connect()),
    disconnect: t.procedure.input(z.object({})).mutation(() => gameServer.disconnect()),
    connect: t.procedure.input(z.object({})).mutation(({ input }) => gameServer.connect()),

    disconnect: t.procedure.input(z.object({})).mutation(() => gameServer.disconnect()),

    init: t.procedure.input(z.object({ status: z.number() })).mutation(({ input }) => gameServer.init(input)),

    configure: t.procedure
      .input(z.object({ clients: z.array(z.any()) }))
      .mutation(({ input }) => gameServer.configure(input)),

    saveRound: t.procedure.input(z.object({ data: z.any() })).mutation(({ input }) => gameServer.saveRound(input)),

    confirmProfile: t.procedure
      .input(z.object({ data: z.object({ address: z.string() }) }))
      .mutation(({ input }) => gameServer.confirmProfile(input)),

    verifySignature: t.procedure
      .input(z.object({ signature: z.object({ data: z.string(), hash: z.string(), address: z.string() }) }))
      .mutation(({ input }) => gameServer.verifySignature(input)),

    verifyAdminSignature: t.procedure
      .input(z.object({ signature: z.object({ data: z.string(), hash: z.string(), address: z.string() }) }))
      .mutation(({ input }) => gameServer.verifyAdminSignature(input)),

    normalizeAddress: t.procedure
      .input(z.object({ address: z.string() }))
      .mutation(({ input }) => gameServer.normalizeAddress(input)),

    getRandomReward: t.procedure
      .input(z.object({ id: z.string(), data: z.any() }))
      .mutation(({ input }) => gameServer.getRandomReward(input)),
  });

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
    // Save the default config to the database
    await config.save();
  }

  // Do something with the config data
  app.gameBridge.state.config = config;

  // app.gameBridge.state.config = jetpack.read(path.resolve('./public/data/config.json'), 'json') || {
  //   roundId: 1,
  //   rewardItemAmountPerLegitPlayer: 0,
  //   rewardItemAmountMax: 0,
  //   rewardWinnerAmountPerLegitPlayer: 0,
  //   rewardWinnerAmountMax: 0,
  //   rewardItemAmount: 0,
  //   rewardWinnerAmount: 0,
  //   drops: {
  //     guardian: 1633043139000,
  //     earlyAccess: 1633043139000,
  //     trinket: 1641251240764,
  //     santa: 1633043139000,
  //   },
  // };

  app.gameBridge.state.servers = [];

  app.gameBridge.process = null;

  app.gameBridge.call = callGameServer.bind(null, app);

  app.gameBridge.start = startGameServer.bind(null, app);

  app.gameBridge.connect = connectGameServer.bind(null, app);

  app.gameBridge.clone = cloneGsCodebase;

  app.gameBridge.upgrade = upgradeGsCodebase;

  app.gameBridge.characters = {};

  // Clear equipment cache every 10 mins
  setInterval(function () {
    app.gameBridge.characters = {};
  }, 10 * 60 * 1000);

  setTimeout(() => {
    app.gameBridge.start();

    setTimeout(() => {
      app.gameBridge.connect();
    }, 10 * 1000);
  }, 1000);
}
