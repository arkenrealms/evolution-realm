import { sleep } from '@arken/node/util/time';
import axios from 'axios';
import semver from 'semver/preload.js';
import {
  log as logger,
  getTime,
  logError,
  shuffleArray,
  randomPosition,
  sha256,
  decodePayload,
  isNumeric,
  ipHashFromSocket,
} from '@arken/node/util';
import path from 'path';
import shortId from 'shortid';
import { initTRPC, TRPCError } from '@trpc/server';
import { createClient } from './trpc-client';
import mapData from './public/data/map.json';
import { UnsavedGame } from '../models';
import { z } from 'zod';
import { disconnectClient, emit, spectate } from '@arken/node/util/player';
import { customErrorFormatter } from '@arken/node/util/customErrorFormatter';
import { testMode, baseConfig, sharedConfig, Config } from './config';
import { presets } from './presets';

let app: App;
const t = initTRPC
  .context<{
    socket: any;
    client: Client;
  }>()
  .create();

interface App {
  io: any;
  state: any;
  realm: ReturnType<typeof createClient>;
  guestNames: string[];
  serverVersion: string;
  observers: any[];
  roundLoopTimeout?: NodeJS.Timeout;
  addressToUsername: Record<string, string>;
  announceReboot: boolean;
  rebootAfterRound: boolean;
  debugQueue: boolean;
  killSameNetworkClients: boolean;
  sockets: Record<string, any>;
  clientLookup: Record<string, Client>;
  powerups: any[];
  powerupLookup: Record<string, any>;
  currentReward?: any;
  orbs: any[];
  orbLookup: Record<string, any>;
  eventQueue: any[];
  clients: Client[];
  lastReward?: any;
  lastLeaderName?: string;
  config: Partial<Config>;
  sharedConfig: Partial<Config>;
  baseConfig: Partial<Config>;
  round: {
    startedAt: number;
    endedAt: number | null;
    events: any[];
    states: any[];
    players: Client[];
  };
  ranks: Record<string, any>;
  realmServer: {
    socket?: any;
  };
  ioCallbacks: Record<string, any>;
  pandas: string[];
  rateLimitWindow: number;
  maxRequestsPerWindow: number;
  requestTimestamps: Record<string, number[]>;
  loggableEvents: string[];
  currentPreset: any;
  roundConfig: Config;
  spawnBoundary1: Boundary;
  spawnBoundary2: Boundary;
  mapBoundary: Boundary;
  playerSpawnPoints: Position[];
  lastFastGameloopTime: number;
  lastFastestGameloopTime: number;
}

interface Client {
  name: string;
  id: string;
  startedRoundAt: number | null;
  avatar: number | null;
  network: string | null;
  address: string | null;
  device: string | null;
  position: Position;
  target: Position;
  clientPosition: Position;
  clientTarget: Position;
  rotation: any;
  xp: number;
  maxHp: number;
  latency: number;
  kills: number;
  killStreak: number;
  deaths: number;
  points: number;
  evolves: number;
  powerups: number;
  rewards: number;
  orbs: number;
  pickups: any[];
  isMod: boolean;
  isBanned: boolean;
  isMasterClient: boolean;
  isDisconnected: boolean;
  isDead: boolean;
  isJoining: boolean;
  isSpectating: boolean;
  isStuck: boolean;
  isGod: boolean;
  isRealm: boolean;
  isGuest: boolean;
  isInvincible: boolean;
  isPhased: boolean;
  overrideSpeed: number | null;
  overrideCameraSize: number | null;
  cameraSize: number;
  speed: number;
  joinedAt: number;
  invincibleUntil: number;
  decayPower: number;
  hash: string;
  lastReportedTime: number;
  lastUpdate: number;
  gameMode: string;
  phasedUntil: number;
  overrideSpeedUntil: number;
  joinedRoundAt: number;
  baseSpeed: number;
  lastTouchPlayerId: string;
  lastTouchTime: number;
  character: {
    meta: Record<number, number>;
  };
  log: {
    kills: string[];
    deaths: string[];
    revenge: number;
    resetPosition: number;
    phases: number;
    stuck: number;
    collided: number;
    timeoutDisconnect: number;
    speedProblem: number;
    clientDistanceProblem: number;
    outOfBounds: number;
    ranOutOfHealth: number;
    notReallyTrying: number;
    tooManyKills: number;
    killingThemselves: number;
    sameNetworkDisconnect: number;
    connectedTooSoon: number;
    clientDisconnected: number;
    positionJump: number;
    pauses: number;
    connects: number;
    path: string;
    positions: number;
    replay: any[];
    recentJoinProblem: number;
    usernameProblem: number;
    maintenanceJoin: number;
    signatureProblem: number;
    signinProblem: number;
    versionProblem: number;
    failedRealmCheck: number;
    spectating: number;
  };
}

interface Position {
  x: number;
  y: number;
}

interface Boundary {
  x: { min: number; max: number };
  y: { min: number; max: number };
}

function log(...args: any[]) {
  logger(...args);
}

function comparePlayers(a: Client, b: Client): number {
  if (a.points > b.points) return -1;
  if (a.points < b.points) return 1;
  return 0;
}

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function normalizeAddress(address: string): Promise<string | false> {
  if (!address) return false;
  try {
    const res = await app.realm.normalizeAddress.mutate({ address });
    log('normalizeAddressResponse', res);
    return res.address;
  } catch (e) {
    log('Error:', e);
    return false;
  }
}

async function isValidSignatureRequest(req: {
  signature: { data: string; hash: string; address: string };
}): Promise<boolean> {
  log('Verifying', req);
  if (!req.signature.address) return false;
  if (req.signature.address.length !== 42 || req.signature.address.slice(0, 2) !== '0x') return false;
  try {
    const res = await app.realm.verifySignature.mutate(req);
    return res.verified === true;
  } catch (e) {
    log('Error:', e);
    return false;
  }
}

function formatNumber(num: number): string {
  return num >= 0 ? '+' + num : '-' + num;
}

function getClientSpeed(client: Client, config: Config): number {
  return normalizeFloat(app.config.baseSpeed * app.config['avatarSpeedMultiplier' + client.avatar!] * client.baseSpeed);
}

function emitAllDirect(...args: any[]) {
  app.io.emit(...args);
}

function emitAll(...args: any[]) {
  app.eventQueue.push(args);
}

function emitDirect(socket: any, eventName: string, eventData: any) {
  if (app.loggableEvents.includes(eventName)) {
    console.log(`Publish EventDirect: ${eventName}`, eventData);
  }
  socket.emit(eventName, eventData);
}

function emit(client: Client, ...args: any[]) {
  if (!client) {
    log('Emit Direct failed, no client', ...args);
    return;
  }
  const socket = app.sockets[client.id];
  if (!socket || !socket.emit) {
    log('Emit Direct failed, bad socket', ...args);
    return;
  }
  log('Emit Direct', ...args);
  const compiled: any[] = [];
  const eventQueue = [[...args]];
  for (const e of eventQueue) {
    const name = e[0];
    const args = e.slice(1);
    compiled.push(`["${name}","${args.join(':')}"]`);
    app.round.events.push({ type: 'emitDirect', player: socket.id, name, args });
  }
  emitDirect(socket, 'events', getPayload(compiled));
}

async function spawnRandomReward() {
  if (app.currentReward) return;
  removeReward();
  const rewardRes = await app.realm.getRandomReward.query();
  if (rewardRes?.status !== 1) return;
  const tempReward = rewardRes.reward;
  if (!tempReward) return;
  if (tempReward.type !== 'rune') {
    emitAll('onBroadcast', `Powerful Energy Detected - ${tempReward.rewardItemName}`, 3);
  }
  await sleep(3 * 1000);
  app.currentReward = JSON.parse(JSON.stringify(tempReward));
  emitAll(
    'onSpawnReward',
    app.currentReward.id,
    app.currentReward.rewardItemType,
    app.currentReward.rewardItemName,
    app.currentReward.quantity,
    app.currentReward.position.x,
    app.currentReward.position.y
  );
  await sleep(30 * 1000);
  if (!app.currentReward) return;
  if (app.currentReward.id !== tempReward.id) return;
  removeReward();
}

function disconnectAllPlayers() {
  if (app.clients.length === 0) return;
  log('Disconnecting all players');
  for (let i = 0; i < app.clients.length; i++) {
    const client = app.clients[i];
    disconnectClient(client, 'disconnect all players');
  }
}

function monitorObservers() {
  updateObservers();
  if (app.observers.length === 0) {
    emitAll('onBroadcast', `Realm not connected. Contact support.`, 0);
    disconnectAllPlayers();
  }
  setTimeout(() => monitorObservers(), 5 * 1000);
}

function moveVectorTowards(current: Position, target: Position, maxDistanceDelta: number): Position {
  const a = { x: target.x - current.x, y: target.y - current.y };
  const magnitude = Math.sqrt(a.x * a.x + a.y * a.y);
  if (magnitude <= maxDistanceDelta || magnitude === 0) return target;
  return { x: current.x + (a.x / magnitude) * maxDistanceDelta, y: current.y + (a.y / magnitude) * maxDistanceDelta };
}

function isMechanicEnabled(player: Client, mechanicId: number): boolean {
  if (app.config.isBattleRoyale) return false;
  if (player.isMod) return true;
  if (app.config.disabledMechanics.includes(mechanicId)) return false;
  return app.config.mechanics.includes(mechanicId);
}

async function claimReward(player: Client, reward: any) {
  if (!reward) return;
  if (app.config.anticheat.samePlayerCantClaimRewardTwiceInRow && app.lastReward?.winner === player.name) return;
  reward.winner = player.name;
  emitAll('onUpdateReward', player.id, reward.id);
  player.rewards += 1;
  player.points += app.config.pointsPerReward;
  player.pickups.push(reward);
  if (isMechanicEnabled(player, 1164) && player.character.meta[1164] > 0) {
    const r = random(1, 100);
    if (r <= player.character.meta[1164]) {
      player.pickups.push(reward);
      emitAll('onBroadcast', `${player.name} got a double pickup!`, 0);
    }
  }
  app.lastReward = reward;
  app.currentReward = null;
}

function randomizeSpriteXp() {
  const shuffledValues = shuffleArray([2, 4, 8, 16]);
  app.config.powerupXp0 = shuffledValues[0];
  app.config.powerupXp1 = shuffledValues[1];
  app.config.powerupXp2 = shuffledValues[2];
  app.config.powerupXp3 = shuffledValues[3];
}

async function getUsername(address: string): Promise<string> {
  try {
    log(`Getting username for ${address}`);
    const response = await axios(`https://cache.arken/users/${address}`);
    const { username = '' } = response.data;
    return username;
  } catch (error) {
    return '';
  }
}

