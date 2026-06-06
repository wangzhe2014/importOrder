const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || 'https://wgklfgdzkaftnwvweboc.supabase.co';
const supabaseAnonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);


async function checkTable() {
  console.log('Testing RPC run_sql...');
  const { data: d1, error: e1 } = await supabase.rpc('run_sql', { sql: 'SELECT 1;' });
  if (e1) {
    console.error('run_sql failed:', e1.message);
  } else {
    console.log('run_sql success:', d1);
  }

  console.log('Testing RPC execute_sql...');
  const { data: d2, error: e2 } = await supabase.rpc('execute_sql', { sql: 'SELECT 1;' });
  if (e2) {
    console.error('execute_sql failed:', e2.message);
  } else {
    console.log('execute_sql success:', d2);
  }
}

checkTable();





