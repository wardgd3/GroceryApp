// js/sb-client.js
(() => {
  if (window.sb) return; // already created somewhere else

  const SUPABASE_URL = 'https://ktwvxfamdcwkguerkjal.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0d3Z4ZmFtZGN3a2d1ZXJramFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwOTUxNDUsImV4cCI6MjA3NDY3MTE0NX0.rU3I2WA0CksR601Pj4PoOwzrHbaReg-7aUfLLk1tNhw';

  window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