function distanceBetweenPoints(pos1: Position, pos2: Position): number {
  return Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y);
}

function syncSprites() {
  log('Syncing sprites');
  const playerCount = app.clients.filter((c) => !c.isDead && !c.isSpectating && !c.isGod).length;
  const length = app.config.spritesStartCount + playerCount * app.config.spritesPerPlayerCount;
  if (app.powerups.length > length) {
    const deletedPoints = app.powerups.splice(length);
    for (let i = 0; i < deletedPoints.length; i++) {
      emitAll('onUpdatePickup', 'null', deletedPoints[i].id, 0);
    }
    app.config.spritesTotal = length;
  } else if (length > app.powerups.length) {
    spawnSprites(length - app.powerups.length);
  }
}

export function isRateLimited(address: string): boolean {
  const now = Date.now();
  if (!app.requestTimestamps[address]) {
    app.requestTimestamps[address] = [];
  }
  app.requestTimestamps[address] = app.requestTimestamps[address].filter(
    (timestamp) => now - timestamp < app.rateLimitWindow
  );
  if (app.requestTimestamps[address].length >= app.maxRequestsPerWindow) {
    return true;
  }
  app.requestTimestamps[address].push(now);
  return false;
}

function disconnectClient(player: Client, reason = 'Unknown', immediate = false) {
  if (player.isRealm) return;
  app.clients = app.clients.filter((c) => c.id !== player.id);
  if (app.config.gameMode === 'Pandamonium') {
    emitAll(
      'onBroadcast',
      `${
        app.clients.filter((c) => !c.isDead && !c.isDisconnected && !c.isSpectating && !app.pandas.includes(c.address))
          .length
      } alive`,
      0
    );
  }
  if (player.isDisconnected) return;
  try {
    log(`Disconnecting (${reason})`, player.id, player.name);
    delete app.clientLookup[player.id];
    player.isDisconnected = true;
    player.isDead = true;
    player.joinedAt = 0;
    player.latency = 0;
    const oldSocket = app.sockets[player.id];
    setTimeout(
      function () {
        emitAll('onUserDisconnected', player.id);
        syncSprites();
        flushEventQueue();
        if (oldSocket && oldSocket.emit && oldSocket.connected) oldSocket.disconnect();
        delete app.sockets[player.id];
      },
      immediate ? 0 : 1000
    );
  } catch (e) {
    log('Error:', e);
  }
}

function weightedRandom(items: { weight: number }[]): any {
  let table = items.flatMap((item) => Array(item.weight).fill(item));
  return table[Math.floor(Math.random() * table.length)];
}

function randomRoundPreset() {
  const gameMode = app.config.gameMode;
  while (app.config.gameMode === gameMode) {
    const filteredPresets = presets.filter((p) => !p.isOmit);
    app.currentPreset = weightedRandom(filteredPresets);
    app.roundConfig = { ...baseConfig, ...sharedConfig, ...app.currentPreset };
    log('randomRoundPreset', app.config.gameMode, gameMode, app.currentPreset);
    app.config = JSON.parse(JSON.stringify(app.roundConfig));
  }
}

function removeSprite(id: string) {
  if (app.powerupLookup[id]) {
    delete app.powerupLookup[id];
  }
  for (let i = 0; i < app.powerups.length; i++) {
    if (app.powerups[i].id === id) {
      app.powerups.splice(i, 1);
    }
  }
}

function removeOrb(id: string) {
  if (app.orbLookup[id]) {
    delete app.orbLookup[id];
  }
  for (let i = 0; i < app.orbs.length; i++) {
    if (app.orbs[i].id === id) {
      app.orbs.splice(i, 1);
    }
  }
}

function removeReward() {
  if (!app.currentReward) return;
  emitAll('onUpdateReward', 'null', app.currentReward.id);
  app.currentReward = undefined;
}

function getUnobstructedPosition(): Position {
  const spawnBoundary = app.config.level2open ? app.spawnBoundary2 : app.spawnBoundary1;
  let res: Position | null = null;
  while (!res) {
    let collided = false;
    const position = {
      x: randomPosition(spawnBoundary.x.min, spawnBoundary.x.max),
      y: randomPosition(spawnBoundary.y.min, spawnBoundary.y.max),
    };
    for (const gameObject of mapData) {
      if (!gameObject.Colliders || !gameObject.Colliders.length) continue;
      for (const gameCollider of gameObject.Colliders) {
        const collider = {
          minX: gameCollider.Min[0],
          maxX: gameCollider.Max[0],
          minY: gameCollider.Min[1],
          maxY: gameCollider.Max[1],
        };
        if (app.config.level2open && gameObject.Name === 'Level2Divider') {
          const diff = 25;
          collider.minY -= diff;
          collider.maxY -= diff;
        }
        if (
          position.x >= collider.minX &&
          position.x <= collider.maxX &&
          position.y >= collider.minY &&
          position.y <= collider.maxY
        ) {
          collided = true;
          break;
        }
      }
      if (collided) break;
    }
    if (!collided) {
      res = position;
    }
  }
  return res;
}

function spawnSprites(amount: number) {
  for (let i = 0; i < amount; i++) {
    const position = getUnobstructedPosition();
    const powerupSpawnPoint = { id: shortId.generate(), type: Math.floor(Math.random() * 4), scale: 1, position };
    app.powerups.push(powerupSpawnPoint);
    app.powerupLookup[powerupSpawnPoint.id] = powerupSpawnPoint;
    emitAll(
      'onSpawnPowerUp',
      powerupSpawnPoint.id,
      powerupSpawnPoint.type,
      powerupSpawnPoint.position.x,
      powerupSpawnPoint.position.y,
      powerupSpawnPoint.scale
    );
  }
  app.config.spritesTotal = app.powerups.length;
}

function addToRecentPlayers(player: Client) {
  if (!player.address || !player.name) return;
  app.round.players = app.round.players.filter((r) => r.address !== player.address);
  app.round.players.push(player);
}

async function isValidAdminRequest(req: { signature?: { address?: string } }): Promise<boolean> {
  log('Verifying Admin', req);
  if (!req.signature?.address) return false;
  if (req.signature.address.length !== 42 || req.signature.address.slice(0, 2) !== '0x') return false;

  if (isRateLimited(req.signature.address)) {
    logError('Rate limit exceeded for', req.signature.address);
    return false;
  }

  try {
    const res = await app.realm.verifyAdminSignature.mutate(req);
    return res?.status === 1;
  } catch (e) {
    log('Error:', e);
    return false;
  }
}

function roundEndingSoon(sec: number): boolean {
  const roundTimer = app.round.startedAt + app.config.roundLoopSeconds - Math.round(getTime() / 1000);
  return roundTimer < sec;
}

function generateGuestName(): string {
  const randomIndex = Math.floor(Math.random() * app.guestNames.length);
  return app.guestNames[randomIndex];
}

const registerKill = (winner: Client, loser: Client) => {
  const now = getTime();
  if (app.config.isGodParty) return;
  if (winner.isInvincible || loser.isInvincible) return;
  if (winner.isGod || loser.isGod) return;
  if (winner.isDead) return;
  if (app.config.gameMode !== 'Pandamonium' || !app.pandas.includes(winner.address)) {
    if (app.config.preventBadKills && (winner.isPhased || now < winner.phasedUntil)) return;
    const totalKills = winner.log.kills.filter((h) => h === loser.hash).length;
    const notReallyTrying = app.config.antifeed1
      ? (totalKills >= 2 && loser.kills < 2 && loser.rewards <= 1) ||
        (totalKills >= 2 && loser.kills < 2 && loser.powerups <= 100)
      : false;
    const tooManyKills = app.config.antifeed2
      ? app.clients.length > 2 &&
        totalKills >= 5 &&
        totalKills > winner.log.kills.length / app.clients.filter((c) => !c.isDead).length
      : false;
    const killingThemselves = app.config.antifeed3 ? winner.hash === loser.hash : false;
    const allowKill = !notReallyTrying && !tooManyKills;
    if (notReallyTrying) {
      loser.log.notReallyTrying += 1;
    }
    if (tooManyKills) {
      loser.log.tooManyKills += 1;
      return;
    }
    if (killingThemselves) {
      loser.log.killingThemselves += 1;
    }
    if (app.config.preventBadKills && !allowKill) {
      loser.phasedUntil = getTime() + 2000;
      return;
    }
  }
  if (app.config.gameMode === 'Pandamonium' && !app.pandas.includes(winner.address)) {
    return;
  }
  loser.xp -= app.config.damagePerTouch;
  winner.xp -= app.config.damagePerTouch;
  const time = getTime();
  loser.overrideSpeed = 2.5;
  loser.overrideSpeedUntil = time + 2000;
  winner.overrideSpeed = 2.5;
  winner.overrideSpeedUntil = time + 2000;
  if (loser.avatar !== 0 || loser.xp > 0) {
    loser.lastTouchPlayerId = winner.id;
    winner.lastTouchPlayerId = loser.id;
    loser.lastTouchTime = time;
    winner.lastTouchTime = time;
    return;
  }
  winner.kills += 1;
  winner.killStreak += 1;
  winner.points += app.config.pointsPerKill * (loser.avatar + 1);
  winner.log.kills.push(loser.hash);
  let deathPenaltyAvoid = false;
  if (isMechanicEnabled(loser, 1102) && loser.character.meta[1102] > 0) {
    const r = random(1, 100);
    if (r <= loser.character.meta[1102]) {
      deathPenaltyAvoid = true;
      emitAll('onBroadcast', `${loser.name} avoided penalty!`, 0);
    }
  }
  let orbOnDeathPercent =
    app.config.orbOnDeathPercent > 0
      ? app.config.leadercap && loser.name === app.lastLeaderName
        ? 50
        : app.config.orbOnDeathPercent
      : 0;
  let orbPoints = Math.floor(loser.points * (orbOnDeathPercent / 100));
  if (deathPenaltyAvoid) {
    orbOnDeathPercent = 0;
    orbPoints = 0;
  } else {
    loser.points = Math.floor(loser.points * ((100 - orbOnDeathPercent) / 100));
  }
  loser.deaths += 1;
  loser.killStreak = 0;
  loser.isDead = true;
  loser.log.deaths.push(winner.hash);
  if (winner.points < 0) winner.points = 0;
  if (loser.points < 0) loser.points = 0;
  if (winner.log.deaths.length && winner.log.deaths[winner.log.deaths.length - 1] === loser.hash) {
    winner.log.revenge += 1;
  }
  if (isMechanicEnabled(winner, 1222) && winner.character.meta[1222] > 0) {
    winner.overrideSpeed =
      winner.speed * (1 + winner.character.meta[1222] / 100) * (1 + winner.character.meta[1030] / 100);
    winner.overrideSpeedUntil = getTime() + 5000;
  }
  if (isMechanicEnabled(winner, 1219) && winner.character.meta[1219] > 0) {
    winner.maxHp = winner.maxHp * (1 + winner.character.meta[1219] / 100);
  }
  winner.xp += 25;
  if (winner.xp > winner.maxHp) winner.xp = winner.maxHp;
  emitAll('onGameOver', loser.id, winner.id);
  disconnectClient(loser, 'got killed');
  const orb = {
    id: shortId.generate(),
    type: 4,
    points: orbPoints,
    scale: orbPoints,
    enabledAt: now + app.config.orbTimeoutSeconds * 1000,
    position: { x: loser.position.x, y: loser.position.y },
  };
  const currentRound = app.config.roundId;
  if (app.config.orbOnDeathPercent > 0 && !roundEndingSoon(app.config.orbCutoffSeconds)) {
    setTimeout(() => {
      if (app.config.roundId !== currentRound) return;
      app.orbs.push(orb);
      app.orbLookup[orb.id] = orb;
      emitAll('onSpawnPowerUp', orb.id, orb.type, orb.position.x, orb.position.y, orb.scale);
    }, app.config.orbTimeoutSeconds * 1000);
  }
};

