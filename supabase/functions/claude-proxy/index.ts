const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify the shared proxy secret
  const proxySecret = Deno.env.get("PROXY_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!proxySecret || !authHeader || authHeader !== `Bearer ${proxySecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Forward the request body to Anthropic
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return new Response("Server misconfiguration", { status: 500 });
  }

  const body = await req.text();

  const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body,
  });

  const responseBody = await anthropicResponse.text();

  return new Response(responseBody, {
    status: anthropicResponse.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
