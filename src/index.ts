import jetpack from 'fs-jetpack';
import fs from 'fs';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { log, logError } from '@arken/node/util';
import { catchExceptions } from '@arken/node/util/process';
import { initWeb3 } from './modules/web3';
import { initRealmServer } from './modules/realm-server';
import { initWebServer } from './modules/web-server';
import { initMonitor } from './modules/monitor';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { App as AppType, AppState, AppConfig, AppModule, AppModules } from './types';

dotenv.config();

class App {
  state: AppState;
  flags: AppConfig;
  server: Express;
  isHttps: boolean;
  https?: HttpsServer;
  http?: HttpServer;
  io: SocketServer;
  subProcesses: any[] = [];
  moduleConfig: AppModule[];
  modules: AppModules = {};

  constructor() {
    this.flags = {
      testBanSystem: false,
    };

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
          key: fs.readFileSync(path.resolve('./privkey.pem')),
          cert: fs.readFileSync(path.resolve('./fullchain.pem')),
        },
        this.server
      );
    } else {
      this.http = require('http').Server(this.server);
    }

    this.io = new SocketServer(this.isHttps ? this.https : this.http, {
      secure: this.isHttps,
      port: this.isHttps ? Number(process.env.RS_SSL_PORT) || 7443 : Number(process.env.RS_PORT) || 7080,
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

    this.moduleConfig = [
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
    ];
  }

  async init() {
    catchExceptions();

    try {
      log('App init');

      await mongoose.connect(process.env.DATABASE_URL!, {
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
      });

      for (const module of this.moduleConfig) {
        this.modules[module.name] = module.instance;

        if (module.timeout) {
          setTimeout(async () => {
            if (module.async) {
              await module.instance(this);
            } else {
              module.instance(this);
            }
          }, module.timeout);
        } else {
          if (module.async) {
            await module.instance(this);
          } else {
            module.instance(this);
          }
        }
      }

      if (this.flags.testBanSystem) this.tests.testBanSystem(this);
    } catch (e) {
      logError(e);
    }
  }
}

const app = new App();
app.init();
