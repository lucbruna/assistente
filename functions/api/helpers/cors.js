const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function handleCORS(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}

export function addCORS(response) {
  const headers = new Headers(response.headers);
  for (const [key, val] of Object.entries(corsHeaders)) {
    headers.set(key, val);
  }
  if (response.body) {
    return new Response(response.body, { status: response.status, headers });
  }
  return new Response(null, { status: response.status, headers });
}
