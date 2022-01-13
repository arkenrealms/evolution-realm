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
import { io as ioClient } from 'socket.io-client'
import axios from 'axios'
import {spawn, exec} from 'child_process'
import ArcaneItems from './contracts/ArcaneItems.json'
import BEP20Contract from './contracts/BEP20.json'
import { decodeItem } from './decodeItem'
import contracts from './contracts'
import * as secrets from './secrets'
import Provider from './util/provider'

const path = require('path')

const subProcesses = []
const banList = []
const modList = []
const playerRewards = {} as any
const gsCallbacks = {}

const rewards = {
  "runes": [
    {
      "type": "rune",
      "symbol": "sol",
      "quantity": 100
    },
    {
      "type": "rune",
      "symbol": "tir",
      "quantity": 100
    },
    {
      "type": "rune",
      "symbol": "nef",
      "quantity": 100
    },
    {
      "type": "rune",
      "symbol": "ith",
      "quantity": 10000
    },
    {
      "type": "rune",
      "symbol": "hel",
      "quantity": 100
    },
    {
      "type": "rune",
      "symbol": "ral",
      "quantity": 10000
    },
    {
      "type": "rune",
      "symbol": "thul",
      "quantity": 10000
    },
    {
      "type": "rune",
      "symbol": "amn",
      "quantity": 10000
    },
    {
      "type": "rune",
      "symbol": "ort",
      "quantity": 10000
    },
    {
      "type": "rune",
      "symbol": "shael",
      "quantity": 100
    },
    {
      "type": "rune",
      "symbol": "tal",
      "quantity": 10000
    },
    {
      "type": "rune",
      "symbol": "dol",
      "quantity": 100
    },
    {
      "type": "rune",
      "symbol": "zod",
      "quantity": 0
    }
  ],
  "items": [],
  "characters": [
    {
      "type": "character",
      "tokenId": "1"
    }
  ]
} as any

const config = jetpack.read(path.resolve('./public/data/config.json'), 'json')

const rewardSpawnPoints = [
  {x: -16.32, y: -15.7774},
  {x: -9.420004, y: -6.517404},
  {x: -3.130003, y: -7.537404},
  {x: -7.290003, y: -12.9074},
  {x: -16.09, y: -2.867404},
  {x: -5.39, y: -3.76},
  {x: -7.28, y: -15.36},
  {x: -13.46, y: -13.92},
  {x: -12.66, y: -1.527404},
]

const rewardSpawnPoints2 = [
  {x: -16.32, y: -15.7774},
  {x: -9.420004, y: -6.517404},
  {x: -3.130003, y: -7.537404},
  {x: -7.290003, y: -12.9074},
  {x: -16.09, y: -2.867404},
  {x: -5.39, y: -3.76},
  {x: -12.66, y: -1.527404},

  {x: -24.21, y: -7.58},
  {x: -30.62, y: -7.58},
  {x: -30.8, y: -14.52},
  {x: -20.04, y: -15.11},
  {x: -29.21, y: -3.76},
  {x: -18.16, y: 0.06},
  {x: -22.98, y: -3.35},
  {x: -25.92, y: -7.64},
  {x: -20.1, y: -6.93},
  {x: -26.74, y: 0},
  {x: -32.74, y: -5.17},
  {x: -25.74, y: -15.28},
  {x: -22.62, y: -11.69},
  {x: -26.44, y: -4.05},
]

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

let clients = [] // to storage clients
const clientLookup = {}
const sockets = {} // to storage sockets
const serverVersion = "1.0.0"
const debug = process.env.HOME === '/Users/dev'

if (debug) {
  console.log('Running RS in DEBUG mode')
}

