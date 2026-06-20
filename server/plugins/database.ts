import { closeDatabasePool } from '~~/server/database'

/**
 * Gracefully close the mysql2 connection pool when the Nitro server shuts down,
 * so we don't leak connections on the shared Netcup MySQL during restarts.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', async () => {
    await closeDatabasePool()
  })
})
