import utf8 from 'utf8'
import * as ethers from 'ethers'
import Web3 from 'web3'
import fs from 'fs'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import RateLimit from 'express-rate-limit'
import bodyParser from 'body-parser'
import morgan from 'morgan'
import util from 'util'
import crypto from 'crypto'
import jetpack from 'fs-jetpack'
import semver from 'semver/preload.js'
import { io as ioClient } from 'socket.io-client'
import axios from 'axios'
import {spawn, exec} from 'child_process'
import ArcaneItems from './contracts/ArcaneItems.json'
import BEP20Contract from './contracts/BEP20.json'
import { decodeItem } from './decodeItem'
import contracts from './contracts'
import * as secrets from './secrets'

const subProcesses = []

function killSubProcesses() {
  console.log('killing', subProcesses.length, 'child processes')
  
  for (const i in subProcesses) {
    if (!subProcesses[i]) continue

    subProcesses[i].kill()
    subProcesses[i] = undefined
  }

  try {
    const execPromise = util.promisify(exec)
    execPromise('kill -9 `ps aux | grep /usr/bin/node | grep -v grep | awk \'{ print $2 }\'` && kill -9 `ps aux | grep RuneInfinite | grep -v grep | awk \'{ print $2 }\'` && pkill -f Infinite').catch(() => {})
  } catch(e2) {
    console.log(e2)
  }
}

function cleanExit() {
  // killSubProcesses()

  process.kill(0)
}

// process.on('exit', cleanExit)
// process.on('SIGINT', cleanExit) // catch ctrl-c
// process.on('SIGTERM', cleanExit) // catch kill

const path = require('path')

let clients = [] // to storage clients
const clientLookup = {}
const sockets = {} // to storage sockets
const serverVersion = "1.0.0"
const debug = process.env.HOME === '/Users/dev'

const log = (...msgs) => {
  if (debug) {
    console.log(...msgs)
  }
}

