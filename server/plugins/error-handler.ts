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

    /**
     * Close the connection when we answer a request whose body we never read.
     *
     * Every guard that runs before the body — `requireUserSession`, the ownership check,
     * the upload size cap — answers with unread bytes still on the socket. Node then
     * destroys that socket once the response is written, and because it was a keep-alive
     * connection the client's **next** request over it dies with `ECONNRESET` instead of
     * getting an answer. The failure therefore lands on an unrelated, innocent request,
     * which is the worst possible place for it: a 4 MB POST rejected with 401 made the
     * following `/auth/register` fail, and nothing in either request pointed at the cause.
     *
     * `Connection: close` is what RFC 9110 §6.1 prescribes for exactly this — it tells the
     * client the socket is finished, so it opens a new one instead of reusing a dead one.
     * The alternative, draining the body first, would mean reading megabytes we have
     * already decided to reject, which is what the early guards exist to avoid.
     *
     * Guarded on `readableEnded` so a normal 404 or a validation error on a fully-read body
     * keeps its keep-alive connection: those are the overwhelming majority, and closing
     * every errored connection would cost a handshake per 4xx.
     */
    if (event?.node?.req && !event.node.req.readableEnded && !event.node.res.headersSent) {
      event.node.res.setHeader('Connection', 'close')
    }
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
