import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Server-only admin client using the service role key.
 * NEVER import this from a client component or a file that could be
 * bundled for the browser — it would leak privileged credentials.
 *
 * Use only inside route handlers (app/api/**), server actions,
 * or server components that don't ship to the client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
