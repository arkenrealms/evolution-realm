import SocketIOWebSocket from '../trpc-websocket';

type Listener = (...args: any[]) => void;

class MockSocket {
  private listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    const existing = this.listeners.get(event) || [];
    existing.push(listener);
    this.listeners.set(event, existing);
    return this;
  }

  off(event: string, listener: Listener): this {
    const existing = this.listeners.get(event) || [];
    this.listeners.set(
      event,
      existing.filter((entry) => entry !== listener),
    );
    return this;
  }

  emit = jest.fn();
  close = jest.fn();

  trigger(event: string, ...args: any[]): void {
    for (const listener of this.listeners.get(event) || []) {
      listener(...args);
    }
  }
}

const mockSocket = new MockSocket();

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

describe('SocketIOWebSocket close handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fires onclose when socket disconnects', () => {
    const wrapped = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();
    wrapped.onclose = onclose;

    mockSocket.trigger('disconnect');

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 1006,
        reason: 'socket disconnected',
      }),
    );
    expect(wrapped.readyState).toBe(SocketIOWebSocket.CLOSED);
  });

  test('uses clean close code for client initiated disconnect reason', () => {
    const wrapped = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();
    wrapped.onclose = onclose;

    mockSocket.trigger('disconnect', 'io client disconnect');

    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 1000,
        reason: 'io client disconnect',
      }),
    );
  });

  test('does not double-fire onclose when close() is followed by disconnect', () => {
    const wrapped = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();
    wrapped.onclose = onclose;

    wrapped.close();
    mockSocket.trigger('disconnect');

    expect(onclose).toHaveBeenCalledTimes(1);
  });
});
