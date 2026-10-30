import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY ontbreken (zie .env.example)')
}

export const supabase = createClient(url, key)

/** Alle app-data staat in het schema `facturen`. */
export const db = () => supabase.schema('facturen')

export const BUCKET = 'facturen'
