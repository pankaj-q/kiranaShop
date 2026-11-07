import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'

/** Expected, client-facing failures. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.issues,
        requestId,
      },
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, requestId },
    })
    return
  }

  logger.error({ err, requestId }, 'unhandled error')
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId,
    },
  })
}
