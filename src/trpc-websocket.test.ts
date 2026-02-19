const listeners = new Map<string, (...args: any[]) => void>();

const socketMock = {
  on: jest.fn((event: string, cb: (...args: any[]) => void) => {
    listeners.set(event, cb);
  }),
  emit: jest.fn(),
  close: jest.fn(),
  off: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => socketMock),
}));

import SocketIOWebSocket from '../trpc-websocket';

describe('SocketIOWebSocket close handling', () => {
  beforeEach(() => {
    listeners.clear();
    jest.clearAllMocks();
  });

  it('invokes onclose when close() is called', () => {
    const socket = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();
    socket.onclose = onclose;

    socket.close();

    expect(socketMock.close).toHaveBeenCalled();
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(socket.CLOSED);
  });

  it('invokes onclose when socket disconnects', () => {
    const socket = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();
    socket.onclose = onclose;

    const disconnectListener = listeners.get('disconnect');
    expect(disconnectListener).toBeDefined();

    disconnectListener?.();

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(socket.CLOSED);
  });
});
