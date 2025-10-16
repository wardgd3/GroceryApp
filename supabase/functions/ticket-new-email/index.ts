// supabase/functions/ticket-new-email/index.ts
// Sends an email via Resend when a new ticket is inserted.
// Expects to be invoked by a Supabase DB webhook or direct HTTP call with JSON body of the new ticket row.
// Required env var: RESEND_API_KEY
// Optional env var: TICKET_EMAIL_RECIPIENTS (comma-separated list). Fallback to hard-coded list below.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string,string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Default recipients if env variable not provided
const DEFAULT_RECIPIENTS = [
  "wardgd3@gmail.com",
  "emm.ward.19@gmail.com"
];

interface TicketPersonTotal {
  name: string;
  total: number; // assumed numeric
}

interface IncomingTicketPayload {
  id?: string | number;
  name?: string;            // ticket name / list name
  created_at?: string;
  totals?: TicketPersonTotal[]; // optional aggregated per-person totals
  // Fallback raw fields that might exist per-person, adapt as needed.
  people?: { name: string; total: number; }[];
  list_id?: string; // uuid linking all rows for the same ticket
  person?: string;
  amount_due?: number | string;
  // Additional columns can be included without breaking the handler.
  [key: string]: unknown;
}

serve(async (req: Request): Promise<Response> => {
  // TEST ENDPOINT: POST /test-email to send a test email to both recipients using Resend SDK
  if (req.method === 'POST' && new URL(req.url).pathname === '/test-email') {
    try {
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (!RESEND_API_KEY) {
        return new Response('Missing RESEND_API_KEY', { status: 500, headers: corsHeaders });
      }
      // Import Resend SDK dynamically for Deno compatibility
      const { default: Resend } = await import('npm:resend');
      const resend = new Resend(RESEND_API_KEY);
      const recipients = [
        'wardgd3@gmail.com',
        'emm.ward.19@gmail.com'
      ];
      const from = 'YourApp <info@yourcustomdomain.com>'; // <-- replace with your verified sender
      const subject = 'Test Email from Resend SDK';
      const html = `<h2>This is a test email from Resend SDK.</h2><p>If you received this, your custom domain is working!</p>`;
      const results = [];
      for (const to of recipients) {
        try {
          const sent = await resend.emails.send({ from, to, subject, html });
          results.push({ to, status: 'sent', id: sent.id });
        } catch (err) {
          results.push({ to, status: 'error', error: err.message });
        }
      }
      return new Response(JSON.stringify({ message: 'Test emails attempted', results }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  }
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response('Missing RESEND_API_KEY', { status: 500, headers: corsHeaders });
    }

    // Derive recipients
    const envRecipients = Deno.env.get('TICKET_EMAIL_RECIPIENTS');
    const recipients = envRecipients
      ? envRecipients.split(',').map(r => r.trim()).filter(Boolean)
      : DEFAULT_RECIPIENTS;

    if (!recipients.length) {
      return new Response('No recipients configured', { status: 500, headers: corsHeaders });
    }



    const body = await req.json().catch(() => ({}));
    // Log the incoming payload for debugging
    console.log('ticket-new-email payload:', JSON.stringify(body));

    // Unwrap common Supabase webhook wrappers: { record: {...} }, { new: {...} }, { data: {...} }
    let record: IncomingTicketPayload | undefined = undefined;
    if (Array.isArray(body)) {
      record = body[0];
    } else if (body && typeof body === 'object') {
      if ('record' in body && typeof body.record === 'object') {
        record = body.record;
      } else if ('new' in body && typeof body.new === 'object') {
        record = body.new;
      } else if ('data' in body && typeof body.data === 'object') {
        record = body.data;
      } else {
        record = body;
      }
    }

    // If no record found, send an email with the raw payload for debugging
    if (!record) {
      const subject = 'Ticket Email Debug: No ticket data found';
      const html = `<pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>`;
      for (const to of recipients) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'GroceryApp <onboarding@resend.dev>',
            to,
            subject,
            html,
          }),
        });
      }
      return new Response('No ticket payload received (debug email sent)', { status: 200, headers: corsHeaders });
    }

    const ticketName = record.name || 'Untitled Ticket';

    // Try to aggregate totals by person from the ticket table using list_id
    let peopleTotals: TicketPersonTotal[] = [];

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && (record.list_id || record.name)) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          global: { headers: { 'X-Client-Info': 'ticket-new-email-fn' } },
        });
        // Prefer grouping by list_id; fallback to name if list_id missing
        const query = supabase
          .from('ticket')
          .select('person, amount_due, resolved')
          .order('person', { ascending: true });
        if (record.list_id) {
          query.eq('list_id', record.list_id as string);
        } else if (ticketName) {
          query.eq('name', ticketName);
        }
        // Only include unresolved line items (assumption: resolved=false means outstanding)
        query.eq('resolved', false);
        const { data: rows, error: qErr } = await query;
        if (!qErr && Array.isArray(rows)) {
          const map = new Map<string, number>();
          for (const r of rows as Array<{ person: string | null; amount_due: number | string | null }>) {
            const person = (r.person ?? 'Unknown').toString();
            const amt = r.amount_due == null ? 0 : typeof r.amount_due === 'number' ? r.amount_due : parseFloat(r.amount_due as string);
            map.set(person, (map.get(person) ?? 0) + (isFinite(amt) ? amt : 0));
          }
          peopleTotals = Array.from(map.entries()).map(([name, total]) => ({ name, total }));
        } else if (qErr) {
          console.error('Supabase query error:', qErr.message);
        }
      } catch (e) {
        console.error('Supabase client error:', e);
      }
    }

    // If still no totals, fallback to any provided structure on the payload
    if (!peopleTotals.length) {
      if (Array.isArray((record as any).totals)) {
        const arr = (record as any).totals as TicketPersonTotal[];
        peopleTotals = arr.filter(pt => pt && typeof pt.total === 'number');
      } else if (Array.isArray((record as any).people)) {
        const arr = (record as any).people as { name: string; total: number }[];
        peopleTotals = arr.filter(p => p && typeof p.total === 'number');
      } else if (record.person && (record.amount_due != null)) {
        const amt = typeof record.amount_due === 'number' ? record.amount_due : parseFloat(String(record.amount_due));
        if (isFinite(amt)) peopleTotals = [{ name: String(record.person), total: amt }];
      }
    }

    const totalsHtml = peopleTotals.length
      ? `<table style="border-collapse:collapse;margin-top:12px;">
           <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ddd;">Person</th><th style="text-align:right;padding:4px 8px;border-bottom:1px solid #ddd;">Total</th></tr></thead>
           <tbody>
             ${peopleTotals.map(p => `<tr><td style="padding:4px 8px;">${escapeHtml(p.name)}</td><td style="padding:4px 8px;text-align:right;">$${p.total.toFixed(2)}</td></tr>`).join('')}
           </tbody>
         </table>`
      : '<p>No per-person totals were provided.</p>';

    const subject = `New Ticket: ${ticketName}`;

    const html = `
      <h2>You have a new ticket that is ready to be paid.</h2>
      <p><strong>Ticket Name:</strong> ${escapeHtml(ticketName)}</p>
      ${totalsHtml}
      <p style="margin-top:16px;">Log into the app to review and pay.</p>
    `;

    // Send an individual email per recipient (simpler for future personalization)
    const sendResults = [] as { to: string; ok: boolean; status: number; error?: string }[];
    for (const to of recipients) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'GroceryApp <onboarding@resend.dev>',
          to,
          subject,
          html,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        sendResults.push({ to, ok: false, status: resp.status, error: errText });
      } else {
        sendResults.push({ to, ok: true, status: resp.status });
      }
    }

    const anyFailure = sendResults.some(r => !r.ok);
    return new Response(
      JSON.stringify({
        message: anyFailure ? 'Some emails failed' : 'Emails sent',
        subject,
        recipients,
        results: sendResults,
      }),
      { status: anyFailure ? 500 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders });
  }
});

function escapeHtml(str: string | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
