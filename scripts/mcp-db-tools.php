<?php
/**
 * MCP DB Tools — PHP 7.3 compatible.
 * Usage: ?secret=SECRET&tool=TOOL_NAME&param1=val1...
 *
 * id_lang = 2 → Español AR (único idioma activo en esta tienda)
 */
$secret = 'bTLk5SvOhwIfemioUWKclg6E2NC3yjG4';
if (($_GET['secret'] ?? '') !== $secret) {
    http_response_code(401);
    die(json_encode(array('error' => 'Unauthorized')));
}

header('Content-Type: application/json; charset=utf-8');

$tool = $_GET['tool'] ?? '';
if (!$tool) {
    http_response_code(400);
    die(json_encode(array('error' => 'tool parameter required')));
}

try {
    $pdo = new PDO("mysql:host=127.0.0.1;dbname=u466062032_WH9vP;charset=utf8",
                   'u466062032_MCtWP', 'Duplex8821',
                   array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC));
} catch (PDOException $e) {
    http_response_code(500);
    die(json_encode(array('error' => 'DB connection failed: ' . $e->getMessage())));
}

function validDate($d) { return $d && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d); }
function dbq($pdo, $sql, $params = array()) {
    $s = $pdo->prepare($sql); $s->execute($params); return $s->fetchAll();
}

