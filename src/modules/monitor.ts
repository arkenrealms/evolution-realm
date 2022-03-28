const os = require('os')
const fs = require('fs')

export function initMonitor(app) {
  let logs = []

  setInterval(function() {
    const available = Number(/MemAvailable:[ ]+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1]) / 1024

    if (available < 200) {
      if (logs.length >= 5) {
        const free = os.freemem() / 1024 / 1024
        const total = os.totalmem() / 1024 / 1024
        
        console.log('Free mem', free)
        console.log('Available mem', available)
        console.log('Total mem', total)

        process.exit()
      }
    } else {
      logs = []
    }
  }, 60 * 1000)

  setInterval(function() {
    // const free = os.freemem() / 1024 / 1024
    const available = Number(/MemAvailable:[ ]+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1]) / 1024
    // const total = os.totalmem() / 1024 / 1024
    // console.log('Free mem', free)
    // console.log('Available mem', available)
    // console.log('Total mem', total)
    if (available < 200) { // if ((os.freemem() / os.totalmem()) < 0.2) {
      console.log('Memory flagged', available)
      logs.push(true)
    }
  }, 10 * 1000)
}