// supabase/functions/hello-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response("Missing RESEND_API_KEY", { status: 500, headers: corsHeaders });
    }

    // Expect JSON body with list details to personalize the email
    const body = await req.json().catch(() => ({}));
    const to: string = body.to || "wardgd3@gmail.com"; // default recipient per request
    const listId: string | undefined = body.list_id;
    const listName: string | undefined = body.list_name;
    const total: number | undefined = typeof body.total === 'number' ? body.total : undefined;

    const title = listName ? `${listName} ticket is ready to be resolved` : `A ticket is ready to be resolved`;
    const totalStr = typeof total === 'number' ? `$${total.toFixed(2)}` : 'N/A';
    const listLine = listName ? `<p><strong>List:</strong> ${listName}</p>` : '';
    const idLine = listId ? `<p><strong>List ID:</strong> ${listId}</p>` : '';

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "GroceryApp <onboarding@resend.dev>",
        to,
        subject: title,
        html: `
          <h2>${title}</h2>
          ${listLine}
          ${idLine}
          <p><strong>Total:</strong> ${totalStr}</p>
          <p>Open your app to review and resolve this ticket.</p>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(`Failed to send email: ${err}`, { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ message: `Email sent to ${to}`, list_id: listId, list_name: listName, total }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders });
  }
});
