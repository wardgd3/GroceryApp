// netlify/edge-functions/auth-gate.js
export default async (request, context) => {
  // Read username/password from Netlify environment variables
  const USER = Netlify.env.get("GATE_USER");
  const PASS = Netlify.env.get("GATE_PASSWORD");

  // If not set, let everything through (so you don't lock yourself out)
  if (!USER || !PASS) return context.next();

  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Protected"' },
    });
  }

  const [, b64] = auth.split(" ");
  const [user, pass] = atob(b64).split(":");

  if (user === USER && pass === PASS) return context.next();

  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Protected"' },
  });
};

// Run on every path (you can change this later to only /admin/*)
export const config = {
  path: "/*",
  // optional: skip static assets to reduce executions
  excludedPath: ["/*.css", "/*.js", "/*.png", "/*.jpg", "/*.svg", "/favicon*","/.netlify/*"],
};
