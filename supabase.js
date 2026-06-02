const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY 
                 || process.env.SUPABASE_SERVICE_KEY  // fallback to existing var name
                 || process.env.SUPABASE_ANON_KEY;    // last resort

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = supabase;
