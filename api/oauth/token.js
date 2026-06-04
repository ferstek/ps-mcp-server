/**
 * OAuth 2.0 client_credentials token endpoint.
 * claude.ai POSTs here with client_id + client_secret and recibe un access_token.
 */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await req.text();
  const params = new URLSearchParams(body);
  const clientId = params.get('client_id');
  const clientSecret = params.get('client_secret');
  const grantType = params.get('grant_type');

  if (grantType !== 'client_credentials') {
    return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
  }

  const secret = process.env.MCP_SECRET;
  if (!secret || clientSecret !== secret) {
    return Response.json({ error: 'invalid_client' }, { status: 401 });
  }

  // El access_token ES el secret — stateless, sin DB
  return Response.json({
    access_token: secret,
    token_type: 'bearer',
    expires_in: 3600,
  });
}

export const config = { runtime: 'edge' };
