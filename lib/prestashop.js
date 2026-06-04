/**
 * PrestaShop WebServices client.
 * Auth: Basic (apiKey as username, empty password).
 * All responses are JSON.
 */

export class PrestaShopClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
  }

  async _get(path) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        'Output-Format': 'JSON',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PrestaShop API error ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json();
  }

  _qs(params) {
    const p = new URLSearchParams(params);
    p.set('output_format', 'JSON');
    return '?' + p.toString();
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async getOrderByReference(reference) {
    const qs = this._qs({
      'filter[reference]': reference,
      display: '[id,reference,total_paid_tax_incl,date_add,current_state,id_customer,id_address_delivery]',
    });
    const data = await this._get(`/api/orders${qs}`);
    const orders = data?.orders ?? [];
    if (orders.length === 0) return null;

    const order = orders[0];
    const [customer, stateName] = await Promise.all([
      this.getCustomerById(order.id_customer).catch(() => null),
      this.getOrderStateName(order.current_state).catch(() => String(order.current_state)),
    ]);

    return {
      id: order.id,
      reference: order.reference,
      date: order.date_add,
      total: parseFloat(order.total_paid_tax_incl),
      state_id: order.current_state,
      state: stateName,
      customer: customer
        ? { id: customer.id, name: `${customer.firstname} ${customer.lastname}`, email: customer.email }
        : { id: order.id_customer },
    };
  }

  async getOrdersByDate(dateFrom, dateTo, limit = 100) {
    const qs = this._qs({
      'filter[date_add]': `[${dateFrom},${dateTo}]`,
      date: '1',
      display: '[id,reference,total_paid_tax_incl,date_add,current_state,id_customer]',
      limit: String(limit),
      sort: 'date_add_DESC',
    });
    const data = await this._get(`/api/orders${qs}`);
    return this._enrichOrderList(data?.orders ?? []);
  }

  async getOrdersByState(stateId, limit = 100) {
    const qs = this._qs({
      'filter[current_state]': `[${stateId}]`,
      display: '[id,reference,total_paid_tax_incl,date_add,current_state,id_customer]',
      limit: String(limit),
      sort: 'date_add_DESC',
    });
    const data = await this._get(`/api/orders${qs}`);
    return this._enrichOrderList(data?.orders ?? []);
  }

  async searchOrders({ dateFrom, dateTo, stateId, customerId, limit = 50 }) {
    const params = {
      display: '[id,reference,total_paid_tax_incl,date_add,current_state,id_customer]',
      limit: String(limit),
      sort: 'date_add_DESC',
    };
    if (dateFrom && dateTo) {
      params['filter[date_add]'] = `[${dateFrom},${dateTo}]`;
      params.date = '1';
    }
    if (stateId) params['filter[current_state]'] = `[${stateId}]`;
    if (customerId) params['filter[id_customer]'] = customerId;

    const data = await this._get(`/api/orders${this._qs(params)}`);
    return this._enrichOrderList(data?.orders ?? []);
  }

  async _enrichOrderList(orders) {
    if (orders.length === 0) return [];

    // Fetch all order states once
    const stateMap = await this.getAllOrderStates().catch(() => ({}));

    return orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      date: o.date_add,
      total: parseFloat(o.total_paid_tax_incl),
      state_id: o.current_state,
      state: stateMap[o.current_state] ?? String(o.current_state),
      customer_id: o.id_customer,
    }));
  }

  // ── Order states ─────────────────────────────────────────────────────────────

  async getAllOrderStates() {
    const data = await this._get(`/api/order_states${this._qs({ display: '[id,name]' })}`);
    const map = {};
    for (const s of data?.order_states ?? []) map[s.id] = s.name;
    return map;
  }

  async getOrderStateName(stateId) {
    const data = await this._get(`/api/order_states/${stateId}${this._qs({ display: '[id,name]' })}`);
    return data?.order_state?.name ?? String(stateId);
  }

  async listOrderStates() {
    const data = await this._get(`/api/order_states${this._qs({ display: '[id,name,color]' })}`);
    return data?.order_states ?? [];
  }

  // ── Customers ────────────────────────────────────────────────────────────────

  async getCustomerById(id) {
    const data = await this._get(`/api/customers/${id}${this._qs({ display: '[id,firstname,lastname,email,date_add,active]' })}`);
    return data?.customer ?? null;
  }

  async getCustomerByEmail(email) {
    const qs = this._qs({
      'filter[email]': email,
      display: '[id,firstname,lastname,email,date_add,active]',
    });
    const data = await this._get(`/api/customers${qs}`);
    const list = data?.customers ?? [];
    return list[0] ?? null;
  }

  async getCustomerOrders(customerId, limit = 20) {
    const qs = this._qs({
      'filter[id_customer]': customerId,
      display: '[id,reference,total_paid_tax_incl,date_add,current_state]',
      limit: String(limit),
      sort: 'date_add_DESC',
    });
    const data = await this._get(`/api/orders${qs}`);
    const stateMap = await this.getAllOrderStates().catch(() => ({}));
    return (data?.orders ?? []).map((o) => ({
      id: o.id,
      reference: o.reference,
      date: o.date_add,
      total: parseFloat(o.total_paid_tax_incl),
      state: stateMap[o.current_state] ?? String(o.current_state),
    }));
  }

  // ── Products / Stock ─────────────────────────────────────────────────────────

  async getProductStock(idOrRef) {
    const byId = !isNaN(Number(idOrRef));

    if (byId) {
      const data = await this._get(`/api/products/${idOrRef}${this._qs({ display: '[id,reference,name,quantity]' })}`);
      const p = data?.product;
      if (!p) return null;
      return { id: p.id, reference: p.reference, name: p.name?.[0]?.value ?? p.name, stock: p.quantity };
    }

    // Search by reference
    const qs = this._qs({
      'filter[reference]': idOrRef,
      display: '[id,reference,name,quantity]',
    });
    const data = await this._get(`/api/products${qs}`);
    const list = data?.products ?? [];
    if (list.length === 0) return null;
    const p = list[0];
    return { id: p.id, reference: p.reference, name: p.name?.[0]?.value ?? p.name, stock: p.quantity };
  }
}
