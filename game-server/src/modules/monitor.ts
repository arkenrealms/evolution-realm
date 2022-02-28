const os = require('os')


export function initMonitor(app) {
  setInterval(function() {
    if ((os.freemem() / os.totalmem()) > 0.8) {
      process.exit()
    }
  }, 30 * 1000)
}