function spectate(player: Client) {
  try {
    if (app.config.isMaintenance && !player.isMod) return;
    if (player.isSpectating) {
    } else {
      player.isSpectating = true;
      player.isInvincible = true;
      player.points = 0;
      player.xp = 0;
      player.maxHp = 100;
      player.avatar = app.config.startAvatar;
      player.speed = 7;
      player.overrideSpeed = 7;
      player.cameraSize = 8;
      player.overrideCameraSize = 8;
      player.log.spectating += 1;
      syncSprites();
      emitAll('onSpectate', player.id, player.speed, player.cameraSize);
    }
  } catch (e) {
    log('Error:', e);
  }
}

function updateObservers() {
  app.observers = app.observers.filter((observer) => observer.socket.connected);
}

function sendUpdates() {
  emitAll('onClearLeaderboard');
  const leaderboard = app.round.players.sort(comparePlayers).slice(0, 10);
  for (let j = 0; j < leaderboard.length; j++) {
    emitAll(
      'OnUpdateBestKiller',
      leaderboard[j].name,
      j,
      leaderboard[j].points,
      leaderboard[j].kills,
      leaderboard[j].deaths,
      leaderboard[j].powerups,
      leaderboard[j].evolves,
      leaderboard[j].rewards,
      leaderboard[j].isDead ? '-' : Math.round(leaderboard[j].latency),
      app.ranks[leaderboard[j].address]?.kills / 5 || 1
    );
  }
  flushEventQueue();
  setTimeout(() => sendUpdates(), app.config.sendUpdateLoopSeconds * 1000);
}

function spawnRewards() {
  spawnRandomReward();
  setTimeout(() => spawnRewards(), app.config.rewardSpawnLoopSeconds * 1000);
}

function getRoundInfo(): any[] {
  return Object.keys(sharedConfig)
    .sort()
    .reduce((obj: any[], key) => {
      obj.push(app.config[key as keyof Config]);
      return obj;
    }, []);
}

async function calcRoundRewards() {
  const calcRewardsRes = await app.realm.configure.mutate({ clients: app.clients });
  if (calcRewardsRes?.data) {
    sharedConfig.rewardWinnerAmount = calcRewardsRes.data.rewardWinnerAmount;
    app.config.rewardWinnerAmount = calcRewardsRes.data.rewardWinnerAmount;
    sharedConfig.rewardItemAmount = calcRewardsRes.data.rewardItemAmount;
    app.config.rewardItemAmount = calcRewardsRes.data.rewardItemAmount;
    if (app.config.rewardWinnerAmount === 0 && calcRewardsRes.data.rewardWinnerAmount !== 0) {
      const roundTimer = app.round.startedAt + app.config.roundLoopSeconds - Math.round(getTime() / 1000);
      emitAll('onSetRoundInfo', roundTimer + ':' + getRoundInfo().join(':') + ':' + getGameModeGuide().join(':'));
    }
  }
}

async function resetLeaderboard(preset: any = null) {
  try {
    log('resetLeaderboard', preset);
    if (app.config.gameMode === 'Pandamonium') {
      app.roundLoopTimeout = setTimeout(resetLeaderboard, app.config.roundLoopSeconds * 1000);
      return;
    }
    updateObservers();
    if (app.observers.length === 0) {
      emitAll('onBroadcast', `Realm not connected. Contact support.`, 0);
      app.roundLoopTimeout = setTimeout(resetLeaderboard, app.config.roundLoopSeconds * 1000);
      return;
    }
    app.round.endedAt = Math.round(getTime() / 1000);
    const fiveSecondsAgo = getTime() - 7000;
    const thirtySecondsAgo = getTime() - 30 * 1000;
    const winners = app.round.players
      .filter((p) => p.lastUpdate >= fiveSecondsAgo)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
    if (winners.length) {
      app.lastLeaderName = winners[0].name;
      log('Leader: ', winners[0]);
      if (winners[0]?.address) {
        emitAll('onRoundWinner', winners[0].name);
      }
      if (app.config.isBattleRoyale) {
        emitAll(
          'onBroadcast',
          `Top 5 - ${winners
            .slice(0, 5)
            .map((l) => l.name)
            .join(', ')}`,
          0
        );
      }
    }
    const saveRoundReq = app.realm.saveRound.mutate({
      startedAt: app.round.startedAt,
      endedAt: app.round.endedAt,
      players: app.round.players,
      winners,
    });
    saveRoundReq.then(function (saveRoundRes) {
      if (saveRoundRes?.status !== 1) {
        sharedConfig.rewardWinnerAmount = 0;
        app.config.rewardWinnerAmount = 0;
        sharedConfig.rewardItemAmount = 0;
        app.config.rewardItemAmount = 0;
        setTimeout(() => {
          emitAll('onBroadcast', `Maintanence`, 3);
        }, 30 * 1000);
      }
    });
    if (app.config.calcRoundRewards) {
      await calcRoundRewards();
    }
    if (preset) {
      app.roundConfig = { ...baseConfig, ...sharedConfig, ...preset };
      app.config = JSON.parse(JSON.stringify(app.roundConfig));
    } else {
      randomRoundPreset();
    }
    baseConfig.roundId = baseConfig.roundId + 1;
    app.config.roundId = baseConfig.roundId;
    app.round = null as any;
    app.round = { startedAt: Math.round(getTime() / 1000), endedAt: null, players: [], events: [], states: [] };
    for (const client of app.clients) {
      if (!app.ranks[client.address]) app.ranks[client.address] = {};
      if (!app.ranks[client.address].kills) app.ranks[client.address].kills = 0;
      app.ranks[client.address].kills += client.kills;
      client.joinedRoundAt = getTime();
      client.points = 0;
      client.kills = 0;
      client.killStreak = 0;
      client.deaths = 0;
      client.evolves = 0;
      client.rewards = 0;
      client.orbs = 0;
      client.powerups = 0;
      client.baseSpeed = 1;
      client.decayPower = 1;
      client.pickups = [];
      client.xp = 50;
      client.maxHp = 100;
      client.avatar = app.config.startAvatar;
      client.speed = getClientSpeed(client, app.config);
      client.cameraSize = client.overrideCameraSize || app.config.cameraSize;
      client.log = {
        kills: [],
        deaths: [],
        revenge: 0,
        resetPosition: 0,
        phases: 0,
        stuck: 0,
        collided: 0,
        timeoutDisconnect: 0,
        speedProblem: 0,
        clientDistanceProblem: 0,
        outOfBounds: 0,
        ranOutOfHealth: 0,
        notReallyTrying: 0,
        tooManyKills: 0,
        killingThemselves: 0,
        sameNetworkDisconnect: 0,
        connectedTooSoon: 0,
        clientDisconnected: 0,
        positionJump: 0,
        pauses: 0,
        connects: 0,
        path: '',
        positions: 0,
        spectating: 0,
        recentJoinProblem: 0,
        usernameProblem: 0,
        maintenanceJoin: 0,
        signatureProblem: 0,
        signinProblem: 0,
        versionProblem: 0,
        failedRealmCheck: 0,
        replay: [],
      };
      client.gameMode = app.config.gameMode;
      if (app.config.gameMode === 'Pandamonium' && app.pandas.includes(client.address)) {
        client.avatar = 2;
        emitAll('onUpdateEvolution', client.id, client.avatar, client.speed);
      } else {
        emitAll('onUpdateRegression', client.id, client.avatar, client.speed);
      }
      if (client.isDead || client.isSpectating) continue;
      client.startedRoundAt = Math.round(getTime() / 1000);
      app.round.players.push(client);
    }
    for (let i = 0; i < app.orbs.length; i++) {
      emitAll('onUpdatePickup', 'null', app.orbs[i].id, 0);
    }
    app.orbs.splice(0, app.orbs.length);
    randomizeSpriteXp();
    syncSprites();
    const roundTimer = app.round.startedAt + app.config.roundLoopSeconds - Math.round(getTime() / 1000);
    emitAll('onSetRoundInfo', roundTimer + ':' + getRoundInfo().join(':') + ':' + getGameModeGuide().join(':'));
    log(
      'roundInfo',
      roundTimer + ':' + getRoundInfo().join(':') + ':' + getGameModeGuide().join(':'),
      (app.config.roundLoopSeconds + ':' + getRoundInfo().join(':') + ':' + getGameModeGuide().join(':')).split(':')
        .length
    );
    emitAll('onClearLeaderboard');
    emitAll('onBroadcast', `Game Mode - ${app.config.gameMode} (Round ${app.config.roundId})`, 0);
    if (app.config.hideMap) {
      emitAll('onHideMinimap');
      emitAll('onBroadcast', `Minimap hidden in this mode!`, 2);
    } else {
      emitAll('onShowMinimap');
    }
    if (app.config.periodicReboots && app.rebootAfterRound) {
      emitAll('onMaintenance', true);
      await sleep(3 * 1000);
      process.exit();
    }
    if (app.config.periodicReboots && app.announceReboot) {
      const value = 'Restarting server at end of this round.';
      emitAll('onBroadcast', value, 1);
      app.rebootAfterRound = true;
    }
  } catch (e) {
    log('Error:', e);
  }
  app.roundLoopTimeout = setTimeout(resetLeaderboard, app.config.roundLoopSeconds * 1000);
}

