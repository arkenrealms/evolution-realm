import fs from 'fs';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { log, logError } from '@arken/node/util';
import { catchExceptions } from '@arken/node/util/process';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { init as initRealmServer } from './realm-server';
import { initWebServer } from './web-server';
import { initMonitor } from './monitor';
import { schema } from '@arken/node/types';

dotenv.config();

class Application {
  state: schema.Data;
  server: Express;
  isHttps: boolean;
  https?: HttpsServer;
  http?: HttpServer;
  io: SocketServer;
  subProcesses: any[] = [];

  constructor() {
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
      log('App init');

      await mongoose.connect(process.env.DATABASE_URL!, {
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
      });

      if (app.isHttps) {
        const sslPort = process.env.RS_SSL_PORT || 443;
        app.https.listen(sslPort, function () {
          log(`:: Backend ready and listening on *:${sslPort} (https)`);
        });
      } else {
        // Finalize
        const port = process.env.RS_PORT || 80;
        app.http.listen(port, function () {
          log(`:: Backend ready and listening on *:${port} (http)`);
        });
      }

      await initMonitor(this);
      await initRealmServer(this);
      await initWebServer(this);
    } catch (e) {
      logError(e);
    }
  }
}

const app = new Application();
app.init();
