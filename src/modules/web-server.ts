import express from 'express'
import RateLimit from 'express-rate-limit'
import bodyParser from 'body-parser'
import morgan from 'morgan'
import { log, logError } from '@arken/node/util'
import { emitAll } from '@arken/node/util/websocket'
import { killSubProcesses } from '@arken/node/util/process'

const path = require('path')

function initRoutes(app) {
  try {
    app.server.get('/admin/upgrade', async function (req, res) {
      try {
        app.realm.upgrade()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/start', function (req, res) {
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

    app.server.get('/admin/gs/reconnect', function (req, res) {
      try {
        app.gameBridge.connect()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/stop', function (req, res) {
      try {
        killSubProcesses()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/reboot', function (req, res) {
      try {
        killSubProcesses()
        setTimeout(app.gameBridge.start, 5 * 1000)

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/admin/gs/upgrade', async function (req, res) {
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

    app.server.get('/admin/gs/clone', async function (req, res) {
      try {
        app.gameBridge.clone()

        res.json({ status: 1 })
      } catch (e) {
        logError(e)
        res.json({ status: 0 })
      }
    })

    app.server.get('/info', async function (req, res) {
      const response = await app.gameBridge.call('RS_ServerInfoRequest')

      res.json(response)
    })

    app.server.get('/config', async function (req, res) {
      const response = await app.gameBridge.call('RS_GetConfigRequest')

      res.json(response)
    })

    app.server.post('/call/:method', async function (req, res) {
      const response = await app.gameBridge.call(req.params.method, req.body.signature, req.body.data)

      if (response.status === 1) {
        await app.realm.call('ModRequest', {
          params: req.params,
          body: req.body,
        })
      }

      res.json(response)
    })

    app.server.get('/admin/test/:testName', async function (req, res) {
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

    app.server.get('/.well-known/acme-challenge/-mROdU-GRZs53IaKoASvx7og2NHoD0fw5_nnaHtE4Ic', (req, res) =>
      res.end('-mROdU-GRZs53IaKoASvx7og2NHoD0fw5_nnaHtE4Ic.rf1Z-ViQiJBjN-_x-EzQlmFjnB7obDoQD_BId0Z24Oc')
    )
  } catch (e) {
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
  // app.server.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  app.server.use(express.static(path.resolve('./public')))

  initRoutes(app)

  if (app.isHttps) {
    const sslPort = process.env.RS_SSL_PORT || 443
    app.https.listen(sslPort, function () {
      log(`:: Backend ready and listening on *:${sslPort} (https)`)
    })
  } else {
    // Finalize
    const port = process.env.RS_PORT || 80
    app.http.listen(port, function () {
      log(`:: Backend ready and listening on *:${port} (http)`)
    })
  }
}
