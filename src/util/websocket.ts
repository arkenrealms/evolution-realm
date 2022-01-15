import { log } from '.'

let io

export function emitAll(...args) {
  // log('emitAll', ...args)
  io.emit(...args)
}

export function emitDirect(socket, ...args) {
  log('emitDirect', ...args)

  if (!socket || !socket.emit) return

  socket.emit(...args)
}

export function init(_io) {
  io = _io
}