const log = (...msgs) => {
  if (debug) {
    console.log('[RS]', ...msgs)
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
  console.log("[RS]", err)

  const errorLog = jetpack.read(path.resolve('./public/data/errors.json'), 'json') || []

  errorLog.push(err + '')
  
  jetpack.write(path.resolve('./public/data/errors.json'), JSON.stringify(errorLog, null, 2), { atomic: true })
}

const gameServer = {
  socket: undefined
}

process
  .on("unhandledRejection", (reason, p) => {
    console.log(reason, "Unhandled Rejection at Promise", p)
    logError(reason + ". Unhandled Rejection at Promise:" + p)
  })
  .on("uncaughtException", (err) => {
    console.log(err, "Uncaught Exception thrown")
    // logError(err + ". Uncaught Exception thrown" + err.stack)
    process.exit(1)
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


const verifySignature = (signature, address) => {
  log('Verifying', signature, address)
  try {
    return web3.eth.accounts.recover(signature.value, signature.hash).toLowerCase() === address.toLowerCase()
  } catch(e) {
    log(e)
    return false
  }
}
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
  let bytes = str.split(' ')
  let output = ''
    
  for (let k = 0; k < bytes.length; k++) {
    if (bytes[k]) output += String.fromCharCode(convertToDecimal(bytes[k]))
  }

  return output
}

const random = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
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

// @ts-ignore
const web3 = new Web3(new Provider())

async function GetSignedRequest(data) {
  return {
    address: secrets.address,
    hash: await web3.eth.personal.sign(JSON.stringify(data), secrets.address, null),
    data
  }
}

const emitDirect = (socket, ...args) => {
  log('emitDirect', ...args)

  if (!socket || !socket.emit) return

  socket.emit(...args)
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

    socket.on('AddModRequest', async function(req) {
      try {
        log('AddMod', {
          caller: req.data.address
        })

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && modList.includes(req.data.address)) {
          modList.push(req.params.address)
      
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

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && modList.includes(req.data.address)) {
          for (const client of clients) {
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

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && modList.includes(req.data.address)) {
          gsCall('KickUser', await GetSignedRequest({ target: req.data.address }))

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

        if (await verifySignature({ value: req.data.address, hash: req.data.signature }, req.data.address) && modList.includes(req.data.address)) {
          banList.splice(banList.indexOf(req.data.target), 1)

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

function connectGameServer() {
  if (gameServer.socket) {
    gameServer.socket.close()
  }

  const server = {
    endpoint: 'localhost:3001',
    key: 'local1'
  }

  const socket = getSocket('http://' + server.endpoint)
  let connectTimeout

  socket.on('connect', () => {
    log('Connected: ' + server.key)

    clearTimeout(connectTimeout)

    socket.emit('RS_Connected')
  })

  socket.on('disconnect', () => {
    log('Disconnected: ' + server.key)
  })

  socket.on('GS_Ping', function (msg) {
    log(msg)
  })

  socket.on('GS_Init', function (msg) {
    log(msg)
  })

  // Use by GS to tell RS it's connected
  socket.on('GS_Connect', function() {
    emitDirect(socket, 'OnConnected')
  })

  socket.on('GS_SaveRoundRequest', function(req) {
    try {
      log('GS_SaveRound', {
        caller: req.data.address
      })

      // Update player stat DB

      emitDirect(socket, 'GS_SaveRoundResponse', {
        id: req.id,
        data: { success: 1 }
      })
    } catch (e) {
      logError(e)

      emitDirect(socket, 'GS_SaveRoundResponse', {
        id: req.id,
        data: { success: 0 }
      })
    }
  })

  socket.on('GS_ConfirmUserRequest', function(req) {
    try {
      log('GS_ConfirmUser', {
        caller: req.data.address
      })

      if (!banList.includes(req.data.address)) {
        emitDirect(socket, 'GS_ConfirmUserResponse', {
          id: req.id,
          data: { success: 1 }
        })
      } else {
        emitDirect(socket, 'GS_ConfirmUserResponse', {
          id: req.id,
          data: { success: 0 }
        })
      }
    } catch (e) {
      logError(e)
      
      emitDirect(socket, 'GS_ConfirmUserResponse', {
        id: req.id,
        data: { success: 0 }
      })
    }
  })

  socket.on('GS_ReportUserRequest', function (req) {
    try {
      log('GS_ReportUser', {
        caller: req.data.address
      })

      if (req.data.reportedAddress && !banList.includes(req.data.reportedAddress)) {
        emitDirect(socket, 'GS_ReportUserResponse', {
          id: req.id,
          data: { success: 1 }
        })
      } else {
        emitDirect(socket, 'GS_ReportUserResponse', {
          id: req.id,
          data: { success: 0 }
        })
      }
    } catch (e) {
      logError(e)
      
      emitDirect(socket, 'GS_ReportUserResponse', {
        id: req.id,
        data: { success: 0 }
      })
    }
  })

  socket.on('GS_VerifySignatureRequest', function(req) {
    emitDirect(socket, 'GS_VerifySignatureResponse', {
      id: req.id,
      data: web3.eth.accounts.recover(req.data.value, req.data.hash).toLowerCase() === req.data.address.toLowerCase()
    })
  })

  socket.on('GS_VerifyAdminSignatureRequest', function(req) {
    const normalizedAddress = web3.utils.toChecksumAddress(req.data.address.trim())
    emitDirect(socket, 'GS_VerifyAdminSignatureResponse', {
      id: req.id,
      data: web3.eth.accounts.recover(req.data.value, req.data.hash).toLowerCase() === req.data.address.toLowerCase() && modList.includes(normalizedAddress)
    })
  })

  socket.on('GS_NormalizeAddressRequest', function(req) {
    emitDirect(socket, 'GS_NormalizeAddressResponse', {
      id: req.id,
      data: web3.utils.toChecksumAddress(req.data.address.trim())
    })
  })

  socket.on('GS_ClaimRewardRequest', function(req) {
    try {
      const { currentPlayer, reward } = req.data

      if (currentPlayer.address) {
        if (reward.type === 'rune') {
          if (!playerRewards[currentPlayer.address]) playerRewards[currentPlayer.address] = {}
          if (!playerRewards[currentPlayer.address].pending) playerRewards[currentPlayer.address].pending = {}
          if (!playerRewards[currentPlayer.address].pending[reward.symbol]) playerRewards[currentPlayer.address].pending[reward.symbol] = 0

          playerRewards[currentPlayer.address].pending[reward.symbol] = Math.round((playerRewards[currentPlayer.address].pending[reward.symbol] + config.rewardItemAmount) * 1000) / 1000
          
          rewards.runes.find(r => r.symbol === reward.symbol).quantity -= config.rewardItemAmount
        } else {
          if (!playerRewards[currentPlayer.address]) playerRewards[currentPlayer.address] = {}
          if (!playerRewards[currentPlayer.address].pendingItems) playerRewards[currentPlayer.address].pendingItems = []

          playerRewards[currentPlayer.address].pendingItems.push(JSON.parse(JSON.stringify(reward)))
        }
      }
    } catch(e) {
      logError(e)
    }
  })

  socket.on('GS_GetRandomRewardRequest', function(req) {
    const now = getTime()

    if (!config.drops) config.drops = {}
    if (!config.drops.guardian) config.drops.guardian = 1633043139000
    if (!config.drops.earlyAccess) config.drops.earlyAccess = 1633043139000
    if (!config.drops.trinket) config.drops.trinket = 1633043139000
    if (!config.drops.santa) config.drops.santa = 1633043139000
    if (!config.drops.runeword) config.drops.runeword = 1633043139000
    if (!config.drops.runeToken) config.drops.runeToken = 1633043139000

    const timesPer10Mins = Math.round(10 * 60 / config.rewardSpawnLoopSeconds)
    const randPer10Mins = random(0, timesPer10Mins)
    const timesPerDay = Math.round(40 * 60 * 60 / config.rewardSpawnLoopSeconds)
    const randPerDay = random(0, timesPerDay)
    const timesPerWeek = Math.round(10 * 24 * 60 * 60 / config.rewardSpawnLoopSeconds)
    const randPerWeek = random(0, timesPerWeek)
    const timesPerBiweekly = Math.round(20 * 24 * 60 * 60 / config.rewardSpawnLoopSeconds)
    const randPerBiweekly = random(0, timesPerBiweekly)
    const timesPerMonth = Math.round(31 * 24 * 60 * 60 / config.rewardSpawnLoopSeconds)
    const randPerMonth = random(0, timesPerMonth)

    let tempReward

    if ((now - config.drops.guardian) > 48 * 60 * 60 * 1000 && randPerDay === Math.round(timesPerDay / 2)) { // (now - config.drops.guardian) > 12 * 60 * 60 * 1000) {
      tempReward = {
        id: shortId.generate(),
        position: config.level2open ? rewardSpawnPoints2[random(0, rewardSpawnPoints2.length-1)] : rewardSpawnPoints[random(0, rewardSpawnPoints.length-1)],
        enabledAt: now,
        name: 'Guardian Egg',
        rarity: 'Magical',
        quantity: 1
      }

      const rand = random(0, 1000)
      
      if (rand === 1000)
        tempReward.rarity = 'Mythic'
      else if (rand > 950)
        tempReward.rarity = 'Epic'
      else if (rand > 850)
        tempReward.rarity = 'Rare'

      config.rewardItemName = tempReward.rarity + ' ' + tempReward.name
      config.rewardItemType = 2
      config.drops.guardian = now
    } else if ((now - config.drops.earlyAccess) > 30 * 24 * 60 * 60 * 1000 && randPerMonth === Math.round(timesPerMonth / 2)) { // (now - config.drops.earlyAccess) > 7 * 24 * 60 * 60 * 1000
      tempReward = {
        id: shortId.generate(),
        position: config.level2open ? rewardSpawnPoints2[random(0, rewardSpawnPoints2.length-1)] : rewardSpawnPoints[random(0, rewardSpawnPoints.length-1)],
        enabledAt: now,
        name: `Early Access Founder's Cube`,
        rarity: 'Unique',
        quantity: 1
      }

      config.rewardItemName = tempReward.name
      config.rewardItemType = 3
      config.drops.earlyAccess = now
    // } else if (randPer10Mins === Math.round(timesPer10Mins / 2)) { // (now - config.drops.earlyAccess) > 7 * 24 * 60 * 60 * 1000
    //   tempReward = {
    //     id: shortId.generate(),
    //     position: config.level2open ? rewardSpawnPoints2[random(0, rewardSpawnPoints2.length-1)] : rewardSpawnPoints[random(0, rewardSpawnPoints.length-1)],
    //     enabledAt: now,
    //     name: `Santa Christmas 2021 Ticket`,
    //     rarity: 'Normal',
    //     quantity: 1
    //   }

    //   sharedConfig.rewardItemName = tempReward.name
    //   sharedConfig.rewardItemType = 6
    //   config.rewardItemName = sharedConfig.rewardItemName
    //   config.rewardItemType = sharedConfig.rewardItemType

    //   config.drops.santa = now
    } else if ((now - config.drops.trinket) > 24 * 60 * 60 * 1000 && randPerDay === Math.round(timesPerDay / 4)) { // (now - config.drops.trinket) > 12 * 60 * 60 * 1000
      tempReward = {
        id: shortId.generate(),
        position: config.level2open ? rewardSpawnPoints2[random(0, rewardSpawnPoints2.length-1)] : rewardSpawnPoints[random(0, rewardSpawnPoints.length-1)],
        enabledAt: now,
        name: 'Trinket',
        rarity: 'Magical',
        quantity: 1
      }

      const rand = random(0, 1000)
      
      if (rand === 1000)
        tempReward.rarity = 'Mythic'
      else if (rand > 950)
        tempReward.rarity = 'Epic'
      else if (rand > 850)
        tempReward.rarity = 'Rare'

      config.rewardItemName = tempReward.rarity + ' ' + tempReward.name
      config.rewardItemType = 4
      config.drops.trinket = now
    } else if ((now - config.drops.runeword) > 12 * 60 * 60 * 1000 && randPerDay === Math.round(timesPerDay / 5)) { // (now - config.drops.runeword) > 24 * 60 * 60 * 1000
      config.drops.runeword = now
    } else if ((now - config.drops.runeToken) > 31 * 24 * 60 * 60 * 1000 && randPerMonth === timesPerMonth / 3) { // (now - config.drops.runeToken) > 7 * 24 * 60 * 60 * 1000
      tempReward = {
        id: shortId.generate(),
        position: config.level2open ? rewardSpawnPoints2[random(0, rewardSpawnPoints2.length-1)] : rewardSpawnPoints[random(0, rewardSpawnPoints.length-1)],
        enabledAt: now,
        name: 'RUNE',
        rarity: 'Normal',
        quantity: 1
      }

      const rand = random(0, 1000)
      
      if (rand === 1000)
        tempReward.quantity = 10
      else if (rand > 990)
        tempReward.quantity = 3
      else if (rand > 950)
        tempReward.quantity = 2

      config.rewardItemName = tempReward.quantity + ' ' + tempReward.name
      config.rewardItemType = 5
      config.drops.runeToken = now
    } else {
      const odds = [
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes', 'runes',
        'runes'
      ]
    
      const rewardType = rewards[odds[random(0, odds.length-1)]]
    
      if (!rewardType || rewardType.length === 0) {
        emitDirect(socket, 'GS_GetRandomRewardResponse', {
          id: req.id,
          data: null
        })
        return
      }
    
      const reward = rewardType[random(0, rewardType.length-1)]
    
      if (reward.type === 'rune' && reward.quantity <= 0) {
        emitDirect(socket, 'GS_GetRandomRewardResponse', {
          id: req.id,
          data: null
        })
        return
      }
    
      const now = getTime()
    
      tempReward = JSON.parse(JSON.stringify(reward))
      tempReward.id = shortId.generate()
      tempReward.position = config.level2open ? rewardSpawnPoints2[random(0, rewardSpawnPoints2.length-1)] : rewardSpawnPoints[random(0, rewardSpawnPoints.length-1)]
      tempReward.enabledAt = now
      
      if (tempReward.type === 'rune') {
        config.rewardItemType = 0
        config.rewardItemName = tempReward.symbol.toUpperCase()
      }
    }

    emitDirect(socket, 'GS_GetRandomRewardResponse', {
      id: req.id,
      data: tempReward
    })
  })

  socket.onAny(function(eventName, res) {
    if (gsCallbacks[res.id]) {
      log('Callback', eventName)
      gsCallbacks[res.id](res.data)

      delete gsCallbacks[res.id]
    }
  })

  connectTimeout = setTimeout(function() {
    logError('Could not connect.')

    socket.close()
  }, 5000)

  socket.connect()

  gameServer.socket = socket
}

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
        logError(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/start', function(req, res) {
      try {
        startGameServer()
        connectGameServer()

        res.json({ success: 1 })
      } catch (e) {
        logError(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/reconnect', function(req, res) {
      try {
        connectGameServer()

        res.json({ success: 1 })
      } catch (e) {
        logError(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/stop', function(req, res) {
      try {
        killSubProcesses()

        res.json({ success: 1 })
      } catch (e) {
        logError(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/reboot', function(req, res) {
      try {
        killSubProcesses()
        setTimeout(startGameServer, 5 * 1000)

        res.json({ success: 1 })
      } catch (e) {
        logError(e)
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
        logError(e)
        res.json({ success: 0 })
      }
    })

    server.get('/admin/gs/clone', async function(req, res) {
      try {
        cloneGsCodebase()

        res.json({ success: 1 })
      } catch (e) {
        logError(e)
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