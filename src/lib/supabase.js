import { createClient } from '@supabase/supabase-js';

const projectRef = import.meta.env?.VITE_SUPABASE_PROJECT_REF;
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const explicitUrl = import.meta.env?.VITE_SUPABASE_URL;

const supabaseUrl = explicitUrl || (projectRef ? `https://${projectRef}.supabase.co` : '');

let client = null;

if (supabaseUrl && anonKey) {
  client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: localStorage,
    },
  });
} else if (typeof window !== 'undefined') {
  console.warn(
    'Supabase is not configured. Set VITE_SUPABASE_PROJECT_REF and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_URL) in your environment.'
  );
}

export { client as supabase };
export { supabaseUrl, anonKey };
export default createClient;
