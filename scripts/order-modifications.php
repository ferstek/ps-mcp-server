<?php
/**
 * MCP API endpoint: order_modifications
 * Queries zc2b_order_modifications_view and returns JSON.
 * Protected by a secret token.
 */

// ── Auth ──────────────────────────────────────────────────────────────────────
$secret = 'bTLk5SvOhwIfemioUWKclg6E2NC3yjG4';
$token  = $_SERVER['HTTP_X_MCP_SECRET'] ?? $_GET['secret'] ?? '';
if ($token !== $secret) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// ── Params ────────────────────────────────────────────────────────────────────
$date_from = $_GET['date_from'] ?? null;
$date_to   = $_GET['date_to']   ?? null;

if (!$date_from || !$date_to) {
    http_response_code(400);
    echo json_encode(['error' => 'date_from and date_to are required (YYYY-MM-DD)']);
    exit;
}

// Basic date validation
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date_from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date_to)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid date format. Use YYYY-MM-DD']);
    exit;
}

// ── DB ────────────────────────────────────────────────────────────────────────
$host   = '127.0.0.1';
$dbname = 'u466062032_WH9vP';
$user   = 'u466062032_MCtWP';
$pass   = 'Duplex8821';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]);
    exit;
}

// ── Query ─────────────────────────────────────────────────────────────────────
$sql = "
    SELECT *
    FROM zc2b_order_modifications_view
    WHERE DATE(date_log) BETWEEN :date_from AND :date_to
    ORDER BY id_order, date_log
";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':date_from' => $date_from, ':date_to' => $date_to]);
    $rows = $stmt->fetchAll();
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Query failed: ' . $e->getMessage()]);
    exit;
}

// ── Group by order ────────────────────────────────────────────────────────────
$grouped = [];
foreach ($rows as $row) {
    $key = $row['id_order'];
    if (!isset($grouped[$key])) {
        $grouped[$key] = [
            'id_order'        => $row['id_order'],
            'order_reference' => $row['order_reference'] ?? null,
            'customer_name'   => $row['customer_name']   ?? null,
            'customer_email'  => $row['customer_email']  ?? null,
            'modifications'   => [],
        ];
    }
    $grouped[$key]['modifications'][] = [
        'action'                => $row['action'],
        'product_name'          => $row['product_name'],
        'qty_before'            => $row['product_quantity'],
        'qty_after'             => $row['product_quantity_new'],
        'qty_diff'              => isset($row['qty_diff']) ? $row['qty_diff'] : null,
        'price_before'          => $row['unit_price_tax_incl'],
        'price_after'           => $row['unit_price_tax_incl_new'],
        'employee'              => $row['employee_name'] ?? null,
        'date'                  => $row['date_log'],
    ];
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'date_from'      => $date_from,
    'date_to'        => $date_to,
    'orders_modified'=> count($grouped),
    'total_changes'  => count($rows),
    'orders'         => array_values($grouped),
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
