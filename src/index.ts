// evolution/packages/realm/src/index.ts

import dotEnv from 'dotenv';
dotEnv.config();

import { init as initRealmServer } from './realm-server';

initRealmServer();
