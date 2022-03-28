const os = require('os')


export function initMonitor(app) {
  let logs = []

  setInterval(function() {
    if ((os.freemem() / os.totalmem()) < 0.2) {
      if (logs.length >= 5) {
        console.log('Memory too low', os.freemem() / os.totalmem())
        process.exit()
      }
    } else {
      logs = []
    }
  }, 60 * 1000)

  setInterval(function() {
    if ((os.freemem() / os.totalmem()) < 0.2) {
      logs.push(true)
    }
  }, 10 * 1000)
}