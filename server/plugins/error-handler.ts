export default defineNitroPlugin((nitro) => {
  // Attach a unique request ID for log correlation across all requests.
  nitro.hooks.hook('request', (event) => {
    const requestId = Math.random().toString(36).slice(2, 10)
    event.context.requestId = requestId
    setHeader(event, 'x-request-id', requestId)
  })

  // Log server errors (5xx). Client errors (4xx) are intentional — don't spam logs.
  // In production Nitro already strips stack traces from responses; this adds structured logging.
  nitro.hooks.hook('error', (error, { event }) => {
    const statusCode = (error as any).statusCode ?? 500
    if (statusCode >= 500) {
      const requestId = event?.context?.requestId ?? 'unknown'
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          statusCode,
          message: error.message,
          url: event?.path,
          // Stack only in non-production; never sent to client in either mode.
          ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
        })
      )
    }
  })
})
