import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'

/** Expected, client-facing failures. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound: RequestHandler = (_req, res) => {
  const requestId = res.locals.requestId as string | undefined
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId },
  })
}

/** Express body-parser failures carry a 4xx `status` (invalid JSON, too large, …). */
function bodyError(err: unknown) {
  if (typeof err !== 'object' || err === null || !('status' in err)) return null
  const status = Number((err as { status?: number }).status)
  if (!Number.isInteger(status) || status < 400 || status >= 500) return null

  const type = 'type' in err ? String((err as { type?: string }).type) : ''

  if (type === 'entity.parse.failed') {
    return { statusCode: 400, code: 'INVALID_JSON', message: 'Request body valid JSON nahi hai' }
  }
  if (type === 'entity.too.large' || status === 413) {
    return { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request bahut bada hai' }
  }
  if (status === 415) {
    return { statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type support nahi hai' }
  }

  return { statusCode: status, code: 'BAD_REQUEST', message: 'Request galat hai' }
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
      error: { code: err.code, message: err.message, details: err.details, requestId },
    })
    return
  }

  const bodyFailure = bodyError(err)
  if (bodyFailure) {
    res.status(bodyFailure.statusCode).json({
      error: { code: bodyFailure.code, message: bodyFailure.message, requestId },
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
