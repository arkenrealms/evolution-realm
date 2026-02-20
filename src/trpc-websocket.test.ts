type Handler = (...args: any[]) => void;

class MockSocket {
  private handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  off(event: string, handler: Handler) {
    const handlers = this.handlers.get(event) ?? [];
    this.handlers.set(
      event,
      handlers.filter((candidate) => candidate !== handler),
    );
    return this;
  }

  emit(_event: string, _data?: unknown) {
    return this;
  }

  close() {
    return this;
  }

  trigger(event: string, ...args: any[]) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

const sockets: MockSocket[] = [];

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => {
    const socket = new MockSocket();
    sockets.push(socket);
    return socket;
  }),
}));

import SocketIOWebSocket from '../trpc-websocket';

describe('SocketIOWebSocket close handling', () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it('emits onclose with clean semantics for io client disconnect', () => {
    const ws = new SocketIOWebSocket('http://localhost:4010');
    const onclose = jest.fn();
    ws.onclose = onclose;

    sockets[0].trigger('disconnect', 'io client disconnect');

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 1000,
        reason: 'io client disconnect',
        wasClean: true,
      }),
    );
  });

  it('does not double-dispatch close after explicit close followed by disconnect', () => {
    const ws = new SocketIOWebSocket('http://localhost:4010');
    const onclose = jest.fn();
    ws.onclose = onclose;

    ws.close();
    sockets[0].trigger('disconnect', 'transport close');

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 1000,
        reason: 'client closed',
        wasClean: true,
      }),
    );
  });

  it('marks non-client disconnect as unclean', () => {
    const ws = new SocketIOWebSocket('http://localhost:4010');
    const onclose = jest.fn();
    ws.onclose = onclose;

    sockets[0].trigger('disconnect', 'transport close');

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 1006,
        reason: 'transport close',
        wasClean: false,
      }),
    );
  });
});
