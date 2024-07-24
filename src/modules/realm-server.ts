import axios from 'axios';
import { isValidRequest, getSignedRequest } from '@arken/node/util/web3';
import { log, logError, getTime } from '@arken/node/util';
import { emitDirect } from '@arken/node/util/websocket';
import { upgradeCodebase } from '@arken/node/util/codebase';
import { initTRPC } from '@trpc/server';
import { wsLink, createWSClient } from '@trpc/client/links/wsLink';
import { createTRPCProxyClient } from '@trpc/client';
import { z } from 'zod';

let app;
const t = initTRPC.create();

const shortId = require('shortid');

export const appRouter = t.router({
  authRequest: t.procedure
    .input(z.object({ signature: z.object({ address: z.string() }) }))
    .mutation(async ({ input, ctx: { socket } }) => {
      const { signature } = input;

      if (await isValidRequest(app.web3, input)) {
        if (app.realm.state.adminList.includes(signature.address)) {
          socket.currentClient.isAdmin = true;
          socket.currentClient.isMod = true;
          await app.gameBridge.apiConnected.mutate(await getSignedRequest(app.web3, app.secrets, {}), {});
        } else if (app.realm.state.modList.includes(signature.address)) {
          socket.currentClient.isMod = true;
        }

        return { status: 1 };
      } else {
        return { status: 0 };
      }
    }),

  setConfigRequest: t.procedure
    .input(z.object({ data: z.object({ config: z.record(z.any()) }), signature: z.object({ address: z.string() }) }))
    .mutation(async ({ input, ctx }) => {
      const { data, signature } = input;

      if (!(await isValidRequest(app.web3, input)) && app.realm.state.modList.includes(signature.address)) {
        return { status: 0 };
      }

      app.gameBridge.state.config = {
        ...app.gameBridge.state.config,
        ...data.config,
      };

      await app.gameBridge.setConfigRequest.mutate(await getSignedRequest(app.web3, app.secrets, data), data);
      return { status: 1 };
    }),

  pingRequest: t.procedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return { id: input.id };
  }),

  infoRequest: t.procedure
    .input(z.object({ signature: z.object({ address: z.string() }) }))
    .mutation(async ({ input, ctx }) => {
      const { signature } = input;

      if (!(await isValidRequest(app.web3, input)) || !app.realm.state.modList.includes(signature.address)) {
        return { status: 0 };
      }

      const games = app.gameBridge.state.servers.map((s) => s.info).filter((i) => !!i);
      app.gameBridge.state.config = {
        ...app.gameBridge.state.config,
        ...input.data.config,
      };

      const data = { isReset: true, config: app.gameBridge.state.config };
      await app.gameBridge.setConfigRequest.mutate(await getSignedRequest(app.web3, app.secrets, data), data);

      return {
        status: 1,
        data: {
          playerCount: games.reduce((a, b) => a + b.playerCount, 0) || 0,
          speculatorCount: games.reduce((a, b) => a + b.speculatorCount, 0) || 0,
          version: '1.0.0',
          games,
        },
      };
    }),

  addModRequest: t.procedure
    .input(z.object({ signature: z.object({ address: z.string() }), target: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { target, signature } = input;

      if ((await isValidRequest(app.web3, input)) && app.realm.state.modList.includes(signature.address)) {
        app.realm.state.modList.push(target);
        return { status: 1 };
      } else {
        return { status: 0 };
      }
    }),

  removeModRequest: t.procedure
    .input(z.object({ signature: z.object({ address: z.string() }), target: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { target, signature } = input;

      if ((await isValidRequest(app.web3, input)) && app.realm.state.modList.includes(signature.address)) {
        app.realm.state.modList = app.realm.state.modList.filter((addr) => addr !== target);
        return { status: 1 };
      } else {
        return { status: 0 };
      }
    }),

  banPlayerRequest: t.procedure
    .input(z.object({ data: z.object({ target: z.string() }) }))
    .mutation(async ({ input, ctx: { socket } }) => {
      const { data } = input;

      if (!socket.currentClient.isMod) {
        return { status: 2 };
      }

      const res = await app.realm.BanPlayerRequest.mutate(data);
      return { status: res.status };
    }),

  banUserRequest: t.procedure
    .input(
      z.object({
        data: z.object({ target: z.string(), bannedReason: z.string(), bannedUntil: z.string() }),
        signature: z.object({ address: z.string() }),
      })
    )
    .mutation(async ({ input, ctx: { socket } }) => {
      const { data, signature } = input;

      if (!socket.currentClient.isAdmin) {
        return { status: 2 };
      }

      let overview = {};

      try {
        overview = (await axios(`https://cache.arken.gg/users/${data.target}/overview.json`)).data;
      } catch (e) {}

      app.gameBridge.userCache[data.target] = {
        ...overview,
        isBanned: true,
        bannedReason: data.bannedReason,
        bannedUntil: data.bannedUntil,
      };

      await app.gameBridge.kickUser.mutate(await getSignedRequest(app.web3, app.secrets, data), data);
      return { status: 1 };
    }),

  bridgeStateRequest: t.procedure
    .input(z.object({ signature: z.object({ address: z.string() }) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.socket.currentClient.isMod) {
        return { status: 2 };
      }

      return { status: 1, state: ctx.app.gameBridge.state };
    }),

  unbanPlayerRequest: t.procedure
    .input(z.object({ data: z.object({ target: z.string() }) }))
    .mutation(async ({ input, ctx }) => {
      const { data } = input;

      if (!ctx.socket.currentClient.isMod) {
        return { status: 2 };
      }

      const res = await app.realm.UnbanPlayerRequest.mutate(data);
      return { status: res.status };
    }),

  findGameServer: t.procedure.input(z.void()).mutation(async ({ ctx }) => {
    return { endpoint: ctx.app.realm.endpoint, port: 7777 };
  }),

  callRequest: t.procedure
    .input(z.object({ data: z.object({ method: z.string(), signature: z.any(), data: z.any() }) }))
    .mutation(async ({ input, ctx }) => {
      const { data } = input;

      try {
        const result = await app.gameBridge.call(data.method, data.signature, data.data);
        return result;
      } catch (e) {
        return { status: 0 };
      }
    }),
});

