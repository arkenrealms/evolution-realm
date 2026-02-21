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

  test('disconnect event notifies onclose with disconnect reason', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onclose = jest.fn();

    ws.onclose = onclose;

    const disconnectListener = mockOn.mock.calls.find((call) => call[0] === 'disconnect')?.[1] as
      | ((reason?: string) => void)
      | undefined;

    expect(disconnectListener).toBeDefined();
    disconnectListener?.('transport close');

    expect(ws.readyState).toBe(ws.CLOSED);
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onclose.mock.calls[0][0]).toMatchObject({ reason: 'transport close' });
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

  test('connect_error event is surfaced as Event-like payload', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onerror = jest.fn();

    ws.onerror = onerror;

    const connectErrorListener = mockOn.mock.calls.find((call) => call[0] === 'connect_error')?.[1] as
      | ((err: unknown) => void)
      | undefined;

    expect(connectErrorListener).toBeDefined();
    connectErrorListener?.(new Error('connect boom'));

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

  test('connect calls onopen with an Event-like payload', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onopen = jest.fn();

    ws.onopen = onopen;

    const connectListener = mockOn.mock.calls.find((call) => call[0] === 'connect')?.[1] as
      | (() => void)
      | undefined;

    connectListener?.();

    expect(onopen).toHaveBeenCalledTimes(1);
    expect(onopen.mock.calls[0][0]).toMatchObject({ type: 'open' });
  });

  test('send throws when socket is not OPEN', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');

    expect(() => ws.send('payload')).toThrow('SocketIOWebSocket is not open');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  test('send emits trpc payload when socket is OPEN', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');

    const connectListener = mockOn.mock.calls.find((call) => call[0] === 'connect')?.[1] as
      | (() => void)
      | undefined;

    connectListener?.();
    ws.send('payload');

    expect(mockEmit).toHaveBeenCalledWith('trpc', 'payload');
  });

  test('trpc event is surfaced through onmessage payload', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onmessage = jest.fn();

    ws.onmessage = onmessage;

    const trpcListener = mockOn.mock.calls.find((call) => call[0] === 'trpc')?.[1] as
      | ((data: unknown) => void)
      | undefined;

    expect(trpcListener).toBeDefined();
    trpcListener?.({ id: 1, result: { data: 'ok' } });

    expect(onmessage).toHaveBeenCalledTimes(1);
    expect(onmessage.mock.calls[0][0]).toMatchObject({
      data: { id: 1, result: { data: 'ok' } },
    });
  });

  test('addEventListener ignores duplicate listener registration', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const listener = jest.fn();

    ws.addEventListener('custom', listener);
    ws.addEventListener('custom', listener);

    expect(mockOn.mock.calls.filter((call) => call[0] === 'custom')).toHaveLength(1);
  });

  test('removeEventListener unregisters each distinct listener exactly once', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const listenerA = jest.fn();
    const listenerB = jest.fn();

    ws.addEventListener('custom', listenerA);
    ws.addEventListener('custom', listenerB);

    ws.removeEventListener('custom', listenerA);
    ws.removeEventListener('custom', listenerA);
    ws.removeEventListener('custom', listenerB);

    expect(mockOff.mock.calls.filter((call) => call[0] === 'custom')).toHaveLength(2);
  });

  test('connect event after close is ignored', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onopen = jest.fn();

    ws.onopen = onopen;

    const connectListener = mockOn.mock.calls.find((call) => call[0] === 'connect')?.[1] as
      | (() => void)
      | undefined;

    ws.close(1000, 'normal');
    connectListener?.();

    expect(ws.readyState).toBe(ws.CLOSED);
    expect(onopen).not.toHaveBeenCalled();
  });

  test('native close listener is notified without socket-level registration', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const listener = jest.fn();

    ws.addEventListener('close', listener);
    ws.close(1000, 'normal');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(mockOn.mock.calls.filter((call) => call[0] === 'close')).toHaveLength(0);
  });

  test('native message listener receives trpc payload', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const listener = jest.fn();

    ws.addEventListener('message', listener);

    const trpcListener = mockOn.mock.calls.find((call) => call[0] === 'trpc')?.[1] as
      | ((data: unknown) => void)
      | undefined;

    trpcListener?.({ result: 'ok' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ data: { result: 'ok' } });
    expect(mockOn.mock.calls.filter((call) => call[0] === 'message')).toHaveLength(1);
  });

  test('native close listener removal does not call socket off', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const listener = jest.fn();

    ws.addEventListener('close', listener);
    ws.removeEventListener('close', listener);

    expect(mockOff.mock.calls.filter((call) => call[0] === 'close')).toHaveLength(0);
  });

  test('dispatchEvent triggers native handler and listener callbacks', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');
    const onmessage = jest.fn();
    const listener = jest.fn();

    ws.onmessage = onmessage;
    ws.addEventListener('message', listener);

    const messageEvent = { type: 'message', data: { id: 99 } } as MessageEvent;
    const handled = ws.dispatchEvent(messageEvent as unknown as Event);

    expect(handled).toBe(true);
    expect(onmessage).toHaveBeenCalledTimes(1);
    expect(onmessage).toHaveBeenCalledWith(messageEvent);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(messageEvent);
  });

  test('dispatchEvent returns false for invalid events', () => {
    const ws = new SocketIOWebSocket('http://localhost:1234');

    expect(ws.dispatchEvent(undefined as unknown as Event)).toBe(false);
    expect(ws.dispatchEvent({} as Event)).toBe(false);
  });
});