function checkConnectionLoop() {
  if (!app.config.noBoot && !app.config.isRoundPaused) {
    const oneMinuteAgo = getTime() - app.config.disconnectClientSeconds * 1000;
    for (const client of app.clients) {
      if (client.isSpectating) continue;
      if (client.isGod) continue;
      if (client.isMod) continue;
      if (client.isRealm) continue;
      if (client.lastReportedTime <= oneMinuteAgo) {
        client.log.timeoutDisconnect += 1;
        disconnectClient(client, 'timed out');
      }
    }
  }
  setTimeout(() => checkConnectionLoop(), app.config.checkConnectionLoopSeconds * 1000);
}

function getPayload(messages: string[]): Buffer {
  return Buffer.from(['[', messages.join(','), ']'].join(''));
}

function slowGameloop() {
  if (app.config.dynamicDecayPower) {
    const players = app.clients.filter((p) => !p.isDead && !p.isSpectating);
    const maxEvolvedPlayers = players.filter((p) => p.avatar === app.config.maxEvolves - 1);
    app.config.avatarDecayPower0 =
      app.roundConfig.avatarDecayPower0 + maxEvolvedPlayers.length * app.config.decayPowerPerMaxEvolvedPlayers * 0.33;
    app.config.avatarDecayPower1 =
      app.roundConfig.avatarDecayPower1 + maxEvolvedPlayers.length * app.config.decayPowerPerMaxEvolvedPlayers * 0.66;
    app.config.avatarDecayPower2 =
      app.roundConfig.avatarDecayPower1 + maxEvolvedPlayers.length * app.config.decayPowerPerMaxEvolvedPlayers * 1;
  }
  setTimeout(slowGameloop, app.config.slowLoopSeconds * 1000);
}

function resetPlayer(player: Client) {
  const spawnPoint = app.playerSpawnPoints[Math.floor(Math.random() * app.playerSpawnPoints.length)];
  player.position = spawnPoint;
  player.target = spawnPoint;
  player.clientPosition = spawnPoint;
  player.clientTarget = spawnPoint;
  player.avatar = 0;
  player.xp = 50;
}

async function detectCollisions() {
  try {
    const now = getTime();
    const currentTime = Math.round(now / 1000);
    const deltaTime = (now - app.lastFastestGameloopTime) / 1000;
    const distanceMap = {
      0: app.config.avatarTouchDistance0,
      1: app.config.avatarTouchDistance0,
      2: app.config.avatarTouchDistance0,
    };
    for (let i = 0; i < app.clients.length; i++) {
      const player = app.clients[i];
      if (player.isDead) continue;
      if (player.isSpectating) continue;
      if (player.isJoining) continue;
      if (!Number.isFinite(player.position.x) || !Number.isFinite(player.speed)) {
        player.log.speedProblem += 1;
        disconnectClient(player, 'speed problem');
        continue;
      }
      if (distanceBetweenPoints(player.position, player.clientPosition) > 2) {
        player.phasedUntil = getTime() + 2000;
        player.log.phases += 1;
        player.log.clientDistanceProblem += 1;
      }
      let position = moveVectorTowards(
        player.position,
        player.clientTarget,
        (player.overrideSpeed || player.speed) * deltaTime
      );
      let outOfBounds = false;
      if (position.x > app.mapBoundary.x.max) {
        position.x = app.mapBoundary.x.max;
        outOfBounds = true;
      }
      if (position.x < app.mapBoundary.x.min) {
        position.x = app.mapBoundary.x.min;
        outOfBounds = true;
      }
      if (position.y > app.mapBoundary.y.max) {
        position.y = app.mapBoundary.y.max;
        outOfBounds = true;
      }
      if (position.y < app.mapBoundary.y.min) {
        position.y = app.mapBoundary.y.min;
        outOfBounds = true;
      }
      if (outOfBounds) {
        player.log.outOfBounds += 1;
      }
      let collided = false;
      let stuck = false;
      for (const i in mapData) {
        const gameObject = mapData[i];
        if (!gameObject.Colliders || !gameObject.Colliders.length) continue;
        for (const gameCollider of gameObject.Colliders) {
          let collider;
          if (gameObject.Name.indexOf('Island') === 0) {
            collider = {
              minX: gameCollider.Min[0],
              maxX: gameCollider.Max[0],
              minY: gameCollider.Min[1],
              maxY: gameCollider.Max[1],
            };
          } else {
            collider = {
              minX: gameCollider.Min[0],
              maxX: gameCollider.Max[0],
              minY: gameCollider.Min[1],
              maxY: gameCollider.Max[1],
            };
          }
          if (app.config.level2open && gameObject.Name === 'Level2Divider') {
            const diff = 25;
            collider.minY -= diff;
            collider.maxY -= diff;
          }
          if (
            position.x >= collider.minX &&
            position.x <= collider.maxX &&
            position.y >= collider.minY &&
            position.y <= collider.maxY
          ) {
            if (gameObject.Name.indexOf('Land') === 0) {
              stuck = true;
            } else if (gameObject.Name.indexOf('Island') === 0) {
              if (app.config.stickyIslands) {
                stuck = true;
              } else {
                collided = true;
              }
            } else if (gameObject.Name.indexOf('Collider') === 0) {
              stuck = true;
            } else if (gameObject.Name.indexOf('Level2Divider') === 0) {
              stuck = true;
            }
          }
        }
        if (stuck) break;
        if (collided) break;
      }
      if (player.isGod) {
        stuck = false;
        collided = false;
      }
      player.isStuck = false;
      const isPlayerInvincible = player.isInvincible ? true : player.invincibleUntil > currentTime;
      if (collided && !isPlayerInvincible) {
        player.position = position;
        player.target = player.clientTarget;
        player.phasedUntil = getTime() + 5000;
        if (!player.phasedPosition) player.phasedPosition = position;
        player.log.phases += 1;
        player.log.collided += 1;
        player.overrideSpeed = 0.02;
        player.overrideSpeedUntil = getTime() + 1000;
      } else if (stuck && !isPlayerInvincible) {
        player.position = position;
        player.target = player.clientTarget;
        player.phasedUntil = getTime() + 5000;
        player.log.phases += 1;
        player.log.stuck += 1;
        player.overrideSpeed = 0.02;
        player.overrideSpeedUntil = getTime() + 1000;
        if (app.config.stickyIslands) {
          player.isStuck = true;
        }
      } else {
        player.position = position;
        player.target = player.clientTarget;
      }
      const pos = Math.round(player.position.x) + ':' + Math.round(player.position.y);
      if (player.log.path.indexOf(pos) === -1) {
        player.log.positions += 1;
      }
    }
    if (app.config.level2allowed) {
      if (
        app.config.level2forced ||
        app.clients.filter((c) => !c.isSpectating && !c.isDead).length >= app.config.playersRequiredForLevel2
      ) {
        if (!app.config.level2open) {
          baseConfig.level2open = true;
          app.config.level2open = true;
          emitAll('onBroadcast', `Wall going down...`, 0);
          await sleep(2 * 1000);
          sharedConfig.spritesStartCount = 200;
          app.config.spritesStartCount = 200;
          clearSprites();
          spawnSprites(app.config.spritesStartCount);
          emitAll('onOpenLevel2');
        }
      }
      if (
        !app.config.level2forced &&
        app.clients.filter((c) => !c.isSpectating && !c.isDead).length < app.config.playersRequiredForLevel2 - 7
      ) {
        if (app.config.level2open) {
          baseConfig.level2open = false;
          app.config.level2open = false;
          emitAll('onBroadcast', `Wall going up...`, 0);
          sharedConfig.spritesStartCount = 50;
          app.config.spritesStartCount = 50;
          clearSprites();
          spawnSprites(app.config.spritesStartCount);
          await sleep(2 * 1000);
          for (const player of app.round.players) {
            resetPlayer(player);
          }
          emitAll('onCloseLevel2');
        }
      }
    }
    if (!app.config.isRoundPaused) {
      for (let i = 0; i < app.clients.length; i++) {
        const player1 = app.clients[i];
        const isPlayer1Invincible = player1.isInvincible ? true : player1.invincibleUntil > currentTime;
        if (player1.isSpectating) continue;
        if (player1.isDead) continue;
        if (isPlayer1Invincible) continue;
        for (let j = 0; j < app.clients.length; j++) {
          const player2 = app.clients[j];
          const isPlayer2Invincible = player2.isInvincible ? true : player2.invincibleUntil > currentTime;
          if (player1.id === player2.id) continue;
          if (player2.isDead) continue;
          if (player2.isSpectating) continue;
          if (isPlayer2Invincible) continue;
          const distance = distanceMap[player1.avatar!] + distanceMap[player2.avatar!];
          const position1 = player1.isPhased ? player1.phasedPosition : player1.position;
          const position2 = player2.isPhased ? player2.phasedPosition : player2.position;
          if (distanceBetweenPoints(position1, position2) > distance) continue;
          registerKill(player1, player2);
        }
      }
      for (let i = 0; i < app.clients.length; i++) {
        const player = app.clients[i];
        if (player.isDead) continue;
        if (player.isSpectating) continue;
        if (player.isPhased || now < player.phasedUntil) continue;
        const touchDistance = app.config.pickupDistance + app.config['avatarTouchDistance' + player.avatar!];
        for (const powerup of app.powerups) {
          if (distanceBetweenPoints(player.position, powerup.position) > touchDistance) continue;
          if (app.config.gameMode === 'Hayai') {
            player.baseSpeed -= 0.001;
            if (player.baseSpeed <= 0.5) {
              player.baseSpeed = 0.5;
            }
          }
          let value = 0;
          if (powerup.type == 0) {
            value = app.config.powerupXp0;
            if (app.config.gameMode === 'Sprite Juice') {
              player.invincibleUntil = Math.round(getTime() / 1000) + 2;
            }
            if (app.config.gameMode === 'Marco Polo') {
              player.cameraSize += 0.05;
            }
          }
          if (powerup.type == 1) {
            value = app.config.powerupXp1;
            if (app.config.gameMode === 'Sprite Juice') {
              player.baseSpeed += 0.05 * 2;
              player.decayPower -= 0.1 * 2;
            }
            if (app.config.gameMode === 'Marco Polo') {
              player.cameraSize += 0.01;
            }
          }
          if (powerup.type == 2) {
            value = app.config.powerupXp2;
            if (app.config.gameMode === 'Sprite Juice') {
              player.baseSpeed -= 0.05 * 2;
            }
            if (app.config.gameMode === 'Marco Polo') {
              player.cameraSize -= 0.01;
            }
          }
          if (powerup.type == 3) {
            value = app.config.powerupXp3;
            if (app.config.gameMode === 'Sprite Juice') {
              player.decayPower += 0.1 * 2;
            }
            if (app.config.gameMode === 'Marco Polo') {
              player.cameraSize -= 0.05;
            }
          }
          if (app.config.gameMode === 'Sprite Juice') {
            if (player.baseSpeed < 0.25) {
              player.baseSpeed = 0.25;
            }
            if (player.baseSpeed > 2) {
              player.baseSpeed = 2;
            }
            if (player.decayPower < 0.5) {
              player.decayPower = 0.5;
            }
            if (player.decayPower > 2) {
              player.decayPower = 8;
            }
          }
          if (app.config.gameMode === 'Marco Polo') {
            if (player.cameraSize < 1.5) {
              player.cameraSize = 1.5;
            }
            if (player.cameraSize > 6) {
              player.cameraSize = 6;
            }
          }
          player.powerups += 1;
          player.points += app.config.pointsPerPowerup;
          player.xp += value * app.config.spriteXpMultiplier;
          if (isMechanicEnabled(player, 1117) && player.character.meta[1117] > 0) {
            player.xp +=
              (value * app.config.spriteXpMultiplier * (player.character.meta[1117] - player.character.meta[1118])) /
              100;
            emitAll('onBroadcast', `${player.name} xp bonus`, 0);
          }
          emitAll('onUpdatePickup', player.id, powerup.id, value);
          removeSprite(powerup.id);
          spawnSprites(1);
        }
        const isNew = player.joinedAt >= currentTime - app.config.immunitySeconds || player.isInvincible;
        if (!isNew) {
          for (const orb of app.orbs) {
            if (!orb) continue;
            if (now < orb.enabledAt) continue;
            if (distanceBetweenPoints(player.position, orb.position) > touchDistance) continue;
            player.orbs += 1;
            player.points += orb.points;
            player.points += app.config.pointsPerOrb;
            emitAll('onUpdatePickup', player.id, orb.id, 0);
            removeOrb(orb.id);
            emitAll('onBroadcast', `${player.name} stole an orb (${orb.points})`, 0);
          }
          const rewards = [app.currentReward];
          for (const reward of rewards) {
            if (!reward) continue;
            if (now < reward.enabledAt) continue;
            if (distanceBetweenPoints(player.position, reward.position) > touchDistance) continue;
            claimReward(player, reward);
            removeReward();
          }
        }
      }
    }
    app.lastFastestGameloopTime = now;
  } catch (e) {
    log('Error 342', e);
  }
}

