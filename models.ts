// src/models/Config.ts
import { Schema, model } from 'mongoose';

const configSchema = new Schema({
  roundId: { type: Number, default: 1 },
  rewardItemAmountPerLegitPlayer: { type: Number, default: 0 },
  rewardItemAmountMax: { type: Number, default: 0 },
  rewardWinnerAmountPerLegitPlayer: { type: Number, default: 0 },
  rewardWinnerAmountMax: { type: Number, default: 0 },
  rewardItemAmount: { type: Number, default: 0 },
  rewardWinnerAmount: { type: Number, default: 0 },
  drops: {
    guardian: { type: Number, default: 1633043139000 },
    earlyAccess: { type: Number, default: 1633043139000 },
    trinket: { type: Number, default: 1641251240764 },
    santa: { type: Number, default: 1633043139000 },
    runeword: { type: Number, default: 1641303263018 },
    runeToken: { type: Number, default: 1633043139000 },
  },
});

export const Config = model('Config', configSchema);

const unsavedGameSchema = new Schema({
  gsid: String,
  roundId: Number,
  round: Object,
  rewardWinnerAmount: Number,
  status: { type: Number, default: undefined },
});

export const UnsavedGame = model('UnsavedGame', unsavedGameSchema);
