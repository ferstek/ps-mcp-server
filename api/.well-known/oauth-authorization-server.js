/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * El cliente MCP lo descubre automáticamente para saber dónde pedir el token.
 */
export default function handler(req) {
  const host = req.headers.get('host');
  const base = `https://${host}`;

  return Response.json({
    issuer: base,
    token_endpoint: `${base}/api/oauth/token`,
    grant_types_supported: ['client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
  });
}

export const config = { runtime: 'edge' };
