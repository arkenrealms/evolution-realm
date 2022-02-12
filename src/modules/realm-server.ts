import { isValidRequest, signatureAddress, getSignedRequest } from '../util/web3'
import { log, logError, getTime } from '../util'
import { emitDirect } from '../util/websocket'
import { upgradeCodebase } from '../util/codebase'

const shortId = require('shortid')

function onRealmConnection(app, socket) {
  try {
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.conn.remoteAddress?.split(":")[3]

    log('Client connected from ' + ip)

    const currentClient = {
      name: 'Unknown' + Math.floor(Math.random() * 999),
      id: socket.id,
      ip,
      lastReportedTime: getTime(),
      log: {
        clientDisconnected: 0
      }
    }

    app.realm.sockets[currentClient.id] = socket

    app.realm.clientLookup[currentClient.id] = currentClient

    app.realm.clients.push(currentClient)

    // Use by GS to tell DB it's connected
    socket.on('AuthRequest', function(req) {
      if (req.data !== 'myverysexykey') {
        log('Invalid observer creds:', req)
        socket.disconnect()
        return
      }

      emitDirect(socket, 'AuthResponse', {
        id: req.id,
        data: { status: 1 }
      })
    })

    // Use by GS to tell DB it's connected
    socket.on('SetConfigRequest', async function(req) {
      try {
        log('SetConfigRequest', req)

        if (!await isValidRequest(req) && app.realm.state.modList.includes(req.data.address)) {
          emitDirect(socket, 'SetConfigResponse', {
            id: req.id,
            data: {
              status: 0
            }
          })
  
          logError('Invalid request signature')
          return
        }

        app.gameBridge.state.config = { ...app.gameBridge.state.config, ...req.config }

        app.gameBridge.call('RS_SetConfigRequest', { config: app.gameBridge.state.config })

        emitDirect(socket, 'SetConfigResponse', {
          id: req.id,
          data: {
            status: 1
          }
        })
      } catch(e) {
        emitDirect(socket, 'SetConfigResponse', {
          id: req.id,
          data: {
            status: 0
          }
        })

        logError(e)
      }
    })

    socket.on('PingRequest', function(req) {
      emitDirect(socket, 'PingResponse', {
        id: req.id
      })
    })

    // Use by GS to tell DB it's connected
    socket.on('InfoRequest', async function(req) {
      try {
        if (!await isValidRequest(req) || !app.realm.state.modList.includes(req.signature.address)) {
          emitDirect(socket, 'InfoResponse', {
            id: req.id,
            data: {
              status: 0
            }
          })
  
          logError('Invalid request signature')
          return
        }

        const games = app.gameBridge.state.servers.map(s => s.info).filter(i => !!i)

        app.gameBridge.state.config = { ...app.gameBridge.state.config, ...req.data.config }

        emitDirect(socket, 'InfoResponse', {
          id: req.id,
          data: {
            status: 1,
            data: {
              playerCount: games.reduce((a, b) => a + b.playerCount, 0) || 0,
              speculatorCount: games.reduce((a, b) => a + b.speculatorCount, 0) || 0,
              version: '1.0.0',
              games
            }
          }
        })
      } catch(e) {
        emitDirect(socket, 'InfoResponse', {
          id: req.id,
          data: {
            status: 0
          }
        })

        logError(e)
      }
    })

    socket.on('AddModRequest', async function(req) {
      try {
        log('AddMod', req)

        if (await isValidRequest(req) && app.realm.state.modList.includes(req.data.address)) {
          app.realm.state.modList.push(req.params.address)
      
          emitDirect(socket, 'AddModResponse', {
            id: req.id,
            data: { status: 1 }
          })
        } else {
          emitDirect(socket, 'AddModResponse', {
            id: req.id,
            data: { status: 0 }
          })
        }
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'AddModResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('RemoveModRequest', async function(req) {
      try {
        log('RemoveMod', {
          caller: req.data.address
        })

        if (await isValidRequest(req) && app.realm.state.modList.includes(req.data.address)) {
          for (const client of app.realm.clients) {
            if (client.isMod && client.address === req.data.target) {
              client.isMod = false
            }
          }
      
          emitDirect(socket, 'RemoveModResponse', {
            id: req.id,
            data: { status: 1 }
          })
        } else {
          emitDirect(socket, 'RemoveModResponse', {
            id: req.id,
            data: { status: 0 }
          })
        }
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'RemoveModResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('BanUserRequest', async function(req) {
      try {
        log('Ban', req)

        if (await isValidRequest(req) && app.realm.state.modList.includes(req.signature.address)) {
          app.gameBridge.call('KickUser', await getSignedRequest({ target: req.data.target }))

          emitDirect(socket, 'BanUserResponse', {
            id: req.id,
            data: { status: 1 }
          })
        } else {
          emitDirect(socket, 'BanUserResponse', {
            id: req.id,
            data: { status: 0 }
          })
        }
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'BanUserResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('UnbanUserRequest', async function(req) {
      try {
        log('Unban', {
          value: req.data.target,
          caller: req.data.address
        })

        if (await isValidRequest(req) && app.realm.state.modList.includes(req.data.address)) {
          app.realm.state.banList.splice(app.realm.state.banList.indexOf(req.data.target), 1)

          emitDirect(socket, 'UnbanUserResponse', {
            id: req.id,
            data: { status: 1 }
          })
        } else {
          emitDirect(socket, 'UnbanUserResponse', {
            id: req.id,
            data: { status: 0 }
          })
        }
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'UnbanUserResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('FindGameServer', function() {
      emitDirect(socket, 'OnFoundGameServer', 'ptr1.runeevolution.com', 7777)
    })

    socket.onAny(function(eventName, res) {
      // log('Event All', eventName, res)
      if (!res || !res.id) return
      // console.log(eventName, res)
      if (app.realm.ioCallbacks[res.id]) {
        log('Callback', eventName)
  
        clearTimeout(app.realm.ioCallbacks[res.id].timeout)

        app.realm.ioCallbacks[res.id].resolve(res.data)
  
        delete app.realm.ioCallbacks[res.id]
      }
    })

    socket.on('disconnect', function() {
      log('Observer has disconnected')

      currentClient.log.clientDisconnected += 1
    })
  } catch(e) {
    logError(e)
  }
}

async function sendEventToObservers(app, name, data = undefined) {
  try {
    log('Emit Observers', name, data)

    const signature = await getSignedRequest(data)
  
    return new Promise((resolve, reject) => {
      const id = shortId()

      const timeout = setTimeout(function() {
        resolve({ status: 0, message: 'Request timeout' })

        delete app.realm.ioCallbacks[id]
      }, 10 * 1000)
      
      app.realm.ioCallbacks[id] = { resolve, reject, timeout }

      for (const socketId in app.realm.sockets) {
        const socket = app.realm.sockets[socketId]
        // console.log(socket, name, id, data)
        socket.emit(name, { id, signature, data })
      }
    })
  } catch(e) {
    logError(e)
  }
}

export function initRealmServer(app) {
  app.realm = {}

  app.realm.version = '2.0.0'

  app.realm.clients = [] // to storage clients

  app.realm.clientLookup = {}

  app.realm.ioCallbacks = {}

  app.realm.sockets = {} // to storage sockets
  
  app.realm.state = {
  }

  app.realm.state.banList = []

  app.realm.state.modList = ['0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C']

  app.io.on('connection', onRealmConnection.bind(null, app))

  app.realm.upgrade = upgradeCodebase
  
  app.realm.call = sendEventToObservers.bind(null, app)
}
