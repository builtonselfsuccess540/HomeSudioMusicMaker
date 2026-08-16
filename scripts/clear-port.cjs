'use strict'
const { execSync } = require('child_process')
try {
  const out = execSync('netstat -ano', { encoding: 'utf8' })
  const lines = out.split('\n').filter(l => l.includes(':5174 ') || l.includes(':5174\t'))
  for (const line of lines) {
    const pid = line.trim().split(/\s+/).pop()
    if (/^\d+$/.test(pid) && pid !== '0') {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch {}
    }
  }
} catch {}