function normalizeFloat(f: number, num = 2): number {
  return parseFloat(f.toFixed(num));
}

function fastGameloop() {
  try {
    const now = getTime();
    detectCollisions();
    for (let i = 0; i < app.clients.length; i++) {
      const client = app.clients[i];
      if (client.isDisconnected) continue;
      if (client.isDead) continue;
      if (client.isSpectating) continue;
      if (client.isJoining) continue;
      const currentTime = Math.round(now / 1000);
      const isInvincible =
        app.config.isGodParty ||
        client.isSpectating ||
        client.isGod ||
        client.isInvincible ||
        client.invincibleUntil > currentTime;
      const isPhased = client.isPhased ? true : now <= client.phasedUntil;
      if (client.isPhased && now > client.phasedUntil) {
        client.isPhased = false;
        client.phasedUntil = 0;
      }
      if (client.overrideSpeed && client.overrideSpeedUntil && now > client.overrideSpeedUntil) {
        const oldSpeed = client.overrideSpeed;
        client.overrideSpeed = null;
        client.overrideSpeedUntil = 0;
      }
      client.speed = getClientSpeed(client, app.config);
      if (!app.config.isRoundPaused && app.config.gameMode !== 'Pandamonium') {
        let decay = app.config.noDecay
          ? 0
          : ((client.avatar! + 1) / (1 / app.config.fastLoopSeconds)) *
            ((app.config['avatarDecayPower' + client.avatar!] || 1) * app.config.decayPower);
        if (isMechanicEnabled(client, 1105) && isMechanicEnabled(client, 1104)) {
          decay = decay * (1 + (client.character.meta[1105] - client.character.meta[1104]) / 100);
        }
        if (client.xp > client.maxHp) {
          if (decay > 0) {
            if (client.avatar! < app.config.maxEvolves - 1) {
              client.xp = client.xp - client.maxHp;
              client.avatar = Math.max(
                Math.min(client.avatar! + 1 * app.config.avatarDirection, app.config.maxEvolves - 1),
                0
              );
              client.evolves += 1;
              client.points += app.config.pointsPerEvolve;
              if (app.config.leadercap && client.name === app.lastLeaderName) {
                client.speed = client.speed * 0.8;
              }
              if (isMechanicEnabled(client, 1223) && client.character.meta[1223] > 0) {
                client.overrideSpeedUntil = getTime() + 1000;
                client.overrideSpeed = client.speed * (1 + client.character.meta[1223] / 100);
                if (isMechanicEnabled(client, 1030) && client.character.meta[1030] > 0) {
                  client.overrideSpeed = client.overrideSpeed * (1 + client.character.meta[1030] / 100);
                }
              }
              emitAll('onUpdateEvolution', client.id, client.avatar, client.overrideSpeed || client.speed);
            } else {
              client.xp = client.maxHp;
            }
          } else {
            if (client.avatar! >= app.config.maxEvolves - 1) {
              client.xp = client.maxHp;
            } else {
              client.xp = client.xp - client.maxHp;
              client.avatar = Math.max(
                Math.min(client.avatar! + 1 * app.config.avatarDirection, app.config.maxEvolves - 1),
                0
              );
              client.evolves += 1;
              client.points += app.config.pointsPerEvolve;
              if (app.config.leadercap && client.name === app.lastLeaderName) {
                client.speed = client.speed * 0.8;
              }
              if (isMechanicEnabled(client, 1223) && client.character.meta[1223] > 0) {
                client.overrideSpeedUntil = getTime() + 1000;
                client.overrideSpeed = client.speed * (1 + client.character.meta[1223] / 100);
                if (isMechanicEnabled(client, 1030) && client.character.meta[1030] > 0) {
                  client.overrideSpeed = client.overrideSpeed * (1 + client.character.meta[1030] / 100);
                }
              }
              emitAll('onUpdateEvolution', client.id, client.avatar, client.overrideSpeed || client.speed);
            }
          }
        } else {
          if (!isInvincible) {
            client.xp -= decay * client.decayPower;
          }
          if (client.xp <= 0) {
            client.xp = 0;
            if (decay > 0) {
              if (client.avatar === 0) {
                const isNew = client.joinedAt >= currentTime - app.config.immunitySeconds;
                if (!app.config.noBoot && !isInvincible && !isNew && !app.config.isGodParty) {
                  client.log.ranOutOfHealth += 1;
                  if (client.lastTouchTime > now - 2000) {
                    registerKill(app.clientLookup[client.lastTouchPlayerId], client);
                  } else {
                    disconnectClient(client, 'starved');
                  }
                } else {
                  client.xp = client.maxHp;
                  client.avatar = Math.max(
                    Math.min(client.avatar! - 1 * app.config.avatarDirection, app.config.maxEvolves - 1),
                    0
                  );
                  if (app.config.leadercap && client.name === app.lastLeaderName) {
                    client.speed = client.speed * 0.8;
                  }
                  emitAll('onUpdateRegression', client.id, client.avatar, client.overrideSpeed || client.speed);
                }
              } else {
                client.xp = client.maxHp;
                client.avatar = Math.max(
                  Math.min(client.avatar! - 1 * app.config.avatarDirection, app.config.maxEvolves - 1),
                  0
                );
                if (app.config.leadercap && client.name === app.lastLeaderName) {
                  client.speed = client.speed * 0.8;
                }
                emitAll('onUpdateRegression', client.id, client.avatar, client.overrideSpeed || client.speed);
              }
            } else {
              if (client.avatar === 0) {
                client.xp = 0;
              } else {
                client.xp = client.maxHp;
                client.avatar = Math.max(
                  Math.min(client.avatar! - 1 * app.config.avatarDirection, app.config.maxEvolves - 1),
                  0
                );
                if (app.config.leadercap && client.name === app.lastLeaderName) {
                  client.speed = client.speed * 0.8;
                }
                emitAll('onUpdateRegression', client.id, client.avatar, client.overrideSpeed || client.speed);
              }
            }
          }
        }
      }
      client.latency = (now - client.lastReportedTime) / 2;
      if (Number.isNaN(client.latency)) {
        client.latency = 0;
      }
      if (app.config.gameMode === 'Pandamonium' && app.pandas.includes(client.address)) {
        client.avatar = 2;
      }
      emitAll(
        'OnUpdatePlayer',
        client.id,
        client.overrideSpeed || client.speed,
        client.overrideCameraSize || client.cameraSize,
        client.position.x,
        client.position.y,
        client.position.x,
        client.position.y,
        Math.floor(client.xp),
        now,
        Math.round(client.latency),
        isInvincible ? '1' : '0',
        client.isStuck ? '1' : '0',
        isPhased && !isInvincible ? '1' : '0'
      );
    }
    flushEventQueue();
    if (app.config.gameMode === 'Hayai') {
      const timeStep = 5 * 60 * (app.config.fastLoopSeconds * 1000);
      const speedMultiplier = 0.25;
      app.config.baseSpeed += normalizeFloat((5 * speedMultiplier) / timeStep);
      app.config.checkPositionDistance += normalizeFloat((6 * speedMultiplier) / timeStep);
      app.config.checkInterval += normalizeFloat((3 * speedMultiplier) / timeStep);
    }
    let totalAlivePlayers: Client[] = [];
    for (let i = 0; i < app.clients.length; i++) {
      if (!app.clients[i].isGod && !app.clients[i].isSpectating && !app.clients[i].isDead) {
        totalAlivePlayers.push(app.clients[i]);
      }
    }
    if (app.config.isBattleRoyale && totalAlivePlayers.length === 1) {
      emitAll('onBroadcast', `${totalAlivePlayers[0].name} is the last dragon standing`, 3);
      baseConfig.isBattleRoyale = false;
      app.config.isBattleRoyale = false;
      baseConfig.isGodParty = true;
      app.config.isGodParty = true;
    }
    app.lastFastGameloopTime = now;
  } catch (e) {
    log('Error:', e);
    disconnectAllPlayers();
    setTimeout(function () {
      process.exit(1);
    }, 2 * 1000);
    return;
  }
  setTimeout(fastGameloop, app.config.fastLoopSeconds * 1000);
}

function getGameModeGuide(): string[] {
  return (
    app.config.guide || [
      'Game Mode - ' + app.config.gameMode,
      '1. Eat sprites to stay alive',
      '2. Avoid bigger dragons',
      '3. Eat smaller dragons',
    ]
  );
}

let eventFlushedAt = getTime();

