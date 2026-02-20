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

  test('disconnect followed by close() does not re-close or double-notify', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();

    ws.onclose = onclose;

    const disconnectListener = mockOn.mock.calls.find((call) => call[0] === 'disconnect')?.[1] as
      | (() => void)
      | undefined;

    disconnectListener?.();
    ws.close(1000, 'normal');

    expect(mockClose).toHaveBeenCalledTimes(0);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  test('second close() call is ignored after initial close', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');

    ws.close(1000, 'first');
    ws.close(1000, 'second');

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('error event is surfaced as Event-like payload', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onerror = jest.fn();

    ws.onerror = onerror;

    const errorListener = mockOn.mock.calls.find((call) => call[0] === 'error')?.[1] as
      | ((err: unknown) => void)
      | undefined;

    expect(errorListener).toBeDefined();
    errorListener?.(new Error('boom'));

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onerror.mock.calls[0][0]).toMatchObject({ type: 'error' });
  });

  test('connect resets close notification state for subsequent disconnects', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();

    ws.onclose = onclose;

    const disconnectListener = mockOn.mock.calls.find((call) => call[0] === 'disconnect')?.[1] as
      | (() => void)
      | undefined;
    const connectListener = mockOn.mock.calls.find((call) => call[0] === 'connect')?.[1] as
      | (() => void)
      | undefined;

    disconnectListener?.();
    connectListener?.();
    disconnectListener?.();

    expect(onclose).toHaveBeenCalledTimes(2);
  });
});
