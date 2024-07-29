import { z } from 'zod';

export const signature = z.object({ signature: z.string() });
export const data = z.object({ data: z.any() });
export const dataAndSignature = z.object({
  data: z.any(),
  signature: z.object({
    address: z.string(),
    hash: z.string(),
  }),
});
export const msg = z.object({ msg: z.any() });

export const connected = signature;
export const apiConnected = signature;
export const apiDisconnected = signature;
export const setCharacter = data;
export const setConfig = data;
export const getConfig = z.object({});
export const load = signature;
export const spectate = z.object({});
export const setInfo = msg;
export const join = z.object({});
export const updateMyself = msg;
export const restart = signature;
export const maintenance = signature;
export const unmaintenance = signature;
export const startBattleRoyale = signature;
export const stopBattleRoyale = signature;
export const pauseRound = signature;
export const startRound = dataAndSignature;
export const enableForceLevel2 = signature;
export const disableForceLevel2 = signature;
export const startGodParty = signature;
export const stopGodParty = signature;
export const startRoyale = signature;
export const pauseRoyale = signature;
export const unpauseRoyale = signature;
export const stopRoyale = signature;
export const makeBattleHarder = signature;
export const makeBattleEasier = signature;
export const resetBattleDifficulty = signature;
export const messageUser = dataAndSignature;
export const changeUser = dataAndSignature;
export const broadcast = dataAndSignature;
export const kickClient = dataAndSignature;
export const info = z.object({});
export const auth = dataAndSignature;

export type SignatureInput = z.infer<typeof signature>;
export type DataInput = z.infer<typeof data>;
export type DataAndSignatureInput = z.infer<typeof dataAndSignature>;
export type MsgInput = z.infer<typeof msg>;
export type ConnectedInput = z.infer<typeof connected>;
export type ApiConnectedInput = z.infer<typeof apiConnected>;
export type ApiDisconnectedInput = z.infer<typeof apiDisconnected>;
export type SetCharacterInput = z.infer<typeof setCharacter>;
export type SetConfigInput = z.infer<typeof setConfig>;
export type GetConfigInput = z.infer<typeof getConfig>;
export type LoadInput = z.infer<typeof load>;
export type SpectateInput = z.infer<typeof spectate>;
export type SetInfoInput = z.infer<typeof setInfo>;
export type JoinInput = z.infer<typeof join>;
export type UpdateMyselfInput = z.infer<typeof updateMyself>;
export type RestartInput = z.infer<typeof restart>;
export type MaintenanceInput = z.infer<typeof maintenance>;
export type UnmaintenanceInput = z.infer<typeof unmaintenance>;
export type StartBattleRoyaleInput = z.infer<typeof startBattleRoyale>;
export type StopBattleRoyaleInput = z.infer<typeof stopBattleRoyale>;
export type PauseRoundInput = z.infer<typeof pauseRound>;
export type StartRoundInput = z.infer<typeof startRound>;
export type EnableForceLevel2Input = z.infer<typeof enableForceLevel2>;
export type DisableForceLevel2Input = z.infer<typeof disableForceLevel2>;
export type StartGodPartyInput = z.infer<typeof startGodParty>;
export type StopGodPartyInput = z.infer<typeof stopGodParty>;
export type StartRoyaleInput = z.infer<typeof startRoyale>;
export type PauseRoyaleInput = z.infer<typeof pauseRoyale>;
export type UnpauseRoyaleInput = z.infer<typeof unpauseRoyale>;
export type StopRoyaleInput = z.infer<typeof stopRoyale>;
export type MakeBattleHarderInput = z.infer<typeof makeBattleHarder>;
export type MakeBattleEasierInput = z.infer<typeof makeBattleEasier>;
export type ResetBattleDifficultyInput = z.infer<typeof resetBattleDifficulty>;
export type MessageUserInput = z.infer<typeof messageUser>;
export type ChangeUserInput = z.infer<typeof changeUser>;
export type BroadcastInput = z.infer<typeof broadcast>;
export type KickClientInput = z.infer<typeof kickClient>;
export type InfoInput = z.infer<typeof info>;
export type AuthInput = z.infer<typeof auth>;