function flushEventQueue() {
  const now = getTime();
  if (app.eventQueue.length) {
    if (app.debugQueue) log('Sending queue', app.eventQueue);
    let recordDetailed = now - eventFlushedAt > 500;
    if (recordDetailed) {
      eventFlushedAt = now;
    }
    const compiled = [];
    for (const e of app.eventQueue) {
      const name = e[0];
      const args = e.slice(1);
      compiled.push(`["${name}","${args.join(':')}"]`);
      if (name == 'OnUpdatePlayer' || name == 'OnSpawnPowerup') {
        if (recordDetailed) {
          app.round.events.push({ type: 'emitAll', name, args });
        }
      } else {
        app.round.events.push({ type: 'emitAll', name, args });
      }
      if (app.loggableEvents.includes(name)) {
        console.log(`Publish Event: ${name}`, args);
      }
    }
    emitAllDirect('events', getPayload(compiled));
    app.eventQueue = null as any;
    app.eventQueue = [];
  }
}

function broadcastMechanics(client: Client) {
  if (isMechanicEnabled(client, 1150))
    emit(
      client,
      'onBroadcast',
      `${formatNumber(client.character.meta[1150] - client.character.meta[1160])}% Rewards`,
      0
    );
  if (isMechanicEnabled(client, 1222))
    emit(client, 'onBroadcast', `${formatNumber(client.character.meta[1222])}% Movement Burst On Kill`, 0);
  if (isMechanicEnabled(client, 1223))
    emit(client, 'onBroadcast', `${formatNumber(client.character.meta[1223])}% Movement Burst On Evolve`, 0);
  if (isMechanicEnabled(client, 1030))
    emit(client, 'onBroadcast', `${formatNumber(client.character.meta[1030])}% Movement Burst Strength`, 0);
  if (isMechanicEnabled(client, 1102))
    emit(client, 'onBroadcast', `${formatNumber(client.character.meta[1102])}% Avoid Death Penalty`, 0);
  if (isMechanicEnabled(client, 1164))
    emit(client, 'onBroadcast', `${formatNumber(client.character.meta[1164])}% Double Pickup Chance`, 0);
  if (isMechanicEnabled(client, 1219))
    emit(client, 'onBroadcast', `${formatNumber(client.character.meta[1219])}% Increased Health On Kill`, 0);
  if (isMechanicEnabled(client, 1105))
    emit(
      client,
      'onBroadcast',
      `${formatNumber(client.character.meta[1105] - client.character.meta[1104])}% Energy Decay`,
      0
    );
  if (isMechanicEnabled(client, 1117))
    emit(
      client,
      'onBroadcast',
      `${formatNumber(client.character.meta[1117] - client.character.meta[1118])}% Sprite Fuel`,
      0
    );
}

function clearSprites() {
  app.powerups.splice(0, app.powerups.length);
}

// const customErrorFormatter = t.middleware(async ({ ctx, next }) => {
//   try {
//     return await next();
//   } catch (error) {
//     if (error instanceof TRPCError) {
//       return { status: 0, error: error.message };
//     }
//     return { status: 0, error: 'An unexpected error occurred' };
//   }
// });

const validateMod = t.middleware(async ({ input, ctx, next }) => {
  const isValid = await isValidAdminRequest(input);
  if (!isValid) return { status: 0 };
  return next();
});

