import { logger } from '~~/server/utils/logger'

export default defineNitroPlugin((nitro) => {
  // Attach a unique request ID for log correlation.
  nitro.hooks.hook('request', (event) => {
    const requestId = Math.random().toString(36).slice(2, 10)
    event.context.requestId = requestId
    setHeader(event, 'x-request-id', requestId)
  })

  // Log all requests at info level
  nitro.hooks.hook('afterResponse', (event, { body: _body }) => {
    const statusCode = event.node.res.statusCode ?? 200
    if (statusCode < 400) {
      logger.info('request', {
        method: event.method,
        url: event.path,
        status: statusCode,
        requestId: event.context.requestId,
      })
    }
  })

  // Log server errors (5xx) at error level. 4xx are intentional — skip.
  nitro.hooks.hook('error', (error, { event }) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode >= 500) {
      logger.error('server error', {
        requestId: event?.context?.requestId ?? 'unknown',
        statusCode,
        message: error.message,
        url: event?.path,
        method: event?.method,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
      })
    } else if (statusCode >= 400) {
      logger.debug('client error', {
        requestId: event?.context?.requestId ?? 'unknown',
        statusCode,
        url: event?.path,
      })
    }
  })
})
