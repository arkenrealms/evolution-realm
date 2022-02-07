
import fs from 'fs'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { log, logError } from './util'
import { catchExceptions } from './util/process'
import { initRealmServer } from './modules/realm-server'
import { initWebServer } from './modules/web-server'
import { initGameBridge } from './modules/game-bridge'
import * as tests from './tests'

const path = require('path')

async function init() {
  catchExceptions()

  try {
    const app = {} as any

    app.flags = {
      testBanSystem: false
    }

    app.tests = tests

    app.server = express()

    // Security related
    app.server.set('trust proxy', 1)
    app.server.use(helmet())
    app.server.use(
      cors({
        allowedHeaders: ['Accept', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Content-Type', 'applicationId'],
      })
    )

    app.http = require('http').Server(app.server)

    app.https = require('https').createServer({ 
      key: fs.readFileSync(path.resolve('./privkey.pem')),
      cert: fs.readFileSync(path.resolve('./fullchain.pem'))
    }, app.server)

    app.io = require('socket.io')(process.env.SUDO_USER === 'dev' || process.env.OS_FLAVOUR === 'debian-10' ? app.https : app.http, {
      secure: process.env.SUDO_USER === 'dev' || process.env.OS_FLAVOUR === 'debian-10' ? true : false,
      pingInterval: 30005,
      pingTimeout: 5000,
      upgradeTimeout: 3000,
      allowUpgrades: true,
      cookie: false,
      serveClient: true,
      allowEIO3: false,
      cors: {
        origin: "*"
      }
    })

    app.subProcesses = []

    app.moduleConfig = [
      {
        name: 'initRealmServer',
        instance: initRealmServer,
        async: false,
        timeout: 0
      },
      {
        name: 'initWebServer',
        instance: initWebServer,
        async: false,
        timeout: 0
      },
      {
        name: 'initGameBridge',
        instance: initGameBridge,
        async: false,
        timeout: 0
      },
    ]

    app.modules = {}
    
    for (const module of app.moduleConfig) {
      app.modules[module.name] = module.instance

      if (module.timeout) {
        setTimeout(async () => {
          if (module.async) {
            await module.instance(app)
          } else {
            module.instance(app)
          }
        }, module.timeout)
      } else {
        if (module.async) {
          await module.instance(app)
        } else {
          module.instance(app)
        }
      }
    }

    if (app.flags.testBanSystem)
      app.tests.testBanSystem(app)
  } catch(e) {
    logError(e)
  }
}

init()