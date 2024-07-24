import jetpack from 'fs-jetpack';
import fs from 'fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { log, logError } from '@arken/node/util';
import { catchExceptions } from '@arken/node/util/process';
import { initWeb3 } from './modules/web3';
import { initRealmServer } from './modules/realm-server';
import { initWebServer } from './modules/web-server';
import { initGameBridge } from './modules/game-bridge';
import { initMonitor } from './modules/monitor';
import * as tests from './tests';

dotenv.config();

const path = require('path');

async function init() {
  catchExceptions();

  try {
    log('App init');

    const app = {} as any;

    await mongoose.connect(process.env.DATABASE_URL, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    app.state = {};

    app.state.unsavedGames = jetpack.read(path.resolve('./public/data/unsavedGames.json'), 'json') || [];

    app.flags = {
      testBanSystem: false,
    };

    app.tests = tests;

    app.server = express();

    // Security related
    app.server.set('trust proxy', 1);
    app.server.use(helmet());
    app.server.use(
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

    app.isHttps = process.env.ARKEN_ENV !== 'local';

    if (app.isHttps) {
      app.https = require('https').createServer(
        {
          key: fs.readFileSync(path.resolve('./privkey.pem')),
          cert: fs.readFileSync(path.resolve('./fullchain.pem')),
        },
        app.server
      );
    } else {
      app.http = require('http').Server(app.server);
    }

    app.io = require('socket.io')(app.isHttps ? app.https : app.http, {
      secure: app.isHttps ? true : false,
      port: app.isHttps ? process.env.RS_SSL_PORT || 7443 : process.env.RS_PORT || 7080,
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

    // app.io.set('close timeout', 60)
    // app.io.set('heartbeat timeout', 60)

    app.subProcesses = [];

    app.moduleConfig = [
      {
        name: 'initMonitor',
        instance: initMonitor,
        async: false,
        timeout: 0,
      },
      {
        name: 'initWeb3',
        instance: initWeb3,
        async: false,
        timeout: 0,
      },
      {
        name: 'initRealmServer',
        instance: initRealmServer,
        async: false,
        timeout: 0,
      },
      {
        name: 'initWebServer',
        instance: initWebServer,
        async: false,
        timeout: 0,
      },
      {
        name: 'initGameBridge',
        instance: initGameBridge,
        async: false,
        timeout: 0,
      },
    ];

    app.modules = {};

    for (const module of app.moduleConfig) {
      app.modules[module.name] = module.instance;

      if (module.timeout) {
        setTimeout(async () => {
          if (module.async) {
            await module.instance(app);
          } else {
            module.instance(app);
          }
        }, module.timeout);
      } else {
        if (module.async) {
          await module.instance(app);
        } else {
          module.instance(app);
        }
      }
    }

    if (app.flags.testBanSystem) app.tests.testBanSystem(app);
  } catch (e) {
    logError(e);
  }
}

init();
