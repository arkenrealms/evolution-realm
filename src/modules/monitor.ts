const os = require('os')


export function initMonitor(app) {
  setInterval(function() {
    if ((os.freemem() / os.totalmem()) > 0.8) {
      process.exit()
    }
  }, 5 * 60 * 1000)
}