import jetpack from 'fs-jetpack'

const path = require('path')

export const isDebug = process.env.HOME === '/Users/dev' || process.env.HOME === '/home/dev' || process.env.HOME === '/root'

if (isDebug) {
  console.log('Running RS in DEBUG mode')
}

const writeLogs = false

export function log(...msgs) {
  if (isDebug) {
    console.log('[RS]', ...msgs)
  }

  if (!writeLogs) return

  const logData = jetpack.read(path.resolve('../public/data/log.json'), 'json') || []
  
  for (const msg of msgs) {
    logData.push(JSON.stringify(msg))
  }

  jetpack.write(path.resolve('../public/data/log.json'), JSON.stringify(logData, null, 2))
}

export function logError(err) {
  console.log('[RS]', err)

  if (!writeLogs) return

  const errorLog = jetpack.read(path.resolve('./public/data/errors.json'), 'json') || []

  errorLog.push(JSON.stringify(err))
  
  jetpack.write(path.resolve('./public/data/errors.json'), JSON.stringify(errorLog, null, 2), { atomic: true })
}

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getTime() {
  return new Date().getTime()
}
  
export function convertToDecimal(byte) {
  let result = 0;

  byte = byte.split('');

  byte.reverse();

  for (let a = 0; a < byte.length; a++){
    if (byte[a] === '1'){
      result += 2 ** a;
    }
  }

  return result;
}
  
export function binaryAgent(str) {
  let bytes = str.split(' ')
  let output = ''
    
  for (let k = 0; k < bytes.length; k++) {
    if (bytes[k]) output += String.fromCharCode(convertToDecimal(bytes[k]))
  }

  return output
}

export function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}