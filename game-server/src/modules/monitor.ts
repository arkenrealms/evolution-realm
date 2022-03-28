const os = require('os')


export function initMonitor(app) {
  let logs = []

  setInterval(function() {
    if ((os.freemem() / os.totalmem()) > 0.8) {
      if (logs.length >= 5) {
        console.log('Memory too low', os.freemem() / os.totalmem())
        process.exit()
      }
    } else {
      logs = []
    }
  }, 60 * 1000)

  setInterval(function() {
    if ((os.freemem() / os.totalmem()) > 0.8) {
      console.log('Memory flagged', os.freemem() / os.totalmem())
      logs.push(true)
    }
  }, 10 * 1000)
}