try {
    switch ($tool) {

    // ── get_stock_breaks ─────────────────────────────────────────────────────
    case 'get_stock_breaks': {
        $threshold = isset($_GET['threshold']) ? (int)$_GET['threshold'] : 0;
        $rows = dbq($pdo, "
            SELECT p.id_product, p.reference, pl.name,
                   COALESCE(sa.quantity,0) AS stock, p.active
            FROM zc2b_product p
            JOIN zc2b_product_lang pl
                 ON pl.id_product = p.id_product AND pl.id_lang = 2 AND pl.id_shop = 1
            LEFT JOIN zc2b_stock_available sa
                 ON sa.id_product = p.id_product AND sa.id_product_attribute = 0 AND sa.id_shop = 1
            WHERE p.active = 1
              AND COALESCE(sa.quantity,0) <= :threshold
            ORDER BY stock ASC, pl.name ASC
        ", array(':threshold' => $threshold));

        $out = array();
        foreach ($rows as $r) {
            $out[] = array('id_product' => (int)$r['id_product'], 'reference' => $r['reference'],
                           'name' => $r['name'], 'stock' => (int)$r['stock'], 'active' => (bool)$r['active']);
        }
        echo json_encode(array('threshold' => $threshold, 'count' => count($out), 'products' => $out),
                         JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_product_activity_log ─────────────────────────────────────────────
    case 'get_product_activity_log': {
        $from   = $_GET['date_from'] ?? null;
        $to     = $_GET['date_to']   ?? null;
        $action = $_GET['action']    ?? null;
        if (!validDate($from) || !validDate($to)) {
            http_response_code(400); die(json_encode(array('error' => 'date_from and date_to required (YYYY-MM-DD)')));
        }
        $where  = "WHERE DATE(l.date_log) BETWEEN :from AND :to";
        $params = array(':from' => $from, ':to' => $to);
        if ($action === 'activated')   $where .= " AND l.active_after = 1 AND l.active_before = 0";
        if ($action === 'deactivated') $where .= " AND l.active_after = 0 AND l.active_before = 1";

        $rows = dbq($pdo, "
            SELECT l.id_product, pl.name, p.reference,
                   l.active_before, l.active_after, l.date_log
            FROM zc2b_product_activity_log l
            JOIN zc2b_product p       ON p.id_product  = l.id_product
            JOIN zc2b_product_lang pl ON pl.id_product = l.id_product
                                     AND pl.id_lang = 2 AND pl.id_shop = 1
            $where ORDER BY l.date_log DESC
        ", $params);

        $out = array();
        foreach ($rows as $r) {
            $out[] = array('id_product' => (int)$r['id_product'], 'name' => $r['name'],
                           'reference' => $r['reference'], 'active_before' => (int)$r['active_before'],
                           'active_after' => (int)$r['active_after'],
                           'action' => $r['active_after'] ? 'activated' : 'deactivated',
                           'date' => $r['date_log']);
        }
        echo json_encode(array('date_from' => $from, 'date_to' => $to, 'count' => count($out), 'changes' => $out),
                         JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_order_state_changes ──────────────────────────────────────────────
    case 'get_order_state_changes': {
        $from    = $_GET['date_from'] ?? null;
        $to      = $_GET['date_to']   ?? null;
        $stateId = isset($_GET['state_id']) ? (int)$_GET['state_id'] : null;
        if (!validDate($from) || !validDate($to)) {
            http_response_code(400); die(json_encode(array('error' => 'date_from and date_to required')));
        }
        $sf = $stateId ? "AND oh.id_order_state = :state_id" : "";
        $p  = array(':from' => $from, ':to' => $to);
        if ($stateId) $p[':state_id'] = $stateId;

        $rows = dbq($pdo, "
            SELECT oh.id_order, o.reference,
                   CONCAT(c.firstname,' ',c.lastname) AS customer_name,
                   prev_s.name  AS state_before,
                   curr_s.name  AS state_after,
                   oh.id_order_state AS new_state_id,
                   oh.date_add,
                   oh.id_employee,
                   CASE WHEN oh.id_employee IS NOT NULL AND oh.id_employee > 0
                        THEN CONCAT(e.firstname,' ',e.lastname)
                        ELSE NULL
                   END AS employee_name
            FROM zc2b_order_history oh
            JOIN zc2b_orders o         ON o.id_order      = oh.id_order
            JOIN zc2b_customer c       ON c.id_customer   = o.id_customer
            JOIN zc2b_order_state_lang curr_s
                 ON curr_s.id_order_state = oh.id_order_state AND curr_s.id_lang = 2
            LEFT JOIN zc2b_order_state_lang prev_s
                 ON prev_s.id_order_state = (
                    SELECT h2.id_order_state FROM zc2b_order_history h2
                    WHERE h2.id_order = oh.id_order AND h2.id_order_history < oh.id_order_history
                    ORDER BY h2.id_order_history DESC LIMIT 1)
                AND prev_s.id_lang = 2
            LEFT JOIN zc2b_employee e  ON e.id_employee = oh.id_employee
            WHERE DATE(oh.date_add) BETWEEN :from AND :to $sf
            ORDER BY oh.date_add DESC
        ", $p);

        $summary = array();
        $out = array();
        foreach ($rows as $r) {
            $key = $r['state_after'] ?? 'unknown';
            $summary[$key] = ($summary[$key] ?? 0) + 1;
            $out[] = array('id_order' => (int)$r['id_order'], 'reference' => $r['reference'],
                           'customer' => $r['customer_name'], 'state_before' => $r['state_before'] ?? '—',
                           'state_after' => $r['state_after'], 'new_state_id' => (int)$r['new_state_id'],
                           'date' => $r['date_add'],
                           'employee_id' => $r['id_employee'],
                           'employee' => $r['employee_name']);
        }
        arsort($summary);
        echo json_encode(array('date_from' => $from, 'date_to' => $to, 'total_changes' => count($out),
                               'summary_by_state' => $summary, 'changes' => $out),
                         JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── search_products ──────────────────────────────────────────────────────
    case 'search_products': {
        $noSku    = filter_var($_GET['no_sku']    ?? false, FILTER_VALIDATE_BOOLEAN);
        $noImage  = filter_var($_GET['no_image']  ?? false, FILTER_VALIDATE_BOOLEAN);
        $noPrice  = filter_var($_GET['no_price']  ?? false, FILTER_VALIDATE_BOOLEAN);
        $activeF  = isset($_GET['active']) ? filter_var($_GET['active'], FILTER_VALIDATE_BOOLEAN) : null;
        $noStock  = filter_var($_GET['no_stock']  ?? false, FILTER_VALIDATE_BOOLEAN);
        $withStk  = filter_var($_GET['with_stock']?? false, FILTER_VALIDATE_BOOLEAN);
        $queryTxt = trim($_GET['query'] ?? '');
        $limit    = min((int)($_GET['limit'] ?? 50), 200);

        $where  = array("1=1"); $params = array();
        if ($noSku)            $where[] = "(p.reference IS NULL OR p.reference = '')";
        if ($noImage)          $where[] = "img.id_image IS NULL";
        if ($noPrice)          $where[] = "(p.price IS NULL OR p.price = 0)";
        if ($activeF === true) $where[] = "p.active = 1";
        if ($activeF === false)$where[] = "p.active = 0";
        if ($noStock)          $where[] = "COALESCE(sa.quantity,0) <= 0";
        if ($withStk)          $where[] = "COALESCE(sa.quantity,0) > 0";
        if ($queryTxt !== '') { $where[] = "pl.name LIKE :query"; $params[':query'] = '%'.$queryTxt.'%'; }

        $whereSQL = implode(' AND ', $where);
        $rows = dbq($pdo, "
            SELECT p.id_product, pl.name, p.reference, p.price,
                   COALESCE(sa.quantity,0) AS stock, p.active,
                   CASE WHEN img.id_image IS NOT NULL THEN 1 ELSE 0 END AS has_image
            FROM zc2b_product p
            JOIN zc2b_product_lang pl
                 ON pl.id_product = p.id_product AND pl.id_lang = 2 AND pl.id_shop = 1
            LEFT JOIN zc2b_stock_available sa
                 ON sa.id_product = p.id_product AND sa.id_product_attribute = 0 AND sa.id_shop = 1
            LEFT JOIN zc2b_image img ON img.id_product = p.id_product AND img.cover = 1
            WHERE $whereSQL ORDER BY pl.name ASC LIMIT $limit
        ", $params);

        $out = array();
        foreach ($rows as $r) {
            $out[] = array('id_product' => (int)$r['id_product'], 'name' => $r['name'],
                           'reference' => $r['reference'], 'price' => (float)$r['price'],
                           'stock' => (int)$r['stock'], 'active' => (bool)$r['active'],
                           'has_image' => (bool)$r['has_image']);
        }
        echo json_encode(array('count' => count($out), 'products' => $out),
                         JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_top_products ─────────────────────────────────────────────────────
    case 'get_top_products': {
        $from    = $_GET['date_from'] ?? null;
        $to      = $_GET['date_to']   ?? null;
        $limit   = min((int)($_GET['limit'] ?? 10), 100);
        $orderBy = (($_GET['order_by'] ?? 'revenue') === 'quantity') ? 'units_sold' : 'revenue';
        if (!validDate($from) || !validDate($to)) {
            http_response_code(400); die(json_encode(array('error' => 'date_from and date_to required')));
        }
        $rows = dbq($pdo, "
            SELECT od.product_id, od.product_name, od.product_reference,
                   SUM(od.product_quantity)     AS units_sold,
                   SUM(od.total_price_tax_incl) AS revenue
            FROM zc2b_order_detail od
            JOIN zc2b_orders o ON o.id_order = od.id_order
            WHERE DATE(o.date_add) BETWEEN :from AND :to AND o.current_state != 6
            GROUP BY od.product_id, od.product_name, od.product_reference
            ORDER BY $orderBy DESC LIMIT $limit
        ", array(':from' => $from, ':to' => $to));

        $totalUnits = 0; $totalRev = 0;
        $out = array();
        foreach ($rows as $r) {
            $totalUnits += $r['units_sold']; $totalRev += $r['revenue'];
            $out[] = array('id_product' => (int)$r['product_id'], 'name' => $r['product_name'],
                           'reference' => $r['product_reference'], 'units_sold' => (int)$r['units_sold'],
                           'revenue' => number_format((float)$r['revenue'], 2, '.', ''));
        }
        echo json_encode(array('date_from' => $from, 'date_to' => $to, 'order_by' => $orderBy,
                               'total_units' => (int)$totalUnits,
                               'total_revenue' => number_format((float)$totalRev, 2, '.', ''),
                               'products' => $out), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_pending_orders_aging ─────────────────────────────────────────────
    case 'get_pending_orders_aging': {
        $stateId = isset($_GET['state_id']) ? (int)$_GET['state_id'] : 10;
        $minDays = isset($_GET['min_days'])  ? (int)$_GET['min_days']  : 3;
        $rows = dbq($pdo, "
            SELECT o.id_order, o.reference,
                   CONCAT(c.firstname,' ',c.lastname) AS customer_name,
                   c.email, o.total_paid_tax_incl, o.date_add AS order_date,
                   lh.last_change,
                   DATEDIFF(NOW(), lh.last_change) AS days_stuck
            FROM zc2b_orders o
            JOIN zc2b_customer c ON c.id_customer = o.id_customer
            JOIN (SELECT id_order, MAX(date_add) AS last_change
                  FROM zc2b_order_history GROUP BY id_order) lh ON lh.id_order = o.id_order
            WHERE o.current_state = :state_id
              AND DATEDIFF(NOW(), lh.last_change) >= :min_days
            ORDER BY days_stuck DESC
        ", array(':state_id' => $stateId, ':min_days' => $minDays));

        $out = array();
        foreach ($rows as $r) {
            $out[] = array('id_order' => (int)$r['id_order'], 'reference' => $r['reference'],
                           'customer' => $r['customer_name'], 'email' => $r['email'],
                           'total' => (float)$r['total_paid_tax_incl'],
                           'order_date' => $r['order_date'], 'last_state_change' => $r['last_change'],
                           'days_stuck' => (int)$r['days_stuck']);
        }
        echo json_encode(array('state_id' => $stateId, 'min_days' => $minDays,
                               'count' => count($out), 'orders' => $out),
                         JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_customer_stats ───────────────────────────────────────────────────
    case 'get_customer_stats': {
        $from    = $_GET['date_from'] ?? null;
        $to      = $_GET['date_to']   ?? null;
        $limit   = min((int)($_GET['limit'] ?? 20), 200);
        $orderBy = (($_GET['order_by'] ?? 'revenue') === 'orders') ? 'order_count' : 'revenue';
        if (!validDate($from) || !validDate($to)) {
            http_response_code(400); die(json_encode(array('error' => 'date_from and date_to required')));
        }
        $rows = dbq($pdo, "
            SELECT c.id_customer, CONCAT(c.firstname,' ',c.lastname) AS name, c.email,
                   COUNT(o.id_order)           AS order_count,
                   SUM(o.total_paid_tax_incl)  AS revenue,
                   MAX(o.date_add)             AS last_order_date,
                   first_o.first_ever
            FROM zc2b_orders o
            JOIN zc2b_customer c ON c.id_customer = o.id_customer
            JOIN (SELECT id_customer, MIN(date_add) AS first_ever
                  FROM zc2b_orders WHERE current_state != 6 GROUP BY id_customer) first_o
                 ON first_o.id_customer = c.id_customer
            WHERE DATE(o.date_add) BETWEEN :from AND :to AND o.current_state != 6
            GROUP BY c.id_customer, c.firstname, c.lastname, c.email, first_o.first_ever
            ORDER BY $orderBy DESC LIMIT $limit
        ", array(':from' => $from, ':to' => $to));

        $newC = 0; $recC = 0; $out = array();
        foreach ($rows as $r) {
            $isNew = ($r['first_ever'] >= $from . ' 00:00:00');
            if ($isNew) $newC++; else $recC++;
            $out[] = array('id_customer' => (int)$r['id_customer'], 'name' => $r['name'],
                           'email' => $r['email'], 'order_count' => (int)$r['order_count'],
                           'revenue' => number_format((float)$r['revenue'], 2, '.', ''),
                           'last_order_date' => $r['last_order_date'], 'is_new' => $isNew);
        }
        echo json_encode(array('date_from' => $from, 'date_to' => $to,
                               'unique_customers' => count($out), 'new_customers' => $newC,
                               'recurring' => $recC, 'customers' => $out),
                         JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_abandoned_carts ──────────────────────────────────────────────────
    case 'get_abandoned_carts': {
        $from      = $_GET['date_from'] ?? null;
        $to        = $_GET['date_to']   ?? null;
        $minAmount = isset($_GET['min_amount']) ? (float)$_GET['min_amount'] : 0;
        if (!validDate($from) || !validDate($to)) {
            http_response_code(400); die(json_encode(array('error' => 'date_from and date_to required')));
        }
        $rows = dbq($pdo, "
            SELECT cart.id_cart,
                   CASE WHEN c.id_customer > 0 THEN CONCAT(c.firstname,' ',c.lastname) ELSE 'Invitado' END AS customer_name,
                   c.email,
                   SUM(cp.quantity * p.price)    AS estimated_amount,
                   SUM(cp.quantity)              AS total_items,
                   COUNT(DISTINCT cp.id_product) AS product_count,
                   cart.date_add, cart.date_upd
            FROM zc2b_cart cart
            LEFT JOIN zc2b_orders o   ON o.id_cart     = cart.id_cart
            LEFT JOIN zc2b_customer c ON c.id_customer = cart.id_customer
            JOIN zc2b_cart_product cp ON cp.id_cart    = cart.id_cart
            JOIN zc2b_product p       ON p.id_product  = cp.id_product
            WHERE o.id_cart IS NULL AND DATE(cart.date_add) BETWEEN :from AND :to
            GROUP BY cart.id_cart, c.firstname, c.lastname, c.email, cart.date_add, cart.date_upd
            HAVING estimated_amount >= :min_amount
            ORDER BY estimated_amount DESC
        ", array(':from' => $from, ':to' => $to, ':min_amount' => $minAmount));

        $totalAmt = 0; $out = array();
        foreach ($rows as $r) {
            $totalAmt += $r['estimated_amount'];
            $out[] = array('id_cart' => (int)$r['id_cart'], 'customer' => $r['customer_name'],
                           'email' => $r['email'],
                           'estimated_amount' => number_format((float)$r['estimated_amount'], 2, '.', ''),
                           'total_items' => (int)$r['total_items'], 'product_count' => (int)$r['product_count'],
                           'created' => $r['date_add'], 'last_updated' => $r['date_upd']);
        }
        echo json_encode(array('date_from' => $from, 'date_to' => $to, 'min_amount' => $minAmount,
                               'count' => count($out),
                               'total_estimated' => number_format((float)$totalAmt, 2, '.', ''),
                               'carts' => $out), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_product_stock ────────────────────────────────────────────────────
    // Busca por SKU de combinación (zc2b_product_attribute.reference),
    // SKU de producto base (zc2b_product.reference), o id_product numérico.
    // Devuelve todas las combinaciones del producto con su stock individual.
    case 'get_product_stock': {
        $identifier = trim($_GET['identifier'] ?? '');
        if ($identifier === '') {
            http_response_code(400); die(json_encode(array('error' => 'identifier required')));
        }
        $isNumeric = ctype_digit($identifier);

        // SQL base: devuelve una fila por combinación
        $baseSql = "
            SELECT
                p.id_product,
                p.reference        AS base_reference,
                pl.name            AS product_name,
                p.active,
                pa.id_product_attribute,
                pa.reference       AS sku,
                COALESCE(sa.quantity, 0) AS stock,
                GROUP_CONCAT(
                    CONCAT(agl.name, ': ', al.name)
                    ORDER BY agl.id_attribute_group SEPARATOR ' / '
                )                  AS variant
            FROM zc2b_product p
            JOIN zc2b_product_lang pl
                 ON pl.id_product = p.id_product AND pl.id_lang = 2 AND pl.id_shop = 1
            LEFT JOIN zc2b_product_attribute pa
                 ON pa.id_product = p.id_product
            LEFT JOIN zc2b_stock_available sa
                 ON sa.id_product = p.id_product
                AND sa.id_product_attribute = COALESCE(pa.id_product_attribute, 0)
                AND sa.id_shop = 1
            LEFT JOIN zc2b_product_attribute_combination pac
                 ON pac.id_product_attribute = pa.id_product_attribute
            LEFT JOIN zc2b_attribute_lang al
                 ON al.id_attribute = pac.id_attribute AND al.id_lang = 2
            LEFT JOIN zc2b_attribute a
                 ON a.id_attribute = pac.id_attribute
            LEFT JOIN zc2b_attribute_group_lang agl
                 ON agl.id_attribute_group = a.id_attribute_group AND agl.id_lang = 2
        ";

        if ($isNumeric) {
            // Buscar por id_product
            $rows = dbq($pdo, "$baseSql WHERE p.id_product = :id GROUP BY pa.id_product_attribute, p.id_product",
                        array(':id' => (int)$identifier));
        } else {
            // Buscar primero por SKU de combinación
            $rows = dbq($pdo, "$baseSql WHERE pa.reference = :sku GROUP BY pa.id_product_attribute, p.id_product",
                        array(':sku' => $identifier));
            // Si no encuentra, buscar por SKU de producto base
            if (empty($rows)) {
                $rows = dbq($pdo, "$baseSql WHERE p.reference = :ref GROUP BY pa.id_product_attribute, p.id_product",
                            array(':ref' => $identifier));
            }
        }

        if (empty($rows)) {
            echo json_encode(array('found' => false, 'identifier' => $identifier),
                             JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            break;
        }

        $first = $rows[0];
        $combinations = array();
        $totalStock = 0;
        foreach ($rows as $r) {
            $combinations[] = array(
                'id_product_attribute' => (int)$r['id_product_attribute'],
                'sku'     => $r['sku'],
                'variant' => $r['variant'],
                'stock'   => (int)$r['stock'],
            );
            $totalStock += (int)$r['stock'];
        }

        echo json_encode(array(
            'found'          => true,
            'id_product'     => (int)$first['id_product'],
            'base_reference' => $first['base_reference'],
            'name'           => $first['product_name'],
            'active'         => (bool)$first['active'],
            'total_stock'    => $totalStock,
            'combinations'   => $combinations,
        ), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_products_stock_bulk ──────────────────────────────────────────────
    // Acepta múltiples SKUs o id_products separados por coma.
    // Devuelve stock total + detalle de combinaciones para cada uno.
    case 'get_products_stock_bulk': {
        $raw = trim($_GET['identifiers'] ?? '');
        if ($raw === '') {
            http_response_code(400); die(json_encode(array('error' => 'identifiers required (comma-separated SKUs or numeric IDs)')));
        }
        $identifiers = array_unique(array_filter(array_map('trim', explode(',', $raw))));
        if (count($identifiers) > 100) {
            http_response_code(400); die(json_encode(array('error' => 'max 100 identifiers per call')));
        }

        $numericIds = array();
        $skus       = array();
        foreach ($identifiers as $id) {
            if (ctype_digit($id)) $numericIds[] = (int)$id;
            else $skus[] = $id;
        }

        $results = array(); // keyed by identifier

        // Query combinada: devuelve filas para todas las combinaciones pedidas
        $baseSql = "
            SELECT
                p.id_product,
                p.reference        AS base_reference,
                pl.name            AS product_name,
                p.active,
                pa.id_product_attribute,
                pa.reference       AS sku,
                COALESCE(sa.quantity, 0) AS stock,
                GROUP_CONCAT(
                    CONCAT(agl.name, ': ', al.name)
                    ORDER BY agl.id_attribute_group SEPARATOR ' / '
                ) AS variant
            FROM zc2b_product p
            JOIN zc2b_product_lang pl
                 ON pl.id_product = p.id_product AND pl.id_lang = 2 AND pl.id_shop = 1
            LEFT JOIN zc2b_product_attribute pa
                 ON pa.id_product = p.id_product
            LEFT JOIN zc2b_stock_available sa
                 ON sa.id_product = p.id_product
                AND sa.id_product_attribute = COALESCE(pa.id_product_attribute, 0)
                AND sa.id_shop = 1
            LEFT JOIN zc2b_product_attribute_combination pac
                 ON pac.id_product_attribute = pa.id_product_attribute
            LEFT JOIN zc2b_attribute_lang al
                 ON al.id_attribute = pac.id_attribute AND al.id_lang = 2
            LEFT JOIN zc2b_attribute a
                 ON a.id_attribute = pac.id_attribute
            LEFT JOIN zc2b_attribute_group_lang agl
                 ON agl.id_attribute_group = a.id_attribute_group AND agl.id_lang = 2
        ";

        $allRows = array();

        if (!empty($numericIds)) {
            $ph = implode(',', array_fill(0, count($numericIds), '?'));
            $s = $pdo->prepare("$baseSql WHERE p.id_product IN ($ph) GROUP BY p.id_product, pa.id_product_attribute");
            $s->execute($numericIds);
            foreach ($s->fetchAll() as $r) $allRows[] = array_merge($r, array('_lookup' => (string)$r['id_product']));
        }

        if (!empty($skus)) {
            $ph = implode(',', array_fill(0, count($skus), '?'));
            // Try combination SKU first
            $s = $pdo->prepare("$baseSql WHERE pa.reference IN ($ph) GROUP BY p.id_product, pa.id_product_attribute");
            $s->execute($skus);
            $paRows = $s->fetchAll();
            $foundSkus = array_unique(array_column($paRows, 'sku'));
            foreach ($paRows as $r) $allRows[] = array_merge($r, array('_lookup' => $r['sku']));

            // For SKUs not found as combination references, try base product reference
            $missing = array_diff($skus, $foundSkus);
            if (!empty($missing)) {
                $ph2 = implode(',', array_fill(0, count($missing), '?'));
                $s2 = $pdo->prepare("$baseSql WHERE p.reference IN ($ph2) GROUP BY p.id_product, pa.id_product_attribute");
                $s2->execute(array_values($missing));
                foreach ($s2->fetchAll() as $r) $allRows[] = array_merge($r, array('_lookup' => $r['base_reference']));
            }
        }

        // Group by lookup key
        $grouped = array();
        foreach ($allRows as $r) {
            $key = $r['_lookup'];
            if (!isset($grouped[$key])) {
                $grouped[$key] = array(
                    'identifier'     => $key,
                    'id_product'     => (int)$r['id_product'],
                    'base_reference' => $r['base_reference'],
                    'name'           => $r['product_name'],
                    'active'         => (bool)$r['active'],
                    'total_stock'    => 0,
                    'combinations'   => array(),
                );
            }
            $grouped[$key]['combinations'][] = array(
                'id_product_attribute' => (int)$r['id_product_attribute'],
                'sku'     => $r['sku'],
                'variant' => $r['variant'],
                'stock'   => (int)$r['stock'],
            );
            $grouped[$key]['total_stock'] += (int)$r['stock'];
        }

        // Report not found
        $found = array_values($grouped);
        $notFound = array();
        foreach ($identifiers as $id) {
            if (!isset($grouped[$id])) $notFound[] = $id;
        }

        echo json_encode(array(
            'requested'  => count($identifiers),
            'found'      => count($found),
            'not_found'  => $notFound,
            'products'   => $found,
        ), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    // ── get_order_details ────────────────────────────────────────────────────
    case 'get_order_details': {
        $from   = $_GET['date_from'] ?? null;
        $to     = $_GET['date_to']   ?? null;
        $search = trim($_GET['search'] ?? '');
        $limit  = min((int)($_GET['limit'] ?? 200), 1000);

        if (!validDate($from) || !validDate($to)) {
            http_response_code(400);
            die(json_encode(array('error' => 'date_from and date_to required (YYYY-MM-DD)')));
        }
        $toFull = $to . ' 23:59:59';

        // excluded states: default [6=Cancelado, 7=Reembolsado], override via exclude_states=6,7,8
        $rawExclude = trim($_GET['exclude_states'] ?? '');
        if ($rawExclude !== '') {
            $excludeIds = array_map('intval', array_filter(explode(',', $rawExclude), 'ctype_digit'));
        } else {
            $excludeIds = array(6, 7);
        }

        $where  = array("o.date_add BETWEEN :from AND :to");
        $params = array(':from' => $from . ' 00:00:00', ':to' => $toFull);

        if (!empty($excludeIds)) {
            $ph = implode(',', $excludeIds); // safe — all integers
            $where[] = "o.current_state NOT IN ($ph)";
        }
        if ($search !== '') {
            $where[] = "(od.product_name LIKE :search OR od.product_reference LIKE :search)";
            $params[':search'] = '%' . $search . '%';
        }

        $whereSQL = implode(' AND ', $where);

        $rows = dbq($pdo, "
            SELECT
                od.product_id,
                od.product_name,
                od.product_reference,
                od.product_quantity          AS quantity,
                od.total_price_tax_excl      AS total_price,
                od.id_order                  AS order_id,
                o.reference                  AS order_reference,
                o.date_add                   AS order_date,
                osl.name                     AS order_state
            FROM zc2b_order_detail od
            JOIN zc2b_orders o
                 ON o.id_order = od.id_order
            LEFT JOIN zc2b_order_state_lang osl
                 ON osl.id_order_state = o.current_state AND osl.id_lang = 2
            WHERE $whereSQL
            ORDER BY o.date_add DESC, od.id_order, od.product_name
            LIMIT $limit
        ", $params);

        $totalUnits    = 0;
        $totalRevenue  = 0.0;
        $uniqueProducts = array();
        $lines = array();

        foreach ($rows as $r) {
            $totalUnits   += (int)$r['quantity'];
            $totalRevenue += (float)$r['total_price'];
            $uniqueProducts[$r['product_id']] = true;
            $lines[] = array(
                'product_id'        => (int)$r['product_id'],
                'product_name'      => $r['product_name'],
                'product_reference' => $r['product_reference'],
                'quantity'          => (int)$r['quantity'],
                'total_price'       => number_format((float)$r['total_price'], 2, '.', ''),
                'order_id'          => (int)$r['order_id'],
                'order_reference'   => $r['order_reference'],
                'order_date'        => $r['order_date'],
                'order_state'       => $r['order_state'],
            );
        }

        echo json_encode(array(
            'date_from'       => $from,
            'date_to'         => $to,
            'exclude_states'  => $excludeIds,
            'summary'         => array(
                'total_lines'     => count($lines),
                'total_units'     => $totalUnits,
                'total_revenue'   => number_format($totalRevenue, 2, '.', ''),
                'unique_products' => count($uniqueProducts),
            ),
            'lines' => $lines,
        ), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;
    }

    default:
        http_response_code(400);
        echo json_encode(array('error' => "Unknown tool: $tool"));
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(array('error' => $e->getMessage()));
}
