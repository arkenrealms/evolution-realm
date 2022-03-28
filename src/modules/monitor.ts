const os = require('os')


export function initMonitor(app) {
  let logs = []

  setInterval(function() {
    if (os.freemem() / 1024 / 1024 < 200) {
      if (logs.length >= 5) {
        console.log('Memory too low', os.freemem() / os.totalmem())
        process.exit()
      }
    } else {
      logs = []
    }
  }, 60 * 1000)

  setInterval(function() {
    console.log('Free mem', os.freemem() / 1024 / 1024)
    console.log('Total mem', os.totalmem() / 1024 / 1024)
    if (os.freemem() / 1024 / 1024 < 200) { // if ((os.freemem() / os.totalmem()) < 0.2) {
      console.log('Memory flagged', os.freemem() / os.totalmem())
      logs.push(true)
    }
  }, 10 * 1000)
}