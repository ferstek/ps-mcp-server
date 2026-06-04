import { createMcpHandler } from '@vercel/mcp-adapter';
import { z } from 'zod';
import { PrestaShopClient } from '../lib/prestashop.js';

function getClient() {
  const baseUrl = process.env.PS_BASE_URL;
  const apiKey = process.env.PS_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('PS_BASE_URL and PS_API_KEY env vars are required');
  return new PrestaShopClient(baseUrl, apiKey);
}

const mcpHandler = createMcpHandler(
  (server) => {
    // ── get_order_by_reference ──────────────────────────────────────────────
    server.registerTool(
      'get_order_by_reference',
      {
        title: 'Get Order by Reference',
        description:
          'Busca un pedido de PrestaShop por su código de referencia (ej: NNYFTDDFU). Devuelve id, cliente, monto, fecha y estado.',
        inputSchema: {
          reference: z.string().describe('Código de referencia del pedido, ej: NNYFTDDFU'),
        },
      },
      async ({ reference }) => {
        const ps = getClient();
        const order = await ps.getOrderByReference(reference.trim().toUpperCase());
        if (!order) {
          return { content: [{ type: 'text', text: `No se encontró ningún pedido con referencia "${reference}".` }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(order, null, 2) }] };
      }
    );

    // ── get_orders_by_date ──────────────────────────────────────────────────
    server.registerTool(
      'get_orders_by_date',
      {
        title: 'Get Orders by Date Range',
        description:
          'Trae pedidos de PrestaShop en un rango de fechas. Devuelve referencia, cliente_id, monto total y estado de cada pedido.',
        inputSchema: {
          date_from: z.string().describe('Fecha de inicio en formato YYYY-MM-DD, ej: 2026-05-01'),
          date_to: z.string().describe('Fecha de fin en formato YYYY-MM-DD, ej: 2026-05-31'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .default(100)
            .describe('Máximo de resultados (default 100)'),
        },
      },
      async ({ date_from, date_to, limit }) => {
        const ps = getClient();
        const orders = await ps.getOrdersByDate(date_from, date_to, limit);
        const total = orders.reduce((s, o) => s + o.total, 0);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: orders.length, total_revenue: total.toFixed(2), orders }, null, 2),
            },
          ],
        };
      }
    );

    // ── get_orders_by_state ─────────────────────────────────────────────────
    server.registerTool(
      'get_orders_by_state',
      {
        title: 'Get Orders by State',
        description:
          'Filtra pedidos de PrestaShop por estado. Usá list_order_states si no conocés el ID. Estados comunes: 1=Pago pendiente, 2=Pago aceptado, 4=Enviado, 6=Cancelado.',
        inputSchema: {
          state_id: z.number().int().describe('ID numérico del estado del pedido'),
          limit: z.number().int().min(1).max(500).optional().default(100),
        },
      },
      async ({ state_id, limit }) => {
        const ps = getClient();
        const orders = await ps.getOrdersByState(state_id, limit);
        const total = orders.reduce((s, o) => s + o.total, 0);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: orders.length, total_revenue: total.toFixed(2), orders }, null, 2),
            },
          ],
        };
      }
    );

    // ── list_order_states ───────────────────────────────────────────────────
    server.registerTool(
      'list_order_states',
      {
        title: 'List Order States',
        description:
          'Lista todos los estados de pedido disponibles en PrestaShop con su ID y nombre. Útil para saber qué ID usar en get_orders_by_state.',
        inputSchema: {},
      },
      async () => {
        const ps = getClient();
        const states = await ps.listOrderStates();
        return { content: [{ type: 'text', text: JSON.stringify(states, null, 2) }] };
      }
    );

    // ── get_customer ────────────────────────────────────────────────────────
    server.registerTool(
      'get_customer',
      {
        title: 'Get Customer',
        description:
          'Busca un cliente en PrestaShop por email o ID numérico. Devuelve nombre, email, fecha de registro y sus últimos pedidos.',
        inputSchema: {
          identifier: z
            .string()
            .describe('Email del cliente (ej: maria@gmail.com) o ID numérico (ej: 42)'),
        },
      },
      async ({ identifier }) => {
        const ps = getClient();
        const byId = !isNaN(Number(identifier));
        const customer = byId
          ? await ps.getCustomerById(Number(identifier))
          : await ps.getCustomerByEmail(identifier.trim().toLowerCase());

        if (!customer) {
          return {
            content: [{ type: 'text', text: `No se encontró cliente con identificador "${identifier}".` }],
          };
        }

        const orders = await ps.getCustomerOrders(customer.id, 20);
        const totalSpent = orders.reduce((s, o) => s + o.total, 0);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: customer.id,
                  name: `${customer.firstname} ${customer.lastname}`,
                  email: customer.email,
                  registered: customer.date_add,
                  active: customer.active,
                  orders_count: orders.length,
                  total_spent: totalSpent.toFixed(2),
                  recent_orders: orders,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // ── get_product_stock ───────────────────────────────────────────────────
    server.registerTool(
      'get_product_stock',
      {
        title: 'Get Product Stock',
        description: 'Consulta el stock de un producto en PrestaShop por ID numérico o referencia (SKU).',
        inputSchema: {
          identifier: z
            .string()
            .describe('ID numérico del producto o referencia/SKU (ej: 123 o REF-ABC)'),
        },
      },
      async ({ identifier }) => {
        const ps = getClient();
        const product = await ps.getProductStock(identifier.trim());
        if (!product) {
          return {
            content: [{ type: 'text', text: `No se encontró producto con identificador "${identifier}".` }],
          };
        }
        return { content: [{ type: 'text', text: JSON.stringify(product, null, 2) }] };
      }
    );

    // ── search_orders ───────────────────────────────────────────────────────
    server.registerTool(
      'search_orders',
      {
        title: 'Search Orders',
        description:
          'Búsqueda flexible de pedidos combinando filtros opcionales: rango de fechas, estado y/o cliente. Al menos un filtro debe estar presente.',
        inputSchema: {
          date_from: z.string().optional().describe('Fecha inicio YYYY-MM-DD'),
          date_to: z.string().optional().describe('Fecha fin YYYY-MM-DD'),
          state_id: z.number().int().optional().describe('ID del estado del pedido'),
          customer_id: z.number().int().optional().describe('ID del cliente'),
          limit: z.number().int().min(1).max(500).optional().default(50),
        },
      },
      async ({ date_from, date_to, state_id, customer_id, limit }) => {
        const ps = getClient();
        const orders = await ps.searchOrders({
          dateFrom: date_from,
          dateTo: date_to,
          stateId: state_id,
          customerId: customer_id,
          limit,
        });
        const total = orders.reduce((s, o) => s + o.total, 0);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: orders.length, total_revenue: total.toFixed(2), orders }, null, 2),
            },
          ],
        };
      }
    );
    // ── get_order_modifications ─────────────────────────────────────────────
    server.registerTool(
      'get_order_modifications',
      {
        title: 'Get Order Modifications',
        description:
          'Devuelve todas las modificaciones de pedidos (artículos agregados, cambiados o eliminados) en un rango de fechas. Útil para auditar cambios hechos por empleados en los pedidos.',
        inputSchema: {
          date_from: z.string().describe('Fecha inicio YYYY-MM-DD, ej: 2026-06-01'),
          date_to: z.string().describe('Fecha fin YYYY-MM-DD, ej: 2026-06-04'),
        },
      },
      async ({ date_from, date_to }) => {
        const apiUrl = process.env.DB_API_URL;
        const apiSecret = process.env.DB_API_SECRET;
        if (!apiUrl || !apiSecret) throw new Error('DB_API_URL and DB_API_SECRET env vars are required');

        const url = `${apiUrl}?secret=${encodeURIComponent(apiSecret)}&date_from=${date_from}&date_to=${date_to}`;
        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`DB API error ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
    );

    // ── DB tools helper ─────────────────────────────────────────────────────
    async function callDbTool(tool, params) {
      const baseUrl = process.env.DB_TOOLS_URL;
      const secret  = process.env.DB_API_SECRET;
      if (!baseUrl || !secret) throw new Error('DB_TOOLS_URL and DB_API_SECRET env vars are required');
      const qs = new URLSearchParams({ secret, tool, ...params }).toString();
      const res = await fetch(`${baseUrl}?${qs}`);
      if (!res.ok) throw new Error(`DB API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    // ── get_stock_breaks ────────────────────────────────────────────────────
    server.registerTool('get_stock_breaks', {
      title: 'Get Stock Breaks',
      description: 'Productos activos con stock 0 o por debajo de un umbral. Útil para detectar quiebres de stock.',
      inputSchema: {
        threshold: z.number().int().min(0).optional().default(0).describe('Stock máximo a mostrar (default 0 = solo sin stock)'),
      },
    }, async ({ threshold }) => callDbTool('get_stock_breaks', { threshold: String(threshold ?? 0) }));

    // ── get_product_activity_log ────────────────────────────────────────────
    server.registerTool('get_product_activity_log', {
      title: 'Get Product Activity Log',
      description: 'Productos activados o desactivados en un rango de fechas. Registrado via trigger en la DB.',
      inputSchema: {
        date_from: z.string().describe('Fecha inicio YYYY-MM-DD'),
        date_to:   z.string().describe('Fecha fin YYYY-MM-DD'),
        action:    z.enum(['activated','deactivated']).optional().describe('Filtrar por tipo de cambio (opcional)'),
      },
    }, async ({ date_from, date_to, action }) =>
      callDbTool('get_product_activity_log', { date_from, date_to, ...(action ? { action } : {}) }));

    // ── get_order_state_changes ─────────────────────────────────────────────
    server.registerTool('get_order_state_changes', {
      title: 'Get Order State Changes',
      description: 'Historial de cambios de estado de pedidos en un período, con resumen por estado. Incluye estado anterior y nuevo.',
      inputSchema: {
        date_from: z.string().describe('Fecha inicio YYYY-MM-DD'),
        date_to:   z.string().describe('Fecha fin YYYY-MM-DD'),
        state_id:  z.number().int().optional().describe('Filtrar por estado destino (opcional)'),
      },
    }, async ({ date_from, date_to, state_id }) =>
      callDbTool('get_order_state_changes', { date_from, date_to, ...(state_id ? { state_id: String(state_id) } : {}) }));

    // ── search_products ─────────────────────────────────────────────────────
    server.registerTool('search_products', {
      title: 'Search Products',
      description: 'Búsqueda flexible de productos con filtros combinables: sin SKU, sin imagen, sin precio, sin stock, por nombre, activos/inactivos.',
      inputSchema: {
        query:      z.string().optional().describe('Texto libre sobre el nombre del producto'),
        no_sku:     z.boolean().optional().describe('Solo productos sin referencia/SKU'),
        no_image:   z.boolean().optional().describe('Solo productos sin imagen de portada'),
        no_price:   z.boolean().optional().describe('Solo productos con precio 0 o vacío'),
        active:     z.boolean().optional().describe('Filtrar por estado activo/inactivo'),
        no_stock:   z.boolean().optional().describe('Solo productos con stock ≤ 0'),
        with_stock: z.boolean().optional().describe('Solo productos con stock > 0'),
        limit:      z.number().int().min(1).max(200).optional().default(50),
      },
    }, async (params) => {
      const p = { limit: String(params.limit ?? 50) };
      if (params.query)      p.query      = params.query;
      if (params.no_sku)     p.no_sku     = 'true';
      if (params.no_image)   p.no_image   = 'true';
      if (params.no_price)   p.no_price   = 'true';
      if (params.no_stock)   p.no_stock   = 'true';
      if (params.with_stock) p.with_stock = 'true';
      if (params.active !== undefined) p.active = params.active ? 'true' : 'false';
      return callDbTool('search_products', p);
    });

    // ── get_top_products ────────────────────────────────────────────────────
    server.registerTool('get_top_products', {
      title: 'Get Top Products',
      description: 'Los productos más vendidos en un período, por revenue o por unidades. Excluye pedidos cancelados.',
      inputSchema: {
        date_from: z.string().describe('Fecha inicio YYYY-MM-DD'),
        date_to:   z.string().describe('Fecha fin YYYY-MM-DD'),
        limit:     z.number().int().min(1).max(100).optional().default(10),
        order_by:  z.enum(['revenue','quantity']).optional().default('revenue'),
      },
    }, async ({ date_from, date_to, limit, order_by }) =>
      callDbTool('get_top_products', { date_from, date_to, limit: String(limit ?? 10), order_by: order_by ?? 'revenue' }));

    // ── get_pending_orders_aging ────────────────────────────────────────────
    server.registerTool('get_pending_orders_aging', {
      title: 'Get Pending Orders Aging',
      description: 'Pedidos trabados en un estado hace más de X días, ordenados por más viejos primero. Útil para detectar pedidos olvidados.',
      inputSchema: {
        state_id: z.number().int().optional().default(10).describe('Estado a consultar (default 10 = En espera de armado)'),
        min_days: z.number().int().min(1).optional().default(3).describe('Mínimo de días sin movimiento (default 3)'),
      },
    }, async ({ state_id, min_days }) =>
      callDbTool('get_pending_orders_aging', { state_id: String(state_id ?? 10), min_days: String(min_days ?? 3) }));

    // ── get_customer_stats ──────────────────────────────────────────────────
    server.registerTool('get_customer_stats', {
      title: 'Get Customer Stats',
      description: 'Estadísticas de clientes en un período: revenue, pedidos, nuevos vs recurrentes. Excluye cancelados.',
      inputSchema: {
        date_from: z.string().describe('Fecha inicio YYYY-MM-DD'),
        date_to:   z.string().describe('Fecha fin YYYY-MM-DD'),
        limit:     z.number().int().min(1).max(200).optional().default(20),
        order_by:  z.enum(['revenue','orders']).optional().default('revenue'),
      },
    }, async ({ date_from, date_to, limit, order_by }) =>
      callDbTool('get_customer_stats', { date_from, date_to, limit: String(limit ?? 20), order_by: order_by ?? 'revenue' }));

    // ── get_abandoned_carts ─────────────────────────────────────────────────
    server.registerTool('get_abandoned_carts', {
      title: 'Get Abandoned Carts',
      description: 'Carritos sin completar en un rango de fechas. Incluye monto estimado, productos, cliente y última actividad.',
      inputSchema: {
        date_from:  z.string().describe('Fecha inicio YYYY-MM-DD'),
        date_to:    z.string().describe('Fecha fin YYYY-MM-DD'),
        min_amount: z.number().optional().describe('Monto mínimo del carrito para filtrar (opcional)'),
      },
    }, async ({ date_from, date_to, min_amount }) =>
      callDbTool('get_abandoned_carts', { date_from, date_to, ...(min_amount ? { min_amount: String(min_amount) } : {}) }));

  },
  {},
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== 'production',
  }
);

