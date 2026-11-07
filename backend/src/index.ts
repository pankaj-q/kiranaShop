import { app } from './app.js'
import { config } from './config.js'
import { logger } from './lib/logger.js'

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'MajitKirana API started')
})

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
