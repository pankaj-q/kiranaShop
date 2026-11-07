import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { config } from './config.js'
import { errorHandler, notFound } from './middleware/error.js'
import { requestLogger } from './middleware/requestLogger.js'
import { routes } from './routes.js'

export const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: config.appOrigin, credentials: true }))
app.use(express.json({ limit: '100kb' }))
app.use(requestLogger)

app.use('/api/v1', routes)

app.use(notFound)
app.use(errorHandler)
