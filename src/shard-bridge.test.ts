describe('tRPC and Game Server Integration Tests', () => {
  const { createHTTPServer } = require('@trpc/server/adapters/standalone');
  const { createTRPCProxyClient, httpBatchLink } = require('@trpc/client');
  const io = require('socket.io');
  const Client = require('socket.io-client');
  const { initGameServer } = require('../game-server'); // Adjust the path accordingly
  const { createServer } = require('http');
  const { appRouter } = require('./app-router'); // Adjust the path accordingly

  let trpcServer;
  let trpcServerAddr;
  let trpcClient;
  let ioServer;
  let httpServer;
  let httpServerAddr;
  let clientSocket;
  let app = { io: null, state: { spawnPort: 3000 } }; // Mocked app object

  beforeAll(async () => {
    // Setup tRPC server
    trpcServer = createHTTPServer({ router: appRouter });
    trpcServer.listen(0);
    trpcServerAddr = trpcServer.server.address();

    // Setup tRPC client
    trpcClient = createTRPCProxyClient({
      links: [
        httpBatchLink({
          url: `http://localhost:${trpcServerAddr.port}`,
        }),
      ],
    });

    // Setup Socket.io server
    httpServer = createServer().listen();
    httpServerAddr = httpServer.address();
    ioServer = io(httpServer);

    initGameServer(app); // Initialize your game server with mocked app
    ioServer.attach(httpServer);
  });

  afterAll(async () => {
    // Cleanup
    trpcServer.server.close();
    ioServer.close();
    httpServer.close();
  });

  beforeEach((done) => {
    // Do not hardcode port and address, use the address assigned by the server
    clientSocket = new Client(`http://localhost:${httpServerAddr.port}`);
    clientSocket.on('connect', done);
  });

  afterEach((done) => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    done();
  });

  test('tRPC init', async () => {
    const response = await trpcClient.query('init');
    expect(response.status).toBe(1);
    expect(response.id).toBeDefined();
  });

  test('tRPC configureRequest', async () => {
    const response = await trpcClient.mutation('configureRequest', { clients: [] });
    expect(response.data.rewardWinnerAmount).toBe(100);
    expect(response.data.rewardItemAmount).toBe(50);
  });

  test('tRPC saveRoundRequest', async () => {
    const response = await trpcClient.mutation('saveRoundRequest', {
      startedDate: Date.now(),
      endedAt: Date.now(),
      players: [],
      winners: [],
    });
    expect(response.status).toBe(1);
  });

  test('Game mode Sprite Juice updates camera size', (done) => {
    // Mock player object and settings
    const player = {
      id: clientSocket.id,
      name: 'TestPlayer',
      avatar: 0,
      cameraSize: 3,
      baseSpeed: 1,
      position: { x: 0, y: 0 },
      clientPosition: { x: 0, y: 0 },
      clientTarget: { x: 0, y: 0 },
    };

    // Simulate joining the game
    clientSocket.emit('JoinRoom');

    clientSocket.on('OnJoinGame', () => {
      // Simulate changing to Sprite Juice mode
      clientSocket.emit('setConfigRequest', { data: { config: { gameMode: 'Sprite Juice' } } });
    });

    clientSocket.on('OnSetRoundInfo', () => {
      // Simulate a power-up collection which increases cameraSize in Sprite Juice mode
      clientSocket.emit('UpdateMyself', 'packaged:payload'); // replace 'packaged:payload' with actual data format
    });

    clientSocket.on('OnUpdatePickup', () => {
      // Check if the camera size has increased
      expect(player.cameraSize).toBeGreaterThan(3);
      done();
    });
  });

  test('Game mode Marco Polo updates camera size', (done) => {
    // Mock player object and settings
    const player = {
      id: clientSocket.id,
      name: 'TestPlayer',
      avatar: 0,
      cameraSize: 3,
      baseSpeed: 1,
      position: { x: 0, y: 0 },
      clientPosition: { x: 0, y: 0 },
      clientTarget: { x: 0, y: 0 },
    };

    // Simulate joining the game
    clientSocket.emit('JoinRoom');

    clientSocket.on('OnJoinGame', () => {
      // Simulate changing to Marco Polo mode
      clientSocket.emit('setConfigRequest', { data: { config: { gameMode: 'Marco Polo' } } });
    });

    clientSocket.on('OnSetRoundInfo', () => {
      // Simulate a power-up collection which increases cameraSize in Marco Polo mode
      clientSocket.emit('UpdateMyself', 'packaged:payload'); // replace 'packaged:payload' with actual data format
    });

    clientSocket.on('OnUpdatePickup', () => {
      // Check if the camera size has increased
      expect(player.cameraSize).toBeGreaterThan(3);
      done();
    });
  });
});

export {};
