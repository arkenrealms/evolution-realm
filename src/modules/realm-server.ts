import fetch from 'node-fetch'
import { isValidRequest, getSignedRequest } from '@rune-backend-sdk/util/web3'
import { log, logError, getTime } from '@rune-backend-sdk/util'
import { emitDirect } from '@rune-backend-sdk/util/websocket'
import { upgradeCodebase } from '@rune-backend-sdk/util/codebase'

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
      isMod: false,
      isAdmin: false,
      log: {
        clientDisconnected: 0
      }
    }

    app.realm.sockets[currentClient.id] = socket

    app.realm.clientLookup[currentClient.id] = currentClient

    app.realm.clients.push(currentClient)

    // Use by GS to tell DB it's connected
    socket.on('AuthRequest', async function(req) {
      // if (req.data !== 'myverysexykey') {
      //   log('Invalid observer creds:', req)
      //   socket.disconnect()
      //   return
      // }

      if (await isValidRequest(app.web3, req)) {
        if (app.realm.state.adminList.includes(req.signature.address)) {
          currentClient.isAdmin = true
          currentClient.isMod = true
        } else if (app.realm.state.modList.includes(req.signature.address)) {
          currentClient.isMod = true
        }

        emitDirect(socket, 'AuthResponse', {
          id: req.id,
          data: { status: 1 }
        })
      } else {
        emitDirect(socket, 'AuthResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    // Use by GS to tell DB it's connected
    socket.on('SetConfigRequest', async function(req) {
      try {
        log('SetConfigRequest', req)

        if (!await isValidRequest(app.web3, req) && app.realm.state.modList.includes(req.signature.address)) {
          emitDirect(socket, 'SetConfigResponse', {
            id: req.id,
            data: {
              status: 0
            }
          })
  
          logError('Invalid request signature')
          return
        }

        app.gameBridge.state.config = { ...app.gameBridge.state.config, ...req.data.config }

        const data = { config: app.gameBridge.state.config }

        app.gameBridge.call('RS_SetConfigRequest', await getSignedRequest(app.web3, app.secrets, data), data)

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
      // log('PingRequest', req)

      emitDirect(socket, 'PingResponse', {
        id: req.id
      })
    })

    // Use by GS to tell DB it's connected
    socket.on('InfoRequest', async function(req) {
      try {
        log('InfoRequest', req)

        if (!await isValidRequest(app.web3, req) || !app.realm.state.modList.includes(req.signature.address)) {
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

        if (await isValidRequest(app.web3, req) && app.realm.state.modList.includes(req.data.address)) {
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
        log('RemoveMod', req)

        if (await isValidRequest(app.web3, req) && app.realm.state.modList.includes(req.data.address)) {
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
    
    socket.on('BanPlayerRequest', async function(req) {
      try {
        log('BanPlayerRequest', req)

        if (!currentClient.isMod) {
          logError('Invalid permissions')

          emitDirect(socket, 'BanPlayerResponse', {
            id: req.id,
            data: { status: 2 }
          })

          return
        }

        const res = await app.realm.call('BanPlayerRequest', req.data)

        emitDirect(socket, 'BanPlayerResponse', {
          id: req.id,
          data: { status: res.status }
        })
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'BanPlayerResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('BanUserRequest', async function(req) {
      try {
        log('BanUserRequest', req)

        if (!currentClient.isAdmin) {
          logError('Invalid permissions')

          emitDirect(socket, 'BanUserResponse', {
            id: req.id,
            data: { status: 2 }
          })

          return
        }

        app.gameBridge.userCache[req.data.target] = (await (await fetch(`https://cache.rune.game/users/${req.data.target}/overview.json`)).json()) as any

        app.gameBridge.call('KickUser', await getSignedRequest(app.web3, app.secrets, req.data), req.data)

        emitDirect(socket, 'BanUserResponse', {
          id: req.id,
          data: { status: 1 }
        })
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'BanUserResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('BanListRequest', async function(req) {
      try {
        log('BanListRequest', req)

        if (!currentClient.isMod) {
          logError('Invalid permissions')

          emitDirect(socket, 'BanListResponse', {
            id: req.id,
            data: { status: 2 }
          })

          return
        }

        emitDirect(socket, 'BanListResponse', {
          id: req.id,
          data: { status: 1, list: app.realm.state.banList }
        })
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'BanListResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('BridgeStateRequest', async function(req) {
      try {
        log('BridgeStateRequest', req)

        if (!currentClient.isMod) {
          logError('Invalid permissions')

          emitDirect(socket, 'BridgeStateResponse', {
            id: req.id,
            data: { status: 2 }
          })

          return
        }

        emitDirect(socket, 'BridgeStateResponse', {
          id: req.id,
          data: { status: 1, state: app.gameBridge.state }
        })
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'BridgeStateResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
    })

    socket.on('UnbanUserRequest', async function(req) {
      try {
        log('Unban', req)

        if (await isValidRequest(app.web3, req) && app.realm.state.modList.includes(req.data.address)) {
          app.realm.state.banList.splice(app.realm.state.banList.indexOf(req.data.target), 1)

          emitDirect(socket, 'UnbanUserResponse', {
            id: req.id,
            data: { status: 1 }
          })
        } else {
          logError('Invalid request')

          emitDirect(socket, 'UnbanUserResponse', {
            id: req.id,
            data: { status: 2 }
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
      emitDirect(socket, 'OnFoundGameServer', app.realm.endpoint, 7777)
    })

    socket.on('CallRequest', async function(req) {
      try {
        log('CallRequest', req)

        const data = await app.gameBridge.call(req.data.method, req.data.signature, req.data.data)

        emitDirect(socket, 'CallResponse', {
          id: req.id,
          data: { status: 1, data }
        })
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'CallResponse', {
          id: req.id,
          data: { status: 0 }
        })
      }
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

    const signature = await getSignedRequest(app.web3, app.secrets, data)
  
    return new Promise((resolve, reject) => {
      const id = shortId()

      const timeout = setTimeout(function() {
        log('Request timeout')

        resolve({ status: 0, message: 'Request timeout' })

        delete app.realm.ioCallbacks[id]
      }, 60 * 1000)
      
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
  log('initRealmServer')

  app.realm = {}

  app.realm.version = '2.0.0'

  app.realm.endpoint = 'ptr1.runeevolution.com'

  app.realm.clients = [] // to storage clients

  app.realm.clientLookup = {}

  app.realm.ioCallbacks = {}

  app.realm.sockets = {} // to storage sockets
  
  app.realm.state = {
  }

  app.realm.state.banList = []

  app.realm.state.adminList = [
    '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C', // realm server
  ]

  app.realm.state.modList = [
    '0x4b64Ff29Ee3B68fF9de11eb1eFA577647f83151C', // realm server
    "0xa987f487639920A3c2eFe58C8FBDedB96253ed9B", // me
    "0x545612032BeaDED7E9f5F5Ab611aF6428026E53E", // kevin
    "0x37470038C615Def104e1bee33c710bD16a09FdEf", // maiev
    "0x150F24A67d5541ee1F8aBce2b69046e25d64619c", // maiev
    "0xfE27380E57e5336eB8FFc017371F2147A3268fbE", // lazy?
    "0x3551691499D740790C4511CDBD1D64b2f146f6Bd", // panda
    // "0x2DF94b980FC880100D93072011675E6659C0ca21", // zavox
    // "0x9b229c01eEf692A780d8Fee2558AaEa9873C032f", // me
    // "0x1a367CA7bD311F279F1dfAfF1e60c4d797Faa6eb" // me?
  ]

  app.io.on('connection', onRealmConnection.bind(null, app))

  app.realm.upgrade = upgradeCodebase
  
  app.realm.call = sendEventToObservers.bind(null, app)
}
