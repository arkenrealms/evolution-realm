// (global as any).WebSocket = SocketIOWebSocket;

// const wsClient = createWSClient({
//   url: 'http://your-socket-server-url',
// });

// const shardProxyClient = createTRPCProxyClient<Shard.Router>({
//   links: [
//     wsLink({
//       client: wsClient,
//     }),
//   ],
//   transformer,
// });

// or:

// const socket = io('http://localhost:3000');
// const wrappedSocket = new SocketIOWebSocket(socket);

// // Adding an event listener
// wrappedSocket.addEventListener('customEvent', (data) => {
//   console.log('Received customEvent:', data);
// });

// // Removing an event listener
// wrappedSocket.removeEventListener('customEvent', listener);

// // Sending a message
// wrappedSocket.send('Hello, World!');

import { io as socketIOClient, Socket } from 'socket.io-client';

type Listener = (...args: any[]) => void;

function createCloseEvent(code?: number, reason?: string): CloseEvent {
  if (typeof CloseEvent === 'function') {
    return new CloseEvent('close', { code, reason });
  }

  return { type: 'close', code: code ?? 1000, reason: reason ?? '' } as CloseEvent;
}

function createErrorEvent(error: unknown): Event {
  if (typeof ErrorEvent === 'function') {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    return new ErrorEvent('error', { error, message });
  }

  return { type: 'error', error } as Event;
}

export default class SocketIOWebSocket implements WebSocket {
  private ioSocket: Socket;
  private eventListeners: Map<string, Function[]>;
  private closeNotified = false;

  // WebSocket properties
  public readonly url: string;
  public readonly protocol: string;
  public readonly extensions: string = ''; // Socket.IO doesn't support WebSocket extensions
  public readyState: number; // Translate Socket.IO states to WebSocket states
  public bufferedAmount: number = 0; // Socket.IO doesn't expose this

  public binaryType: BinaryType = 'blob'; // Not directly supported by Socket.IO, adjust as needed

  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readonly CONNECTING = SocketIOWebSocket.CONNECTING;
  public readonly OPEN = SocketIOWebSocket.OPEN;
  public readonly CLOSING = SocketIOWebSocket.CLOSING;
  public readonly CLOSED = SocketIOWebSocket.CLOSED;

  constructor(url: string) {
    console.log('SocketIOWebSocket.constructor');

    this.ioSocket = socketIOClient(url, {
      transports: ['websocket'],
      upgrade: false,
      autoConnect: false,
      // pingInterval: 5000,
      // pingTimeout: 20000
      // extraHeaders: {
      //   "my-custom-header": "1234"
      // }
    });

    // WebSocket interface compatibility
    this.binaryType = 'blob';
    this.readyState = SocketIOWebSocket.CONNECTING;

    this.ioSocket.on('connect', () => {
      console.log('SocketIOWebSocket.connect');
      this.readyState = SocketIOWebSocket.OPEN;
      if (this.onopen) this.onopen();
    });

    this.ioSocket.on('disconnect', () => {
      console.log('SocketIOWebSocket.disconnect');
      this.readyState = SocketIOWebSocket.CLOSED;
      this.notifyClose(createCloseEvent());
    });

    this.ioSocket.on('message', (data: any) => {
      console.log('SocketIOWebSocket.message');
      if (this.onmessage) this.onmessage({ data } as MessageEvent);
    });

    this.ioSocket.on('error', (err: any) => {
      console.log('SocketIOWebSocket.error');
      if (this.onerror) this.onerror(createErrorEvent(err));
    });

    this.eventListeners = new Map<string, Function[]>();
  }

  public onopen: (() => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  public close(code?: number, reason?: string): void {
    console.log('SocketIOWebSocket.close');
    if (this.readyState === SocketIOWebSocket.CLOSING || this.readyState === SocketIOWebSocket.CLOSED) {
      return;
    }

    this.readyState = SocketIOWebSocket.CLOSING;
    this.ioSocket.close();
    this.readyState = SocketIOWebSocket.CLOSED;
    this.notifyClose(createCloseEvent(code, reason));
  }

  private notifyClose(event: CloseEvent): void {
    if (this.closeNotified) return;
    this.closeNotified = true;
    if (this.onclose) this.onclose(event);
  }

  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    console.log('SocketIOWebSocket.send', data);
    this.ioSocket.emit('trpc', data);
  }

  public dispatchEvent(event: Event): boolean {
    console.log('SocketIOWebSocket.dispatchEvent', event);
    // You can implement custom event handling if necessary
    return false;
  }
  //   // Dispatch event (not part of WebSocket interface, but for internal use)
  //   private dispatchEvent(event: string, ...args: any[]) {
  //     if (this.eventListeners.has(event)) {
  //       for (const listener of this.eventListeners.get(event)!) {
  //         listener(...args);
  //       }
  //     }
  //   }

  public addEventListener(event: string, listener: Listener) {
    console.log('SocketIOWebSocket.addEventListener', event);
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
    this.ioSocket.on(event, listener);
  }

  public removeEventListener(event: string, listener: Listener) {
    console.log('SocketIOWebSocket.removeEventListener', event);
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event)!;
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
        this.ioSocket.off(event, listener);
      }
    }
  }
}
