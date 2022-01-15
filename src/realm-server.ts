import { verifySignature, getSignedRequest } from './util/web3'
import { log, logError, getTime } from './util'
import { emitDirect } from './util/websocket'
import { upgradeCodebase } from './util/codebase'

function onRealmConnection(app, socket) {
  try {
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.conn.remoteAddress?.split(":")[3]

    log('Client connected from ' + ip)

    let currentClient = {
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

    // Use by GS to tell RD it's connected
    socket.on('RD_Connect', function() {
      emitDirect(socket, 'OnConnected')
    })

    socket.on('AddModRequest', async function(req) {
      try {
        log('AddMod', {
          caller: req.data.address
        })

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && app.realm.state.modList.includes(req.data.address)) {
          app.realm.state.modList.push(req.params.address)
      
          emitDirect(socket, 'AddModResponse', {
            id: req.id,
            data: { success: 1 }
          })
        } else {
          emitDirect(socket, 'AddModResponse', {
            id: req.id,
            data: { success: 0 }
          })
        }
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'AddModResponse', {
          id: req.id,
          data: { success: 0 }
        })
      }
    })

    socket.on('RemoveModRequest', async function(req) {
      try {
        log('RemoveMod', {
          caller: req.data.address
        })

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && app.realm.state.modList.includes(req.data.address)) {
          for (const client of app.realm.clients) {
            if (client.isMod && client.address === req.data.target) {
              client.isMod = false
            }
          }
      
          emitDirect(socket, 'RemoveModResponse', {
            id: req.id,
            data: { success: 1 }
          })
        } else {
          emitDirect(socket, 'RemoveModResponse', {
            id: req.id,
            data: { success: 0 }
          })
        }
      } catch (e) {
        emitDirect(socket, 'RemoveModResponse', {
          id: req.id,
          data: { success: 0 }
        })
      }
    })

    socket.on('BanUserRequest', async function(req) {
      try {
        log('Ban', {
          value: req.data.target,
          caller: req.data.address
        })

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && app.realm.state.modList.includes(req.data.address)) {
          app.gameBridge.call('KickUser', await getSignedRequest({ target: req.data.address }))

          emitDirect(socket, 'BanUserResponse', {
            id: req.id,
            data: { success: 1 }
          })
        } else {
          emitDirect(socket, 'BanUserResponse', {
            id: req.id,
            data: { success: 0 }
          })
        }
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'BanUserResponse', {
          id: req.id,
          data: { success: 0 }
        })
      }
    })

    socket.on('UnbanUserRequest', async function(req) {
      try {
        log('Unban', {
          value: req.data.target,
          caller: req.data.address
        })

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && app.realm.state.modList.includes(req.data.address)) {
          app.realm.state.banList.splice(app.realm.state.banList.indexOf(req.data.target), 1)

          emitDirect(socket, 'UnbanUserResponse', {
            id: req.id,
            data: { success: 1 }
          })
        } else {
          emitDirect(socket, 'UnbanUserResponse', {
            id: req.id,
            data: { success: 0 }
          })
        }
      } catch (e) {
        logError(e)
        
        emitDirect(socket, 'UnbanUserResponse', {
          id: req.id,
          data: { success: 0 }
        })
      }
    })

    socket.on('FindGameServer', function() {
      emitDirect(socket, 'OnFoundGameServer', 'ptr1.runeevolution.com', 7777)
    })

    socket.on('disconnect', function() {
      log("User has disconnected")

      currentClient.log.clientDisconnected += 1
    })
  } catch(e) {
    logError(e)
  }
}

export function initRealmServer(app) {
  app.realm = {}

  app.realm.version = '1.0.0'

  app.realm.clients = [] // to storage clients

  app.realm.clientLookup = {}

  app.realm.sockets = {} // to storage sockets
  
  app.realm.state = {}

  app.realm.state.banList = []

  app.realm.state.modList = []

  app.io.on('connection', onRealmConnection.bind(null, app))

  app.realm.upgrade = upgradeCodebase
}
