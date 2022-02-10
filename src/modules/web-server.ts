
import express from 'express'
import RateLimit from 'express-rate-limit'
import bodyParser from 'body-parser'
import morgan from 'morgan'
import { log, logError } from '../util'
import { emitAll } from '../util/websocket'
import { killSubProcesses } from '../util/process'

const path = require('path')

function initRoutes(app) {
  try {
    app.server.get('/admin/upgrade', async function(req, res) {
      try {
        app.realm.upgrade()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/start', function(req, res) {
      try {
        app.gameBridge.start()

        setTimeout(() => {
          app.gameBridge.connect()
        }, 5000)

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/reconnect', function(req, res) {
      try {
        app.gameBridge.connect()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/stop', function(req, res) {
      try {
        killSubProcesses()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/reboot', function(req, res) {
      try {
        killSubProcesses()
        setTimeout(app.gameBridge.start, 5 * 1000)

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/upgrade', async function(req, res) {
      try {
        // Tell players and game servers to shut down
        emitAll('ServerUpgrade')

        app.gameBridge.upgrade()

        setTimeout(async () => {
          killSubProcesses()
          setTimeout(app.gameBridge.start, 5 * 1000)
  
          res.json({ status: 1 })
        }, 5 * 1000)
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/clone', async function(req, res) {
      try {
        app.gameBridge.clone()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/info', async function(req, res) {
      const response = await app.gameBridge.call('RS_ServerInfoRequest')

      res.json(response)
    })

    app.server.get('/config', async function(req, res) {
      const response = await app.gameBridge.call('RS_ConfigRequest')

      res.json(response)
    })

    app.server.post('/maintenance', async function(req, res) {
      const response = await app.gameBridge.call('RS_MaintenanceRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/unmaintenance', async function(req, res) {
      const response = await app.gameBridge.call('RS_UnmaintenanceRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/startBattleRoyale', async function(req, res) {
      const response = await app.gameBridge.call('RS_StartBattleRoyaleRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/stopBattleRoyale', async function(req, res) {
      const response = await app.gameBridge.call('RS_StopBattleRoyaleRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/pauseRound', async function(req, res) {
      const response = await app.gameBridge.call('RS_PauseRoundRequest', {
        address: req.body.address,
        signature: req.body.signature,
        gameMode: req.body.gameMode
      })

      res.json(response)
    })

    app.server.post('/startRound', async function(req, res) {
      const response = await app.gameBridge.call('RS_StartRoundRequest', {
        address: req.body.address,
        signature: req.body.signature,
        gameMode: req.body.gameMode
      })

      res.json(response)
    })

    app.server.post('/enableForceLevel1', async function(req, res) {
      const response = await app.gameBridge.call('RS_EnableForceLevel1Request', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/disableForceLevel1', async function(req, res) {
      const response = await app.gameBridge.call('RS_DisableForceLevel1Request', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/enableForceLevel2', async function(req, res) {
      const response = await app.gameBridge.call('RS_EnableForceLevel2Request', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/disableForceLevel2', async function(req, res) {
      const response = await app.gameBridge.call('RS_DisableForceLevel2Request', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/startGodParty', async function(req, res) {
      const response = await app.gameBridge.call('RS_StartGodPartyRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/stopGodParty', async function(req, res) {
      const response = await app.gameBridge.call('RS_StopGodPartyRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/makeBattleHarder', async function(req, res) {
      const response = await app.gameBridge.call('RS_MakeBattleHarderRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/makeBattleEasier', async function(req, res) {
      const response = await app.gameBridge.call('RS_MakeBattleEasierRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/resetBattleDifficulty', async function(req, res) {
      const response = await app.gameBridge.call('RS_ResetBattleDifficultyRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/setConfig/:key/:value', async function(req, res) {
      const response = await app.gameBridge.call('RS_SetConfigRequest', {
        key: req.params.key,
        value: req.params.value,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/report/:address', async function(req, res) {
      const response = await app.gameBridge.call('RS_ReportUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/ban/:address', async function(req, res) {
      const response = await app.gameBridge.call('RS_BanUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/unban/:address', async function(req, res) {
      const response = await app.gameBridge.call('RS_UnbanUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    app.server.post('/message/:address', async function(req, res) {
      const response = await app.gameBridge.call('RS_MessageUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature,
        message: req.body.message
      })

      res.json(response)
    })

    app.server.post('/broadcast', async function(req, res) {
      const response = await app.gameBridge.call('RS_BroadcastRequest', {
        address: req.body.address,
        signature: req.body.signature,
        message: req.body.message
      })

      res.json(response)
    })

    app.server.get('/admin/test/:testName', async function(req, res) {
      try {
        if (!app.tests[req.params.testName]) {
          logError('Test doesnt exist')
          res.json({ status: 0 })
        }
        
        res.json(await app.tests[req.params.testName](app))
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })
    
    app.server.get('/readiness_check', (req, res) => res.sendStatus(200))
    app.server.get('/liveness_check', (req, res) => res.sendStatus(200))

    app.server.get('/.well-known/acme-challenge/-mROdU-GRZs53IaKoASvx7og2NHoD0fw5_nnaHtE4Ic', (req, res) => res.end('-mROdU-GRZs53IaKoASvx7og2NHoD0fw5_nnaHtE4Ic.rf1Z-ViQiJBjN-_x-EzQlmFjnB7obDoQD_BId0Z24Oc'))
  } catch(e) {
    logError(e)
  }
}

export async function initWebServer(app) {
  // @ts-ignore
  const rateLimiter = new RateLimit({
    windowMs: 2,
    max: 5,
  })

  // Accept json and other formats in the body
  app.server.use(bodyParser.urlencoded({ extended: true }))
  app.server.use(bodyParser.json())

  // Apply ratelimit
  app.server.use(rateLimiter)

  // Logging
  app.server.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  app.server.use(express.static(path.join(__dirname, '/../game-server/public')))

  initRoutes(app)

  // Finalize
  const port = process.env.RS_PORT || 80
  app.http.listen(port, function() {
    log(`:: Backend ready and listening on *:${port}`)
  })

  const sslPort = process.env.RS_SSL_PORT || 443
  app.https.listen(sslPort, function() {
    log(`:: Backend ready and listening on *:${sslPort}`)
  })
}