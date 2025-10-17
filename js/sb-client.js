// sb-client.umd.js (UMD; requires the UMD bundle script loaded BEFORE this file)
(function () {
  var SUPABASE_URL = 'https://ktwvxfamdcwkguerkjal.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0d3Z4ZmFtZGN3a2d1ZXJramFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwOTUxNDUsImV4cCI6MjA3NDY3MTE0NX0.rU3I2WA0CksR601Pj4PoOwzrHbaReg-7aUfLLk1tNhw';

  // 🔴 Toggle this to true only if you want to manually test sending emails again
  var ENABLE_MANUAL_SEND = false;

  // 1) Guard: UMD bundle must be loaded first
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[sb-client] Supabase UMD library not loaded. Include it BEFORE this file:\n' +
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>');
    return;
  }

  // 2) Create client; expose as window.sb (do NOT overwrite window.supabase)
  if (!window.sb) {
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function parseMaybeJson(resp) {
    return resp.text().then(function (txt) {
      try { return { data: JSON.parse(txt), raw: txt }; }
      catch { return { data: null, raw: txt }; }
    });
  }

  // 3) Optional manual send (currently disabled)
  if (ENABLE_MANUAL_SEND) {
    document.addEventListener('DOMContentLoaded', function () {
      var btn = document.getElementById('send-test-email');
      if (!btn) {
        console.warn('[sb-client] Button #send-test-email not found.');
        return;
      }

      if (btn.dataset.bound === '1') return; // prevent double binding
      btn.dataset.bound = '1';

      btn.addEventListener('click', function (e) {
        e.preventDefault(); // avoid accidental form submits
        fetch('https://ktwvxfamdcwkguerkjal.functions.supabase.co/ticket-new-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ to: 'wardgd3@gmail.com' })
        })
        .then(function (res) {
          return parseMaybeJson(res).then(function (parsed) {
            if (!res.ok) {
              var msg = (parsed.data && (parsed.data.error || parsed.data.message || parsed.data.detail)) || parsed.raw || ('HTTP ' + res.status);
              throw new Error(msg);
            }
            console.log('[sb-client] Edge function response:', parsed.data || parsed.raw);
            alert('✅ Email sent! Check your inbox.');
          });
        })
        .catch(function (err) {
          console.error('[sb-client] Error:', err);
          alert('❌ Error: ' + (err && err.message ? err.message : String(err)));
        });
      });
    });
  }
})();
