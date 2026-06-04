import { verifyCode } from '../authorize.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await req.text();
  const params = new URLSearchParams(body);
  const grantType = params.get('grant_type');
  const secret = process.env.MCP_SECRET;

  if (!secret) return Response.json({ error: 'server_error' }, { status: 500 });

  if (grantType === 'authorization_code') {
    const code = params.get('code');
    if (!code || !verifyCode(code, secret)) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    return Response.json({ access_token: secret, token_type: 'bearer', expires_in: 3600 });
  }

  if (grantType === 'client_credentials') {
    if (params.get('client_secret') !== secret) {
      return Response.json({ error: 'invalid_client' }, { status: 401 });
    }
    return Response.json({ access_token: secret, token_type: 'bearer', expires_in: 3600 });
  }

  return Response.json({ error: 'unsupported_grant_type' }, { status: 400 });
}

export const config = { runtime: 'edge' };
