
import fs from 'fs'
import express from 'express'
import { log, logError } from './util'
import { catchExceptions } from './util/process'
import { initRealmServer } from './realm-server'
import { initWebServer } from './web-server'
import { initGameBridge } from './game-bridge'

const path = require('path')

async function init() {
  try {
    catchExceptions()

    const app = {} as any

    app.server = express()

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

    await initRealmServer(app)
    await initWebServer(app)
    await initGameBridge(app)

    const port = process.env.PORT || 80
    app.http.listen(port, function() {
      log(`:: Backend ready and listening on *:${port}`)
    })

    const sslPort = process.env.SSL_PORT || 443
    app.https.listen(sslPort, function() {
      log(`:: Backend ready and listening on *:${sslPort}`)
    })
  } catch(e) {
    logError(e)
  }
}

init()