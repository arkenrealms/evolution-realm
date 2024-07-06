import fs from 'fs'
import helmet from 'helmet'
import cors from 'cors'
import express from 'express'
import { log, logError, isDebug } from '@rune-backend-sdk/util'
import { catchExceptions } from '@rune-backend-sdk/util/process'
import { initGameServer } from './modules/game-server'
import { initWebServer } from './modules/web-server'
import { initMonitor } from './modules/monitor'

const path = require('path')

if (isDebug) {
  console.log('Running GS in DEBUG mode')
}

function startServer(app) {
  log('startServer', app.isHttps)

  if (app.isHttps) {
    // app.https.on('error', function (e) {
    //   app.state.sslPort++
    //   setTimeout(() => startServer(app), 10 * 1000)
    // })

    app.https.listen(app.state.sslPort, function () {
      log(`Backend ready and listening on *:${app.state.sslPort} (https)`)

      app.state.spawnPort = app.state.sslPort
    })
  } else {
    // app.http.on('error', function (e) {
    //   app.state.port++
    //   setTimeout(() => startServer(app), 10 * 1000)
    // })

    app.http.listen(app.state.port, function () {
      log(`Backend ready and listening on *:${app.state.port} (http)`)

      app.state.spawnPort = app.state.port
    })
  }
}

async function init() {
  catchExceptions()

  try {
    const app = {} as any

    app.state = {}
    app.state.port = process.env.GS_PORT || 8080
    app.state.sslPort = process.env.GS_SSL_PORT || 8443
    app.state.spawnPort = undefined

    app.server = express()

    // Security related
    app.server.set('trust proxy', 1)
    app.server.use(helmet())
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
    )

    app.isHttps = process.env.RUNE_ENV !== 'local'

    if (app.isHttps) {
      app.https = require('https').createServer(
        {
          key: fs.readFileSync(path.resolve('../privkey.pem')),
          cert: fs.readFileSync(path.resolve('../fullchain.pem')),
        },
        app.server
      )
    } else {
      app.http = require('http').Server(app.server)
    }

    app.io = require('socket.io')(app.isHttps ? app.https : app.http, {
      secure: app.isHttps ? true : false,
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
    })

    initMonitor(app)
    initGameServer(app)
    initWebServer(app.server)

    startServer(app)
  } catch (e) {
    log('Error 383892', e)
  }
}

init()
