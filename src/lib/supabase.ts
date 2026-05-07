import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbqlnzmxzmrvgmzhppkx.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFicWxuenB4em1ydmdtemhwcGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTYyNzcxNzMsImV4cCI6MjAzMTg1MzE3M30.DfT80g8Xp2p5DfF5T80g8Xp2p5DfF5T80g8Xp2p5DfF'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