const server = express()
const http = require('http').Server(server)
const https = require('https').createServer({ 
  key: fs.readFileSync(path.resolve('./privkey.pem')),
  cert: fs.readFileSync(path.resolve('./fullchain.pem'))
}, server)
const io = require('socket.io')(process.env.SUDO_USER === 'dev' || process.env.OS_FLAVOUR === 'debian-10' ? https : http, {
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
const shortId = require('shortid')

function logError(err) {
  console.log(err)

  const errorLog = jetpack.read(path.resolve('./public/data/errors.json'), 'json') || []

  errorLog.push(err + '')
  
  jetpack.write(path.resolve('./public/data/errors.json'), JSON.stringify(errorLog, null, 2), { atomic: true })
}

const gameServer = {
  socket: undefined
}

process
  .on("unhandledRejection", (reason, p) => {
    console.log(reason, "Unhandled Rejection at Promise", p);
    logError(reason + ". Unhandled Rejection at Promise:" + p);
  })
  .on("uncaughtException", (err) => {
    console.log(err, "Uncaught Exception thrown");
    // logError(err + ". Uncaught Exception thrown" + err.stack);
    process.exit(1);
  })


const getRandomProvider = () => {
  return ethers.getDefaultProvider("https://bsc-dataseed1.ninicoin.io") //"wss://thrumming-still-leaf.bsc.quiknode.pro/b2f8a5b1bd0809dbf061112e1786b4a8e53c9a83/")
  // return new HDWalletProvider(
  //   secrets.mnemonic,
  //   "wss://thrumming-still-leaf.bsc.quiknode.pro/b2f8a5b1bd0809dbf061112e1786b4a8e53c9a83/" //"https://bsc.getblock.io/mainnet/?api_key=3f594a5f-d0ed-48ca-b0e7-a57d04f76332" //networks[Math.floor(Math.random() * networks.length)]
  // )
}

export const getAddress = (address) => {
  const mainNetChainId = 56
  const chainId = process.env.CHAIN_ID
  return address[chainId] ? address[chainId] : address[mainNetChainId]
}


export let provider = getRandomProvider()

const gasPrice = 5

// const web3 = new Web3(provider)

// const web3Provider = new ethers.providers.Web3Provider(getRandomProvider())
// web3Provider.pollingInterval = 15000

const signer = new ethers.Wallet(secrets.key, provider) //web3Provider.getSigner()

const arcaneItemsContract = new ethers.Contract(getAddress(contracts.items), ArcaneItems.abi, signer)

let gameProcess = null

function getTime() {
  return new Date().getTime()
}


const emitAll = (...args) => {
  // log('emitAll', ...args)
  io.emit(...args)
}


function getPayload(messages) {
  // super-cheap JSON Array construction
  return Buffer.from([ '[', messages.join(','), ']' ].join(''));
}


function convertToDecimal(byte) {
  let result = 0;

  byte = byte.split('');

  byte.reverse();

  for (let a = 0; a < byte.length; a++){
    if (byte[a] === '1'){
      result += 2 ** a;
    }
  }

  return result;
}

function binaryAgent(str) {
  let bytes = str.split(' ');
  let output = '';
    
  for (let k = 0; k < bytes.length; k++){
      if (bytes[k]) output += String.fromCharCode(convertToDecimal(bytes[k]));
  }

  return output;
}

function decodePayload(msg) {
  // @ts-ignore
  let json = binaryAgent(msg) //String.fromCharCode.apply(null, new Uint8Array(msg));

  try {
    // explicitly decode the String as UTF-8 for Unicode
    //   https://github.com/mathiasbynens/utf8.js
    // json = utf8.decode(json)
    // const buffer = Buffer.from(json, "binary");
    const data = JSON.parse(json)

    return data
  }
  catch (err) {
    // ...
    console.log(err)
  }
  
}


const emitDirect = (socket, ...args) => {
  log('emitDirect', ...args)

  if (!socket || !socket.emit) return

  const eventQueue = [[...args]]
  const compiled = []
  for (const e of eventQueue) {
    const name = e[0]
    const args = e.slice(1)
    
    compiled.push(`["${name}","${args.join(':')}"]`)
  }

  socket.emit('Events', getPayload(compiled))
}

io.on('connection', function(socket) {
  try {
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.conn.remoteAddress?.split(":")[3]

    let currentClient = {
      name: 'Unknown' + Math.floor(Math.random() * 999),
      id: socket.id,
      ip,
      lastReportedTime: getTime(),
      log: {
        clientDisconnected: 0
      }
    }

    log('Client connected from ' + ip)

    sockets[currentClient.id] = socket
    clientLookup[currentClient.id] = currentClient

    clients.push(currentClient)

    // Use by GS to tell RD it's connected
    socket.on('RD_Connect', function() {
      emitDirect(socket, 'OnConnected')
    })

    // Use by GS to tell RS it's connected
    socket.on('GS_Connect', function() {
      emitDirect(socket, 'OnConnected')
    })

    socket.on('GS_SaveRoundResult', function(msg) {
      try {
        const pack = decodePayload(msg)

        // Update player stat DB

      } catch (e) {
        console.log(e)
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
})


export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startGameServer() {
  const binaryPath = {
    linux: '../game-server/build/index.js',
    darwin: '../game-server/build/index.js',
    win32: ''
  }[process.platform]

  // Start the server
  gameProcess = spawn('node',
    ['build/index.js'], 
    {cwd: path.join(__dirname, '../game-server'), env: { ...process.env, SUDO_USER: 'dev2', PORT: '3001', SSL_PORT: '4001' }, stdio: ['ignore', 'pipe', 'pipe']}
  )

  gameProcess.stdout.pipe(process.stdout)
  gameProcess.stderr.pipe(process.stderr)

  gameProcess.on('exit', function (code, signal) {
    console.log('child process exited with ' +
              `code ${code} and signal ${signal}`)
  })

  subProcesses.push(gameProcess)
}

async function initWebServer() {
  // @ts-ignore
  const rateLimiter = new RateLimit({
    windowMs: 2,
    max: 5,
  })

  // Security related
  server.set('trust proxy', 1)
  server.use(helmet())
  server.use(
    cors({
      allowedHeaders: ['Accept', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Content-Type', 'applicationId'],
    })
  )

  // Accept json and other formats in the body
  server.use(bodyParser.urlencoded({ extended: true }))
  server.use(bodyParser.json())

  // Apply ratelimit
  server.use(rateLimiter)

  // Logging
  server.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  server.use(express.static(path.join(__dirname, '/../game-server/public')))
}

async function upgradeCodebase() {
  // Pull latest from Git
  const execPromise = util.promisify(exec)
  
  try {
    await execPromise('rm .git/index.lock')
  } catch(e2) {
    console.log(e2)
  }

  const { stdout, stderr } = await execPromise('git add -A && git stash && git pull', {uid: 1000})

  console.log(stderr, stdout)

  await wait(100)
}

async function upgradeGsCodebase() {
  // Pull latest from Git
  const execPromise = util.promisify(exec)
  
  try {
    await execPromise('cd game-server && rm .git/index.lock', {uid: 1000})
    await wait(1000)
  } catch(e2) {
    console.log(e2)
  }

  const { stdout, stderr } = await execPromise('cd game-server && git add -A && git stash && git pull origin master', {uid: 1000})

  console.log(stderr, stdout)

  await wait(100)
}

async function cloneGsCodebase() {
  // Pull latest from Git
  const execPromise = util.promisify(exec)
  
  try {
    await execPromise('rm -rf game-server', {uid: 1000})
  } catch(e2) {
    console.log(e2)
  }

  const { stdout, stderr } = await execPromise('git clone git@github.com:RuneFarm/rune-evolution-game-server.git game-server', {uid: 1000})

  console.log(stderr, stdout)

  await wait(100)
}

const getSocket = (endpoint) => {
  console.log('Connecting to', endpoint)
  return ioClient(endpoint, {
    transports: ['websocket'],
    upgrade: false,
    autoConnect: false,
    // pingInterval: 5000,
    // pingTimeout: 20000
    // extraHeaders: {
    //   "my-custom-header": "1234"
    // }
  })
}

function initGameServerConnection() {
  const server = {
    endpoint: 'localhost:3001',
    key: 'local1'
  }

  const socket = getSocket('http://' + server.endpoint)

  socket.on('connect', () => {
    console.log('Connected: ' + server.key)

    socket.emit('ObserverJoin')
  })

  socket.on('disconnect', () => {
    console.log('Disconnected: ' + server.key)
  })

  socket.on('OnObserverPing', function (msg) {
    console.log(msg)
  })

  socket.on('OnObserverInit', function (msg) {
    console.log(msg)
  })

  socket.on('OnObserverRoundFinished', function (msg) {
    console.log(msg)
  })

  socket.onAny(function(eventName, res) {
    console.log(eventName, res)
    if (gsCallbacks[res.id]) {
      console.log('Running callback handler for ' + eventName)
      gsCallbacks[res.id](res)

      delete gsCallbacks[res.id]
    }
  })

  socket.connect()

  gameServer.socket = socket
}

initGameServerConnection()

const gsCallbacks = {}

async function gsCall(name, data = {}) {
  return new Promise(resolve => {
    const id = shortId()
    
    gsCallbacks[id] = resolve

    gameServer.socket.emit(name, { id, data })
  })
}

const initRoutes = async () => {
  try {
    server.get('/admin/upgrade', async function(req, res) {
      try {
        upgradeCodebase()

        res.json({ success: 1 })
      } catch (e) {
        console.log(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/start', function(req, res) {
      try {
        startGameServer()

        res.json({ success: 1 })
      } catch (e) {
        console.log(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/stop', function(req, res) {
      try {
        killSubProcesses()

        res.json({ success: 1 })
      } catch (e) {
        console.log(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/reboot', function(req, res) {
      try {
        killSubProcesses()
        setTimeout(startGameServer, 5 * 1000)

        res.json({ success: 1 })
      } catch (e) {
        console.log(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/upgrade', async function(req, res) {
      try {
        // Tell players and game servers to shut down
        emitAll('ServerUpgrade')

        upgradeGsCodebase()

        setTimeout(async () => {
          killSubProcesses()
          setTimeout(startGameServer, 5 * 1000)
  
          res.json({ success: 1 })
        }, 5 * 1000)
      } catch (e) {
        console.log(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/clone', async function(req, res) {
      try {
        cloneGsCodebase()

        res.json({ success: 1 })
      } catch (e) {
        console.log(e)
        res.json({ success: 0 })
      }
    })

    server.get('/info', async function(req, res) {
      const response = await gsCall('ServerInfoRequest')

      res.json(response)
    })

    server.get('/db', async function(req, res) {
      const response = await gsCall('DbRequest')

      res.json(response)
    })

    server.get('/config', async function(req, res) {
      const response = await gsCall('ConfigRequest')

      res.json(response)
    })

    server.post('/maintenance', async function(req, res) {
      const response = await gsCall('MaintenanceRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/unmaintenance', async function(req, res) {
      const response = await gsCall('UnmaintenanceRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/startBattleRoyale', async function(req, res) {
      const response = await gsCall('StartBattleRoyaleRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/stopBattleRoyale', async function(req, res) {
      const response = await gsCall('StopBattleRoyaleRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/pauseRound', async function(req, res) {
      const response = await gsCall('PauseRoundRequest', {
        address: req.body.address,
        signature: req.body.signature,
        gameMode: req.body.gameMode
      })

      res.json(response)
    })

    server.post('/startRound', async function(req, res) {
      const response = await gsCall('StartRoundRequest', {
        address: req.body.address,
        signature: req.body.signature,
        gameMode: req.body.gameMode
      })

      res.json(response)
    })

    server.post('/enableForceLevel2', async function(req, res) {
      const response = await gsCall('EnableForceLevel2Request', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/disableForceLevel2', async function(req, res) {
      const response = await gsCall('DisableForceLevel2Request', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/startGodParty', async function(req, res) {
      const response = await gsCall('StartGodPartyRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/stopGodParty', async function(req, res) {
      const response = await gsCall('StopGodPartyRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/makeBattleHarder', async function(req, res) {
      const response = await gsCall('MakeBattleHarderRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/makeBattleEasier', async function(req, res) {
      const response = await gsCall('MakeBattleEasierRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/resetBattleDifficulty', async function(req, res) {
      const response = await gsCall('ResetBattleDifficultyRequest', {
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/addMod/:address', async function(req, res) {
      const response = await gsCall('AddModRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/removeMod/:address', async function(req, res) {
      const response = await gsCall('RemoveModRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/setConfig/:key/:value', async function(req, res) {
      const response = await gsCall('SetConfigRequest', {
        key: req.params.key,
        value: req.params.value,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/report/:address', async function(req, res) {
      const response = await gsCall('ReportUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/ban/:address', async function(req, res) {
      const response = await gsCall('BanUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/unban/:address', async function(req, res) {
      const response = await gsCall('UnbanUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature
      })

      res.json(response)
    })

    server.post('/message/:address', async function(req, res) {
      const response = await gsCall('MessageUserRequest', {
        target: req.params.address,
        address: req.body.address,
        signature: req.body.signature,
        message: req.body.message
      })

      res.json(response)
    })

    server.post('/broadcast', async function(req, res) {
      const response = await gsCall('BoradcastRequest', {
        address: req.body.address,
        signature: req.body.signature,
        message: req.body.message
      })

      res.json(response)
    })

    server.get('/user/:address/details', async function(req, res) {
      const response = await gsCall('UserDetailsRequest', {
        address: req.params.address
      })

      res.json(response)
    })

    server.get('/user/:address', async function(req, res) {
      const response = await gsCall('UserRequest', {
        address: req.params.address
      })

      res.json(response)
    })

    server.get('/admin/claim/:address/:symbol/:amount/:tx', async function(req, res) {
      const response = await gsCall('AdminClaimRequest', {
        address: req.params.address,
        symbol: req.params.symbol,
        amount: req.params.amount,
        tx: req.params.tx
      })

      res.json(response)
    })
    
    server.get('/readiness_check', (req, res) => res.sendStatus(200))
    server.get('/liveness_check', (req, res) => res.sendStatus(200))

    server.get('/.well-known/acme-challenge/-mROdU-GRZs53IaKoASvx7og2NHoD0fw5_nnaHtE4Ic', (req, res) => res.end('-mROdU-GRZs53IaKoASvx7og2NHoD0fw5_nnaHtE4Ic.rf1Z-ViQiJBjN-_x-EzQlmFjnB7obDoQD_BId0Z24Oc'))
  } catch(e) {
    logError(e)
  }
}

const init = async () => {
  try {
    await initWebServer()
    await initRoutes()

    const sslPort = process.env.SSL_PORT || 443
    https.listen(sslPort, function() {
      log(`:: Backend ready and listening on *:${sslPort}`)
    })

    const port = process.env.PORT || 80
    http.listen(port, function() {
      log(`:: Backend ready and listening on *:${port}`)
    })
  } catch(e) {
    logError(e)
  }
}

init()