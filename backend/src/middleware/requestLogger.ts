import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { logger } from '../lib/logger.js'

/** Adds a request id to every request/response and logs one line when it finishes. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = req.header('x-request-id')?.trim() || randomUUID()
  res.locals.requestId = requestId
  res.setHeader('x-request-id', requestId)

  const startedAt = performance.now()

  res.on('finish', () => {
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Math.round(performance.now() - startedAt),
      },
      'request',
    )
  })

  next()
}
