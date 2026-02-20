import SocketIOWebSocket from '../trpc-websocket';

const mockOn = jest.fn();
const mockOff = jest.fn();
const mockEmit = jest.fn();
const mockClose = jest.fn();

const mockSocket = {
  on: mockOn,
  off: mockOff,
  emit: mockEmit,
  close: mockClose,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

describe('SocketIOWebSocket close lifecycle', () => {
  beforeEach(() => {
    mockOn.mockClear();
    mockOff.mockClear();
    mockEmit.mockClear();
    mockClose.mockClear();
  });

  test('close() notifies onclose and transitions to CLOSED', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();

    ws.onclose = onclose;
    ws.close(1001, 'shutdown');

    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(ws.CLOSED);
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose.mock.calls[0][0]).toMatchObject({ code: 1001, reason: 'shutdown' });
  });

  test('disconnect event notifies onclose', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();

    ws.onclose = onclose;

    const disconnectListener = mockOn.mock.calls.find((call) => call[0] === 'disconnect')?.[1] as
      | (() => void)
      | undefined;

    expect(disconnectListener).toBeDefined();
    disconnectListener?.();

    expect(ws.readyState).toBe(ws.CLOSED);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  test('close() followed by disconnect only notifies onclose once', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();

    ws.onclose = onclose;

    const disconnectListener = mockOn.mock.calls.find((call) => call[0] === 'disconnect')?.[1] as
      | (() => void)
      | undefined;

    ws.close(1000, 'normal');
    disconnectListener?.();

    expect(onclose).toHaveBeenCalledTimes(1);
  });
});