async function sendEventToObservers(app, name, data = undefined) {
  try {
    log('Emit Observers', name); // , data)

    const signature = await getSignedRequest(app.web3, app.secrets, data);

    return new Promise((resolve, reject) => {
      const id = shortId();

      const timeout = setTimeout(function () {
        log('Request timeout', name);

        resolve({ status: 0, message: 'Request timeout' });

        delete app.realm.ioCallbacks[id];
      }, 60 * 1000);

      app.realm.ioCallbacks[id] = { resolve, reject, timeout };

      for (const socketId in app.realm.sockets) {
        const socket = app.realm.sockets[socketId];
        // console.log(socket, name, id, data)
        socket.emit(name, { id, signature, data });
      }
    });
  } catch (e) {
    logError(e);
  }
}

export type AppRouter = typeof appRouter;

export function initRealmServer(app) {
  log('initRealmServer');

  app.realm = {};

  app.realm.version = '2.0.0';

  app.realm.endpoint = 'ptr1.isles.arken.gg';

  app.realm.clients = []; // to storage clients

  app.realm.clientLookup = {};

  app.realm.ioCallbacks = {};

  app.realm.sockets = {}; // to storage sockets

  app.realm.state = {};

  // app.realm.state.banList = []

  app.realm.state.adminList = [
    '0xDfA8f768d82D719DC68E12B199090bDc3691fFc7', // ourselves
    '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C', // realm server
  ];

  app.realm.state.modList = [
    '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C', // realm server
    '0xa987f487639920A3c2eFe58C8FBDedB96253ed9B', // botter
    '0x1a367CA7bD311F279F1dfAfF1e60c4d797Faa6eb', // testman
    '0x545612032BeaDED7E9f5F5Ab611aF6428026E53E', // kevin
    '0x37470038C615Def104e1bee33c710bD16a09FdEf', // maiev
    '0x150F24A67d5541ee1F8aBce2b69046e25d64619c', // maiev
    '0xfE27380E57e5336eB8FFc017371F2147A3268fbE', // lazy?
    '0x3551691499D740790C4511CDBD1D64b2f146f6Bd', // panda
    '0xe563983d6f46266Ad939c16bD59E5535Ab6E774D', // disco
    '0x62c79c01c33a3761fe2d2aD6f8df324225b8073b', // binzy
    '0x82b644E1B2164F5B81B3e7F7518DdE8E515A419d',
    '0xeb3fCb993dDe8a2Cd081FbE36238E4d64C286AC0',
    // '0x2DF94b980FC880100D93072011675E6659C0ca21', // zavox
    // '0x9b229c01eEf692A780d8Fee2558AaEa9873C032f', // me
  ];

  // app.io.on('connection', onRealmConnection.bind(null, app));

  app.io.on('connection', (socket) => {
    console.log('Client connected');

    const ip = 'HIDDEN'; // socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.conn.remoteAddress?.split(':')[3]

    log('Client connected from ' + ip);

    const currentClient = {
      name: 'Unknown' + Math.floor(Math.random() * 999),
      id: socket.id,
      ip,
      lastReportedTime: getTime(),
      isMod: false,
      isAdmin: false,
      log: {
        clientDisconnected: 0,
      },
    };

    app.realm.sockets[currentClient.id] = socket;

    app.realm.clientLookup[currentClient.id] = currentClient;

    app.realm.clients.push(currentClient);

    socket.on('trpc', async (message) => {
      const { id, method, params } = message;

      try {
        const ctx = { app, socket }; // Your custom context, including `app` and `socket`
        const result = await appRouter.createCaller(ctx)[method](params);

        socket.emit('trpcResponse', { id, result });
      } catch (error) {
        socket.emit('trpcResponse', { id, error: error.message });
      }
    });

    socket.on('disconnect', async () => {
      log('Client has disconnected');

      if (currentClient.isAdmin) {
        await app.gameBridge.apiDisconnected.mutate(await getSignedRequest(app.web3, app.secrets, {}), {});
      }

      currentClient.log.clientDisconnected += 1;

      delete app.realm.sockets[currentClient.id];
      delete app.realm.clientLookup[currentClient.id];

      app.realm.clients = app.realm.clients.filter((c) => c.id !== currentClient.id);
    });
  });

  app.realm.upgrade = upgradeCodebase;

  app.realm.call = sendEventToObservers.bind(null, app);
}