export const appRouter = t.router({
  connected: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { socket, client } }) => {
      app.realmServer.socket = socket;
      const sameNetworkObservers = app.observers.filter((r) => r.hash === client.hash);
      for (const observer of sameNetworkObservers) {
        disconnectClient(observer, 'same network observer');
      }
      const observer = { socket };
      app.observers.push(observer);
      client.isRealm = true;
      const res = await app.realm.init.mutate({ status: 1 });
      log('init', res);
      if (res?.status !== 1) {
        log('Error:', 'Could not init');
        return { status: 0 };
      }
      app.baseConfig.id = res.id;
      app.config.id = res.id;
      app.baseConfig.roundId = res.data.roundId;
      app.config.roundId = res.data.roundId;
      return { status: 1 };
    }),
  apiConnected: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      emitAll('onBroadcast', 'API connected', 0);
      return { status: 1 };
    }),
  apiDisconnected: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      emitAll('onBroadcast', 'API disconnected', 0);
      return { status: 1 };
    }),
  setPlayerCharacter: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ data: z.any() }))
    .mutation(async ({ input, ctx: { client } }) => {
      if (!client.isRealm) return { status: 0 };
      const newClient = app.clients.find((c) => c.address === input.data.address);
      if (!newClient) return { status: 0 };
      newClient.character = {
        ...input.data.character,
        meta: { ...newClient.character.meta, ...input.data.character.meta },
      };
      return { status: 1 };
    }),
  setConfig: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ data: z.any() }))
    .mutation(async ({ input, ctx: { client } }) => {
      return { status: 1 };
    }),
  getConfig: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .mutation(async ({ input, ctx: { client } }) => {
      return { status: 1, data: app.config };
    }),
  load: t.procedure.use(customErrorFormatter).mutation(async ({ ctx: { socket, client } }) => {
    log('Load', client.hash);
    emit(client, 'OnLoaded', 1);
    return { status: 1 };
  }),
  spectate: t.procedure.use(customErrorFormatter).mutation(async ({ ctx: { client } }) => {
    log('Spectate', client.address);
    spectate(client);
    return { status: 1 };
  }),
  setInfo: t.procedure
    .use(customErrorFormatter(t))
    .input(z.object({ msg: z.any() }))
    .mutation(async ({ input, ctx: { socket, client } }) => {
      log('SetInfo', input.msg);
      try {
        const pack = decodePayload(input.msg);
        if (!pack.signature || !pack.network || !pack.device || !pack.address) {
          client.log.signinProblem += 1;
          disconnectClient(client, 'signin problem');
          return { status: 0 };
        }
        const address = await normalizeAddress(pack.address);
        log('SetInfo normalizeAddress', pack.address, address);
        if (!address) {
          client.log.addressProblem += 1;
          disconnectClient(client, 'address problem');
          return { status: 0 };
        }
        if (
          !(await isValidSignatureRequest({
            signature: { data: 'evolution', hash: pack.signature.trim(), address },
          }))
        ) {
          client.log.signatureProblem += 1;
          disconnectClient(client, 'signature problem');
          return { status: 0 };
        }
        if (client.isBanned) {
          emit(client, 'OnBanned', true);
          disconnectClient(client, 'banned');
          return { status: 0 };
        }
        if (app.config.isMaintenance && !client.isMod) {
          client.log.maintenanceJoin += 1;
          emit(client, 'onMaintenance', true);
          disconnectClient(client, 'maintenance');
          return { status: 0 };
        }
        let name = app.addressToUsername[address] || (await getUsername(address)) || generateGuestName();
        app.addressToUsername[address] = name;
        if (['Testman', 'join'].includes(name)) {
          client.overrideCameraSize = 12;
        }
        log('User ' + name + ' with address ' + address + ' with hash ' + client.hash);
        const now = getTime();
        if (client.name !== name || client.address !== address) {
          client.name = name;
          client.address = address;
          client.network = pack.network;
          client.device = pack.device;
          const recentPlayer = app.round.players.find((r) => r.address === address);
          if (recentPlayer && now - recentPlayer.lastUpdate < 3000) {
            client.log.recentJoinProblem += 1;
            disconnectClient(client, 'joined too soon', true);
            return { status: 0 };
          }
          Object.assign(client, recentPlayer);
          client.log.connects += 1;
        }
        emitAll('OnSetInfo', client.id, client.name, client.network, client.address, client.device);
        if (app.config.log.connections) {
          log('Connected', { hash: client.hash, address: client.address, name: client.name });
        }
        return { status: 1 };
      } catch (e) {
        log('Error:', e);
        return { status: 0, error: e.message };
      }
    }),
  joinRoom: t.procedure.use(customErrorFormatter).mutation(async ({ ctx: { client } }) => {
    log('JoinRoom', client.id, client.hash);
    try {
      const confirmUser = await app.realm.confirmUser.mutate({ address: client.address });
      if (confirmUser?.status !== 1) {
        client.log.failedRealmCheck += 1;
        disconnectClient(client, 'failed realm check');
        return { status: 0 };
      }
      if (confirmUser.isMod) {
        client.isMod = true;
      }
      const now = getTime();
      const recentPlayer = app.round.players.find((r) => r.address === client.address);
      if (recentPlayer && now - recentPlayer.lastUpdate < 3000) {
        client.log.connectedTooSoon += 1;
        disconnectClient(client, 'connected too soon');
        return { status: 0 };
      }
      if (app.config.isMaintenance && !client.isMod) {
        emit(client, 'onMaintenance', true);
        disconnectClient(client, 'maintenance');
        return { status: 0 };
      }
      client.isJoining = true;
      client.avatar = app.config.startAvatar;
      client.speed = getClientSpeed(client, app.config);
      if (app.config.gameMode === 'Pandamonium' && app.pandas.includes(client.address)) {
        client.avatar = 2;
        emit(client, 'onUpdateEvolution', client.id, client.avatar, client.speed);
      }
      log('[INFO] player ' + client.id + ': logged!');
      log('[INFO] Total players: ' + Object.keys(app.clientLookup).length);
      const roundTimer = app.round.startedAt + app.config.roundLoopSeconds - Math.round(getTime() / 1000);
      emit(
        client,
        'onSetPositionMonitor',
        Math.round(app.config.checkPositionDistance) +
          ':' +
          Math.round(app.config.checkInterval) +
          ':' +
          Math.round(app.config.resetInterval)
      );
      emit(
        client,
        'onJoinGame',
        client.id,
        client.name,
        client.avatar,
        client.isMasterClient ? 'true' : 'false',
        roundTimer,
        client.position.x,
        client.position.y
      );
      if (app.observers.length === 0) {
        emit(client, 'onBroadcast', `Realm not connected. Contact support.`, 0);
        disconnectClient(client, 'realm not connected');
        return { status: 0 };
      }
      if (!app.config.isRoundPaused) {
        emit(
          client,
          'onSetRoundInfo',
          roundTimer + ':' + getRoundInfo().join(':') + ':' + getGameModeGuide().join(':')
        );
        emit(client, 'onBroadcast', `Game Mode - ${app.config.gameMode} (Round ${app.config.roundId})`, 0);
      }
      syncSprites();
      if (app.config.hideMap) {
        emit(client, 'onHideMinimap');
        emit(client, 'onBroadcast', `Minimap hidden in this mode!`, 2);
      }
      if (app.config.level2open) {
        emit(client, 'onOpenLevel2');
        emit(client, 'onBroadcast', `Wall going down!`, 0);
      } else {
        emit(client, 'onCloseLevel2');
      }
      for (const client of app.clients) {
        if (
          client.id === client.id ||
          client.isDisconnected ||
          client.isDead ||
          client.isSpectating ||
          client.isJoining
        )
          continue;
        emit(
          client,
          'onSpawnPlayer',
          client.id,
          client.name,
          client.speed,
          client.avatar,
          client.position.x,
          client.position.y,
          client.position.x,
          client.position.y
        );
      }
      for (let c = 0; c < app.powerups.length; c++) {
        emit(
          client,
          'onSpawnPowerUp',
          app.powerups[c].id,
          app.powerups[c].type,
          app.powerups[c].position.x,
          app.powerups[c].position.y,
          app.powerups[c].scale
        );
      }
      for (let c = 0; c < app.orbs.length; c++) {
        emit(
          client,
          'onSpawnPowerUp',
          app.orbs[c].id,
          app.orbs[c].type,
          app.orbs[c].position.x,
          app.orbs[c].position.y,
          app.orbs[c].scale
        );
      }
      if (app.currentReward) {
        emit(
          client,
          'onSpawnReward',
          app.currentReward.id,
          app.currentReward.rewardItemType,
          app.currentReward.rewardItemName,
          app.currentReward.quantity,
          app.currentReward.position.x,
          app.currentReward.position.y
        );
      }
      client.lastUpdate = getTime();
      return { status: 1 };
    } catch (e) {
      log('Error:', e);
      disconnectClient(client, 'not sure: ' + e);
      return { status: 0 };
    }
  }),
  updateMyself: t.procedure.use(customErrorFormatter).mutation(async ({ input, ctx: { socket, client } }) => {
    if (client.isDead && !client.isJoining) return { status: 0 };
    if (client.isSpectating) return { status: 0 };
    if (app.config.isMaintenance && !client.isMod) {
      emit(client, 'onMaintenance', true);
      disconnectClient(client, 'maintenance');
      return { status: 0 };
    }
    const now = getTime();
    if (now - client.lastUpdate < app.config.forcedLatency) return { status: 0 };
    if (client.name === 'Testman' && now - client.lastUpdate < 200) return { status: 0 };
    if (client.isJoining) {
      client.isDead = false;
      client.isJoining = false;
      client.joinedAt = Math.round(getTime() / 1000);
      client.invincibleUntil = client.joinedAt + app.config.immunitySeconds;
      if (app.config.isBattleRoyale) {
        emit(client, 'onBroadcast', 'Spectate until the round is over', 0);
        spectate(client);
        return { status: 1 };
      }
      addToRecentPlayers(client);
      emitAll(
        'onSpawnPlayer',
        client.id,
        client.name,
        client.overrideSpeed || client.speed,
        client.avatar,
        client.position.x,
        client.position.y,
        client.position.x,
        client.position.y
      );
      if (app.config.isRoundPaused) {
        emit(client, 'onRoundPaused');
        return { status: 0 };
      }
    }
    try {
      const pack = decodePayload(input.msg);
      const positionX = parseFloat(parseFloat(pack.position.split(':')[0].replace(',', '.')).toFixed(3));
      const positionY = parseFloat(parseFloat(pack.position.split(':')[1].replace(',', '.')).toFixed(3));
      const targetX = parseFloat(parseFloat(pack.target.split(':')[0].replace(',', '.')).toFixed(3));
      const targetY = parseFloat(parseFloat(pack.target.split(':')[1].replace(',', '.')).toFixed(3));
      if (
        !Number.isFinite(positionX) ||
        !Number.isFinite(positionY) ||
        !Number.isFinite(targetX) ||
        !Number.isFinite(targetY) ||
        positionX < app.mapBoundary.x.min ||
        positionX > app.mapBoundary.x.max ||
        positionY < app.mapBoundary.y.min ||
        positionY > app.mapBoundary.y.max
      )
        return { status: 0 };
      if (
        app.config.anticheat.disconnectPositionJumps &&
        distanceBetweenPoints(client.position, { x: positionX, y: positionY }) > 5
      ) {
        client.log.positionJump += 1;
        disconnectClient(client, 'position jumped');
        return { status: 0 };
      }
      client.clientPosition = { x: normalizeFloat(positionX, 4), y: normalizeFloat(positionY, 4) };
      client.clientTarget = { x: normalizeFloat(targetX, 4), y: normalizeFloat(targetY, 4) };
      client.lastReportedTime = client.name === 'Testman' ? parseFloat(pack.time) - 300 : parseFloat(pack.time);
      client.lastUpdate = now;
      return { status: 1 };
    } catch (e) {
      log('Error:', e);
      return { status: 0, error: e.message };
    }
  }),
  restart: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      emitAll('onBroadcast', `Server is rebooting in 10 seconds`, 3);
      await sleep(10 * 1000);
      process.exit(1);
      return { status: 1 };
    }),
  maintenance: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.sharedConfig.isMaintenance = true;
      app.config.isMaintenance = true;
      emitAll('onMaintenance', app.config.isMaintenance);
      return { status: 1 };
    }),
  unmaintenance: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.sharedConfig.isMaintenance = false;
      app.config.isMaintenance = false;
      emitAll('onUnmaintenance', app.config.isMaintenance);
      return { status: 1 };
    }),
  startBattleRoyale: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      emitAll('onBroadcast', `Battle Royale in 3...`, 1);
      await sleep(1 * 1000);
      emitAll('onBroadcast', `Battle Royale in 2...`, 1);
      await sleep(1 * 1000);
      emitAll('onBroadcast', `Battle Royale in 1...`, 1);
      await sleep(1 * 1000);
      app.baseConfig.isBattleRoyale = true;
      app.config.isBattleRoyale = true;
      app.baseConfig.isGodParty = false;
      app.config.isGodParty = false;
      emitAll('onBroadcast', `Battle Royale Started`, 3);
      emitAll('onBroadcast', `God Party Stopped`, 3);
      return { status: 1 };
    }),
  stopBattleRoyale: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.isBattleRoyale = false;
      app.config.isBattleRoyale = false;
      emitAll('onBroadcast', `Battle Royale Stopped`, 0);
      return { status: 1 };
    }),
  pauseRound: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      clearTimeout(app.roundLoopTimeout);
      app.baseConfig.isRoundPaused = true;
      app.config.isRoundPaused = true;
      emitAll('onRoundPaused');
      emitAll('onBroadcast', `Round Paused`, 0);
      return { status: 1 };
    }),
  startRound: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string(), data: z.any() }))
    .mutation(async ({ input, ctx: { client } }) => {
      clearTimeout(app.roundLoopTimeout);
      if (app.config.isRoundPaused) {
        app.baseConfig.isRoundPaused = false;
        app.config.isRoundPaused = false;
      }
      resetLeaderboard(presets.find((p) => p.gameMode === input.data.gameMode));
      return { status: 1 };
    }),
  enableForceLevel2: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.level2forced = true;
      app.config.level2forced = true;
      return { status: 1 };
    }),
  disableForceLevel2: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.level2forced = false;
      app.config.level2forced = false;
      return { status: 1 };
    }),
  startGodParty: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.isGodParty = true;
      app.config.isGodParty = true;
      emitAll('onBroadcast', `God Party Started`, 0);
      return { status: 1 };
    }),
  stopGodParty: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.isGodParty = false;
      app.config.isGodParty = false;
      for (let i = 0; i < app.clients.length; i++) {
        const player = app.clients[i];
        player.isInvincible = false;
      }
      emitAll('onBroadcast', `God Party Stopped`, 2);
      return { status: 1 };
    }),
  startRuneRoyale: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.isRuneRoyale = true;
      app.config.isRuneRoyale = true;
      emitAll('onBroadcast', `Rune Royale Started`, 0);
      return { status: 1 };
    }),
  pauseRuneRoyale: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      emitAll('onBroadcast', `Rune Royale Paused`, 2);
      return { status: 1 };
    }),
  unpauseRuneRoyale: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      emitAll('onBroadcast', `Rune Royale Unpaused`, 2);
      return { status: 1 };
    }),
  stopRuneRoyale: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.isRuneRoyale = false;
      app.config.isRuneRoyale = false;
      emitAll('onBroadcast', `Rune Royale Stopped`, 2);
      return { status: 1 };
    }),
  makeBattleHarder: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.dynamicDecayPower = false;
      app.config.dynamicDecayPower = false;
      app.sharedConfig.decayPower += 2;
      app.config.decayPower += 2;
      app.sharedConfig.baseSpeed += 1;
      app.config.baseSpeed += 1;
      app.sharedConfig.checkPositionDistance += 1;
      app.config.checkPositionDistance += 1;
      app.sharedConfig.checkInterval += 1;
      app.config.checkInterval += 1;
      app.sharedConfig.spritesStartCount -= 10;
      app.config.spritesStartCount -= 10;
      emitAll(
        'onSetPositionMonitor',
        app.config.checkPositionDistance + ':' + app.config.checkInterval + ':' + app.config.resetInterval
      );
      emitAll('onBroadcast', `Difficulty Increased!`, 2);
      return { status: 1 };
    }),
  makeBattleEasier: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.dynamicDecayPower = false;
      app.config.dynamicDecayPower = false;
      app.sharedConfig.decayPower -= 2;
      app.config.decayPower -= 2;
      app.sharedConfig.baseSpeed -= 1;
      app.config.baseSpeed -= 1;
      app.sharedConfig.checkPositionDistance -= 1;
      app.config.checkPositionDistance -= 1;
      app.sharedConfig.checkInterval -= 1;
      app.config.checkInterval -= 1;
      app.sharedConfig.spritesStartCount += 10;
      app.config.spritesStartCount += 10;
      emitAll(
        'onSetPositionMonitor',
        app.config.checkPositionDistance + ':' + app.config.checkInterval + ':' + app.config.resetInterval
      );
      emitAll('onBroadcast', `Difficulty Decreased!`, 0);
      return { status: 1 };
    }),
  resetBattleDifficulty: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      app.baseConfig.dynamicDecayPower = true;
      app.config.dynamicDecayPower = true;
      app.sharedConfig.decayPower = 1.4;
      app.config.decayPower = 1.4;
      app.sharedConfig.baseSpeed = 3;
      app.config.baseSpeed = 3;
      app.sharedConfig.checkPositionDistance = 2;
      app.config.checkPositionDistance = 2;
      app.sharedConfig.checkInterval = 1;
      app.config.checkInterval = 1;
      emitAll(
        'onSetPositionMonitor',
        app.config.checkPositionDistance + ':' + app.config.checkInterval + ':' + app.config.resetInterval
      );
      emitAll('onBroadcast', `Difficulty Reset!`, 0);
      return { status: 1 };
    }),
  messageUser: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ data: z.any(), signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      const targetClient = app.clients.find((c) => c.address === input.data.target);
      if (!targetClient) return { status: 0 };
      app.sockets[targetClient.id].emitAll('onBroadcast', input.data.message.replace(/:/gi, ''), 0);
      return { status: 1 };
    }),
  changeUser: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ data: z.any(), signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      const newClient = app.clients.find((c) => c.address === input.data.target);
      if (!newClient) return { status: 0 };
      for (const key of Object.keys(input.data.app.config)) {
        const value = input.data.app.config[key];
        const val = value === 'true' ? true : value === 'false' ? false : isNumeric(value) ? parseFloat(value) : value;
        if (client.hasOwnProperty(key)) (newClient as any)[key] = val;
        else throw new Error("User doesn't have that option");
      }
      return { status: 1 };
    }),
  broadcast: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ data: z.any(), signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      emitAll('onBroadcast', input.data.message.replace(/:/gi, ''), 0);
      return { status: 1 };
    }),
  kickClient: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .input(z.object({ data: z.any(), signature: z.string() }))
    .mutation(async ({ input, ctx: { client } }) => {
      const targetClient = app.clients.find((c) => c.address === input.data.target);
      if (!targetClient) return { status: 0 };
      disconnectClient(targetClient, 'kicked');
      return { status: 1 };
    }),
  info: t.procedure
    .use(validateMod)
    .use(customErrorFormatter(t))
    .mutation(async ({ input, ctx: { client } }) => {
      return {
        status: 1,
        data: {
          id: app.config.id,
          version: app.serverVersion,
          port: app.state.spawnPort,
          round: { id: app.config.roundId, startedAt: app.round.startedAt },
          clientCount: app.clients.length,
          playerCount: app.clients.filter((c) => !c.isDead && !c.isSpectating).length,
          spectatorCount: app.clients.filter((c) => c.isSpectating).length,
          recentPlayersCount: app.round.players.length,
          spritesCount: app.config.spritesTotal,
          connectedPlayers: app.clients.filter((c) => !!c.address).map((c) => c.address),
          rewardItemAmount: app.config.rewardItemAmount,
          rewardWinnerAmount: app.config.rewardWinnerAmount,
          gameMode: app.config.gameMode,
          orbs: app.orbs,
          currentReward: app.currentReward,
        },
      };
    }),
});

