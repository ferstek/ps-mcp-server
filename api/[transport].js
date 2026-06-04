import { createMcpHandler } from '@vercel/mcp-adapter';
import { z } from 'zod';
import { PrestaShopClient } from '../lib/prestashop.js';

function getClient() {
  const baseUrl = process.env.PS_BASE_URL;
  const apiKey = process.env.PS_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('PS_BASE_URL and PS_API_KEY env vars are required');
  return new PrestaShopClient(baseUrl, apiKey);
}

const handler = createMcpHandler(
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
  },
  {},
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== 'production',
  }
);

export default handler;
