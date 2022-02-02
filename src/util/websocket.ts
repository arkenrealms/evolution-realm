import { log } from '.'

let io

export function emitAll(...args) {
  log('Emit All', ...args)

  io.emit(...args)
}

export function emitDirect(socket, ...args) {
  log('Emit Direct', ...args)

  if (!socket || !socket.emit) return

  socket.emit(...args)
}

export function init(_io) {
  io = _io
}