function patchNodeRequest(req, res) {
  // Add AbortController signal (adapter uses req.signal for cleanup)
  if (!req.signal) {
    const ac = new AbortController();
    req.signal = ac.signal;
    res.on('close', () => ac.abort());
  }

  // Replace raw headers with a proper Fetch Headers object
  if (typeof req.headers.get !== 'function') {
    const raw = req.headers;
    const h = new Headers();
    for (const [k, v] of Object.entries(raw)) {
      if (v != null) h.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    }
    req.headers = h;
  }

  // Make req.url absolute — adapter does new Request(req.url) which requires a full URL
  if (req.url && !req.url.startsWith('http')) {
    const proto = (req.headers['x-forwarded-proto'] ?? 'https').toString().split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] ?? req.headers['host'] ?? 'localhost').toString().split(',')[0].trim();
    req.url = `${proto}://${host}${req.url}`;
  }

  // Add req.text() / req.json() (adapter reads the body this way)
  if (typeof req.text !== 'function') {
    req.text = () =>
      new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(Buffer.from(c)));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
      });
    req.json = async () => JSON.parse(await req.text());
  }
}

export default async function handler(req, res) {
  patchNodeRequest(req, res);

  // Auth check
  const secret = process.env.MCP_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' });
      res.end('Unauthorized');
      return;
    }
  }

  // The adapter returns a Fetch Response — pipe it back to Node.js res
  const response = await mcpHandler(req);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.writableEnded) res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  if (!res.writableEnded) res.end();
}
