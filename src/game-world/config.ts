export type Config = {
  id?: number;
  roundId: number;
  damagePerTouch: number;
  periodicReboots: boolean;
  startAvatar: number;
  spriteXpMultiplier: number;
  forcedLatency: number;
  isRoundPaused: boolean;
  level2forced: boolean;
  level2allowed: boolean;
  level2open: boolean;
  level3open: boolean;
  hideMap: boolean;
  disconnectClientSeconds: number;
  dynamicDecayPower: boolean;
  decayPowerPerMaxEvolvedClients: number;
  pickupCheckPositionDistance: number;
  playersRequiredForLevel2: number;
  preventBadKills: boolean;
  colliderBuffer: number;
  stickyIslands: boolean;
  antifeed2: boolean;
  antifeed3: boolean;
  antifeed4: boolean;
  isBattleRoyale: boolean;
  isGodParty: boolean;
  isRoyale: boolean;
  avatarDirection: number;
  calcRoundRewards: boolean;
  flushEventQueueSeconds: number;
  mechanics: number[];
  disabledMechanics: number[];
  log: {
    connections: boolean;
  };
  anticheat: {
    enabled: boolean;
    sameClientCantClaimRewardTwiceInRow: boolean;
    disconnectPositionJumps: boolean;
  };
  optimization: {
    sendClientUpdateWithNoChanges: boolean;
  };
  antifeed1: boolean;
  avatarDecayPower0: number;
  avatarDecayPower1: number;
  avatarDecayPower2: number;
  avatarTouchDistance0: number;
  avatarTouchDistance1: number;
  avatarTouchDistance2: number;
  avatarSpeedMultiplier0: number;
  avatarSpeedMultiplier1: number;
  avatarSpeedMultiplier2: number;
  baseSpeed: number;
  cameraSize: number;
  checkConnectionLoopSeconds: number;
  checkInterval: number;
  checkPositionDistance: number;
  claimingRewards: boolean;
  decayPower: number;
  disconnectClientSeconds: number;
  disconnectPositionJumps: boolean;
  fastestLoopSeconds: number;
  fastLoopSeconds: number;
  gameMode: string;
  immunitySeconds: number;
  isMaintenance: boolean;
  leadercap: boolean;
  maxEvolves: number;
  noBoot: boolean;
  noDecay: boolean;
  orbCutoffSeconds: number;
  orbOnDeathPercent: number;
  orbTimeoutSeconds: number;
  pickupDistance: number;
  pointsPerEvolve: number;
  pointsPerKill: number;
  pointsPerOrb: number;
  pointsPerPowerup: number;
  pointsPerReward: number;
  powerupXp0: number;
  powerupXp1: number;
  powerupXp2: number;
  powerupXp3: number;
  resetInterval: number;
  rewardItemAmount: number;
  rewardItemName: string;
  rewardItemType: number;
  rewardSpawnLoopSeconds: number;
  rewardWinnerAmount: number;
  rewardWinnerName: string;
  roundLoopSeconds: number;
  sendUpdateLoopSeconds: number;
  slowLoopSeconds: number;
  spritesPerClientCount: number;
  spritesStartCount: number;
  spritesTotal: number;
  guide: string[];
};

export const testMode = false;

export const baseConfig: Partial<Config> = {
  id: undefined,
  roundId: 1,
  damagePerTouch: 10,
  periodicReboots: false,
  startAvatar: 0,
  spriteXpMultiplier: 1,
  forcedLatency: 20,
  isRoundPaused: false,
  level2forced: false,
  level2allowed: true,
  level2open: false,
  level3open: false,
  hideMap: false,
  dynamicDecayPower: true,
  decayPowerPerMaxEvolvedClients: 0.6,
  pickupCheckPositionDistance: 1,
  playersRequiredForLevel2: 15,
  preventBadKills: false,
  colliderBuffer: 0.05,
  stickyIslands: false,
  antifeed2: true,
  antifeed3: false,
  antifeed4: true,
  isBattleRoyale: false,
  isGodParty: false,
  isRoyale: false,
  avatarDirection: 1,
  calcRoundRewards: true,
  flushEventQueueSeconds: 0.02,
  mechanics: [1150, 1160, 1222, 1223, 1030, 1102, 1164, 1219, 1105, 1104, 1117, 1118],
  disabledMechanics: [],
  log: { connections: false },
  anticheat: { enabled: false, sameClientCantClaimRewardTwiceInRow: false, disconnectPositionJumps: false },
  optimization: { sendClientUpdateWithNoChanges: true },
  disconnectClientSeconds: 60,
  guide: [],,
};

export const sharedConfig: Partial<Config> = {
  antifeed1: true,
  avatarDecayPower0: 1.5,
  avatarDecayPower1: 2.5,
  avatarDecayPower2: 3,
  avatarTouchDistance0: 0.25,
  avatarTouchDistance1: 0.45,
  avatarTouchDistance2: 0.65,
  avatarSpeedMultiplier0: 1,
  avatarSpeedMultiplier1: 1,
  avatarSpeedMultiplier2: 0.85,
  baseSpeed: 3,
  cameraSize: 3,
  checkConnectionLoopSeconds: 2,
  checkInterval: 1,
  checkPositionDistance: 2,
  claimingRewards: false,
  decayPower: 2,
  disconnectClientSeconds: testMode ? 999 : 30,
  disconnectPositionJumps: true,
  fastestLoopSeconds: 0.02,
  fastLoopSeconds: 0.04,
  gameMode: 'Standard',
  immunitySeconds: 5,
  isMaintenance: false,
  leadercap: false,
  maxEvolves: 3,
  noBoot: testMode,
  noDecay: testMode,
  orbCutoffSeconds: testMode ? 0 : 60,
  orbOnDeathPercent: 25,
  orbTimeoutSeconds: testMode ? 3 : 10,
  pickupDistance: 0.3,
  pointsPerEvolve: 1,
  pointsPerKill: 20,
  pointsPerOrb: 1,
  pointsPerPowerup: 1,
  pointsPerReward: 5,
  powerupXp0: 2,
  powerupXp1: 4,
  powerupXp2: 8,
  powerupXp3: 16,
  resetInterval: 3.1,
  rewardItemAmount: 0,
  rewardItemName: '?',
  rewardItemType: 0,
  rewardSpawnLoopSeconds: testMode ? 1 : (3 * 60) / 20,
  rewardWinnerAmount: 0,
  rewardWinnerName: 'EL',
  roundLoopSeconds: testMode ? 1 * 60 : 5 * 60,
  sendUpdateLoopSeconds: 3,
  slowLoopSeconds: 1,
  spritesPerClientCount: 1,
  spritesStartCount: 50,
  spritesTotal: 50
};