async function initEventHandler() {
  log('Starting event handler');
  app.io.on('connection', function (socket) {
    try {
      log('Connection', socket.id);

      const spawnPoint = app.playerSpawnPoints[Math.floor(Math.random() * app.playerSpawnPoints.length)];
      const client: Client = {
        name: 'Unknown' + Math.floor(Math.random() * 999),
        id: socket.id,
        avatar: null as any,
        network: null as any,
        address: null as any,
        device: null as any,
        position: spawnPoint,
        target: spawnPoint,
        clientPosition: spawnPoint,
        clientTarget: spawnPoint,
        rotation: null as any,
        xp: 50,
        maxHp: 100,
        latency: 0,
        kills: 0,
        killStreak: 0,
        deaths: 0,
        points: 0,
        evolves: 0,
        powerups: 0,
        rewards: 0,
        orbs: 0,
        pickups: [],
        isMod: false,
        isBanned: false,
        isMasterClient: false,
        isDisconnected: false,
        isDead: true,
        isJoining: false,
        isSpectating: false,
        isStuck: false,
        isGod: false,
        isRealm: false,
        isGuest: false,
        isInvincible: app.config.isGodParty ? true : false,
        isPhased: false,
        overrideSpeed: null as any,
        overrideCameraSize: null as any,
        cameraSize: app.config.cameraSize,
        speed: app.config.baseSpeed * app.config.avatarSpeedMultiplier0,
        joinedAt: 0,
        invincibleUntil: 0,
        decayPower: 1,
        hash: ipHashFromSocket(socket),
        lastReportedTime: getTime(),
        lastUpdate: 0,
        gameMode: app.config.gameMode,
        phasedUntil: getTime(),
        overrideSpeedUntil: 0,
        joinedRoundAt: getTime(),
        baseSpeed: 1,
        character: {
          meta: {
            1030: 0,
            1102: 0,
            1104: 0,
            1105: 0,
            1150: 0,
            1160: 0,
            1222: 0,
            1223: 0,
            1164: 0,
            1219: 0,
            1117: 0,
            1118: 0,
          },
        },
        log: {
          kills: [],
          deaths: [],
          revenge: 0,
          resetPosition: 0,
          phases: 0,
          stuck: 0,
          collided: 0,
          timeoutDisconnect: 0,
          speedProblem: 0,
          clientDistanceProblem: 0,
          outOfBounds: 0,
          ranOutOfHealth: 0,
          notReallyTrying: 0,
          tooManyKills: 0,
          killingThemselves: 0,
          sameNetworkDisconnect: 0,
          connectedTooSoon: 0,
          clientDisconnected: 0,
          positionJump: 0,
          pauses: 0,
          connects: 0,
          path: '',
          positions: 0,
          replay: [],
          recentJoinProblem: 0,
          usernameProblem: 0,
          maintenanceJoin: 0,
          signatureProblem: 0,
          signinProblem: 0,
          versionProblem: 0,
          failedRealmCheck: 0,
        },
      };
      log('User connected from hash ' + hash);
      if (!testMode && app.killSameNetworkClients) {
        const sameNetworkClient = app.clients.find((r) => r.hash === client.hash && r.id !== client.id);
        if (sameNetworkClient) {
          client.log.sameNetworkDisconnect += 1;
          disconnectClient(client, 'same network');
          return;
        }
      }
      app.sockets[client.id] = socket;
      app.clientLookup[client.id] = client;
      if (Object.keys(app.clientLookup).length == 1) {
        client.isMasterClient = true;
      }
      app.clients = app.clients.filter((c) => c.hash !== client.hash);
      app.clients.push(client);

      socket.on('trpc', async (message) => {
        const { id, method, params } = message;
        try {
          const ctx = { socket, client };

          const createCaller = t.createCallerFactory(appRouter);
          const caller = createCaller(ctx);
          const result = await caller[method](params);

          socket.emitAll('trpcResponse', { id, result });
        } catch (error) {
          console.log('user connection error', id, error.message);
          socket.emitAll('trpcResponse', { id, error: error.message });
        }
      });

      socket.on('disconnect', function () {
        log('User has disconnected');
        client.log.clientDisconnected += 1;
        disconnectClient(client, 'client disconnected');
        if (client.id === app.realmServer.socket?.id) {
          emitAll('onBroadcast', `Realm disconnected`, 0);
        }
      });
    } catch (e) {
      console.log('initEventHandler error', e);
    }
  });
}

export async function initGameServer(gs) {
  try {
    app = gs;
    app.realm = createClient();
    app.guestNames = [
      'Robin Banks',
      'Rick Axely',
      'Shorty McAngrystout',
      'Whiffletree',
      'Thistlebutt',
      'The Potato',
      'Gumbuns Moonbrain',
      'Drakus',
      'Nyx',
      'Aedigarr',
      'Vaergahl',
      'Anbraxas',
      'Rezoth',
      'Felscathor',
      'Kathax',
      'Rokk',
      'Terra',
      'Valaebal',
      'Nox',
      'Ulfryz',
      "X'ek",
      'Bastis',
      'Draugh',
      'Raek',
      'Zyphon',
      'Smaug',
    ];
    app.serverVersion = '2.0.0';
    app.observers = [];
    app.roundLoopTimeout;
    app.addressToUsername = {};
    app.announceReboot = false;
    app.rebootAfterRound = false;
    app.debugQueue = false;
    app.killSameNetworkClients = true;
    app.sockets = {};
    app.clientLookup = {};
    app.powerups = [];
    app.powerupLookup = {};
    app.currentReward = undefined;
    app.orbs = [];
    app.orbLookup = {};
    app.eventQueue = [];
    app.clients = [];
    app.lastReward = undefined;
    app.lastLeaderName = undefined;
    app.round = { startedAt: Math.round(getTime() / 1000), endedAt: null, events: [], states: [], players: [] };
    app.ranks = {};
    app.realmServer = { socket: undefined };
    app.ioCallbacks = {};
    app.pandas = [
      '0x150F24A67d5541ee1F8aBce2b69046e25d64619c',
      '0x3551691499D740790C4511CDBD1D64b2f146f6Bd',
      '0x1a367CA7bD311F279F1dfAfF1e60c4d797Faa6eb',
      '0x82b644E1B2164F5B81B3e7F7518DdE8E515A419d',
      '0xeb3fCb993dDe8a2Cd081FbE36238E4d64C286AC0',
    ];
    app.rateLimitWindow = 60 * 1000;
    app.maxRequestsPerWindow = 5;
    app.requestTimestamps = {};
    app.realm = undefined;
    app.loggableEvents = ['onMaintenance', 'saveRound'];
    app.currentPreset = presets[Math.floor(Math.random() * presets.length)];
    app.baseConfig = baseConfig;
    app.sharedConfig = sharedConfig;
    app.config = { ...baseConfig, ...sharedConfig };
    app.roundConfig = { ...baseConfig, ...sharedConfig, ...app.currentPreset };
    app.spawnBoundary1 = { x: { min: -17, max: 0 }, y: { min: -13, max: -4 } };
    app.spawnBoundary2 = { x: { min: -37, max: 0 }, y: { min: -13, max: -2 } };
    app.mapBoundary = { x: { min: -38, max: 2 }, y: { min: -20, max: 2 } };
    app.playerSpawnPoints = [
      { x: -4.14, y: -11.66 },
      { x: -11.14, y: -8.55 },
      { x: -12.27, y: -14.24 },
      { x: -7.08, y: -12.75 },
      { x: -7.32, y: -15.29 },
    ];
    app.lastFastGameloopTime = getTime();
    app.lastFastestGameloopTime = getTime();
    initEventHandler();
    if (Object.keys(app.clientLookup).length == 0) {
      randomRoundPreset();
      clearSprites();
      spawnSprites(app.config.spritesStartCount);
    }
    setTimeout(() => monitorObservers(), 30 * 1000);
    setTimeout(() => fastGameloop(), app.config.fastLoopSeconds * 1000);
    setTimeout(() => slowGameloop(), app.config.slowLoopSeconds * 1000);
    setTimeout(() => sendUpdates(), app.config.sendUpdateLoopSeconds * 1000);
    setTimeout(() => spawnRewards(), app.config.rewardSpawnLoopSeconds * 1000);
    setTimeout(() => checkConnectionLoop(), app.config.checkConnectionLoopSeconds * 1000);
    app.roundLoopTimeout = setTimeout(function () {
      resetLeaderboard();
    }, app.config.roundLoopSeconds * 1000);
  } catch (e) {
    log('initGameServer', e);
  }
}

export default { initGameServer };

export type Router = typeof appRouter;
