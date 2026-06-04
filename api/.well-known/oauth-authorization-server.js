export default function handler(req) {
  const host = req.headers.get('host');
  const base = `https://${host}`;

  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/api/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    grant_types_supported: ['authorization_code', 'client_credentials'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
  });
}

export const config = { runtime: 'edge' };
