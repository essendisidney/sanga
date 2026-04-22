import { Redis } from '@upstash/redis'

let client: Redis | null = null

// Returns an Upstash Redis client if UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are configured, otherwise null. Callers should
// have an in-memory fallback for local dev / unconfigured environments.
export function getRedis(): Redis | null {
  if (client) return client
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  client = new Redis({ url, token })
  return client
}
