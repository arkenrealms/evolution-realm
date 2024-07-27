import express, { Express } from 'express';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Server as SocketServer } from 'socket.io';
import { createTRPCProxyClient, httpBatchLink, createWSClient, wsLink } from '@trpc/client';
import type { Router as GameWorldRouter } from './game-world';
export type { GameWorldRouter };

export interface AppConfig {
  testBanSystem: boolean;
}

export interface AppState {
  unsavedGames: any[];
}

export interface AppModule {
  name: string;
  instance: (app: Application) => void | Promise<void>;
  async: boolean;
  timeout: number;
}

export interface AppModules {
  [key: string]: (app: Application) => void | Promise<void>;
}

export interface Application {
  config: AppConfig;
  server: Express;
  isHttps: boolean;
  https?: HttpsServer;
  http?: HttpServer;
  io: SocketServer;
  subProcesses: any[];
  moduleConfig: AppModule[];
  modules: AppModules;
  adminList: string[];
  modList: string[];
  sockets: Record<string, any>;
  version: string;
  endpoint: string;
  servers: Record<string, Server>;
  profiles: Record<string, Profile>;
  web3: any; // Assume web3 is a configured instance
  secrets: any; // Secrets for signing
}

export interface Character {
  id: string;
  name: string;
  level: number;
  class: string;
}

export class Server {
  app: Application;
  endpoint: string;
  key: string;
  bridge?: ReturnType<typeof createTRPCProxyClient<GameWorldRouter>>;
  router?: ReturnType<typeof t.router>;
  socket?: any;
  id: string;
  info: undefined;
  isAuthed: boolean;
  characters: Record<string, Character>;
  process: any;
  spawnPort: any;
}
