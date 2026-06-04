# PrestaShop MCP Server

Servidor MCP que conecta Claude directamente con PrestaShop vía WebServices REST.

## Deploy en Vercel

### 1. Crear repo en GitHub y subir el código

```bash
cd ps-mcp-server
git init
git add .
git commit -m "Initial commit"
gh repo create ps-mcp-server --public --push --source .
```

### 2. Importar en Vercel

- Ir a vercel.com → New Project → importar `ps-mcp-server`
- Framework: Other
- Root directory: `/`

### 3. Variables de entorno en Vercel

En Settings → Environment Variables, agregar:

| Variable | Valor |
|----------|-------|
| `PS_BASE_URL` | `https://mayorista.tiendaballerina.com.ar` |
| `PS_API_KEY` | Tu API key de PrestaShop |
| `MCP_SECRET` | Un string largo aleatorio (ej: `openssl rand -hex 32`) |

### 4. Deploy

Vercel hace el primer deploy automáticamente al importar. URL resultante:
`https://ps-mcp-server.vercel.app`

---

## Registrar en Claude

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "prestashop": {
      "type": "http",
      "url": "https://ps-mcp-server.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer TU_MCP_SECRET"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add prestashop \
  --transport http \
  --url https://ps-mcp-server.vercel.app/api/mcp \
  --header "Authorization: Bearer TU_MCP_SECRET"
```

---

## Herramientas disponibles

| Herramienta | Descripción |
|-------------|-------------|
| `get_order_by_reference` | Pedido por código (ej: NNYFTDDFU) |
| `get_orders_by_date` | Pedidos en un rango de fechas |
| `get_orders_by_state` | Pedidos filtrados por estado |
| `list_order_states` | Lista todos los estados con su ID |
| `get_customer` | Cliente por email o ID |
| `get_product_stock` | Stock de un producto por ID o referencia |
| `search_orders` | Búsqueda combinando fecha + estado + cliente |

## Ejemplos de uso en Claude

- "Traeme los pedidos cancelados de mayo"
- "¿Cuánto facturamos la semana pasada?"
- "Busca el pedido NNYFTDDFU"
- "¿Qué compró maria@gmail.com?"
- "¿Cuánto stock queda del producto REF-ABC?"
