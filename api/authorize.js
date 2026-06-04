/**
 * OAuth 2.0 Authorization endpoint.
 * claude.ai redirige acá con response_type=code.
 * Muestra un formulario donde el usuario ingresa el MCP_SECRET para autorizar.
 */

function generateCode(secret) {
  // Code = base64(secret:timestamp) — stateless, válido 5 minutos
  const payload = `${secret}:${Math.floor(Date.now() / 300000)}`; // ventana de 5 min
  return Buffer.from(payload).toString('base64url');
}

export function verifyCode(code, secret) {
  const now = Math.floor(Date.now() / 300000);
  // Acepta ventana actual y la anterior (hasta ~10 min de margen)
  for (const window of [now, now - 1]) {
    const expected = Buffer.from(`${secret}:${window}`).toString('base64url');
    if (code === expected) return true;
  }
  return false;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state') ?? '';
  const clientId = url.searchParams.get('client_id');

  if (req.method === 'GET') {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autorizar PrestaShop MCP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f0f0f; color: #e5e5e5; display: flex;
           align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
            padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #888; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; margin-bottom: 0.5rem; color: #aaa; }
    input[type=password] { width: 100%; padding: 0.625rem 0.75rem; background: #111;
      border: 1px solid #333; border-radius: 8px; color: #e5e5e5; font-size: 0.9rem;
      outline: none; }
    input[type=password]:focus { border-color: #555; }
    button { margin-top: 1rem; width: 100%; padding: 0.625rem;
      background: #e5e5e5; color: #111; border: none; border-radius: 8px;
      font-size: 0.9rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #fff; }
    .error { color: #f87171; font-size: 0.8rem; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Autorizar PrestaShop MCP</h1>
    <p>Ingresá el secreto para conectar Claude con tu tienda.</p>
    <form method="POST">
      <input type="hidden" name="redirect_uri" value="${redirectUri ?? ''}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="client_id" value="${clientId ?? ''}">
      <label for="secret">MCP Secret</label>
      <input type="password" id="secret" name="secret" placeholder="Tu MCP_SECRET" autofocus>
      <button type="submit">Autorizar</button>
    </form>
  </div>
</body>
</html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  if (req.method === 'POST') {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const secret = params.get('secret');
    const postRedirectUri = params.get('redirect_uri');
    const postState = params.get('state') ?? '';

    const validSecret = process.env.MCP_SECRET;
    if (!validSecret || secret !== validSecret) {
      // Volver al form con error
      const errHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Autorizar PrestaShop MCP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f0f0f; color: #e5e5e5; display: flex;
           align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
            padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #888; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; margin-bottom: 0.5rem; color: #aaa; }
    input[type=password] { width: 100%; padding: 0.625rem 0.75rem; background: #111;
      border: 1px solid #333; border-radius: 8px; color: #e5e5e5; font-size: 0.9rem; outline: none; }
    button { margin-top: 1rem; width: 100%; padding: 0.625rem;
      background: #e5e5e5; color: #111; border: none; border-radius: 8px;
      font-size: 0.9rem; font-weight: 600; cursor: pointer; }
    .error { color: #f87171; font-size: 0.8rem; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Autorizar PrestaShop MCP</h1>
    <p>Ingresá el secreto para conectar Claude con tu tienda.</p>
    <form method="POST">
      <input type="hidden" name="redirect_uri" value="${postRedirectUri ?? ''}">
      <input type="hidden" name="state" value="${postState}">
      <input type="hidden" name="client_id" value="${params.get('client_id') ?? ''}">
      <label for="secret">MCP Secret</label>
      <input type="password" id="secret" name="secret" placeholder="Tu MCP_SECRET" autofocus>
      <button type="submit">Autorizar</button>
      <p class="error">Secreto incorrecto. Intentá de nuevo.</p>
    </form>
  </div>
</body>
</html>`;
      return new Response(errHtml, { headers: { 'Content-Type': 'text/html' } });
    }

    // Generar code y redirigir a claude.ai
    const code = generateCode(validSecret);
    const callback = new URL(postRedirectUri);
    callback.searchParams.set('code', code);
    if (postState) callback.searchParams.set('state', postState);

    return Response.redirect(callback.toString(), 302);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

export const config = { runtime: 'nodejs' };
