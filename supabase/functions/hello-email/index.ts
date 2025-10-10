// supabase/functions/hello-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response("Missing RESEND_API_KEY", { status: 500 });
    }

    // The body can include "to" if you want dynamic recipients
    const { to } = await req.json().catch(() => ({ to: "test@example.com" }));

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Your App <onboarding@resend.dev>",
        to,
        subject: "Hello from Supabase Edge!",
        html: "<h1>Hello World 👋</h1><p>This is a test email from Supabase Edge Function using Resend.</p>",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(`Failed to send email: ${err}`, { status: 500 });
    }

    return new Response(
      JSON.stringify({ message: `Email sent to ${to}` }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
});
