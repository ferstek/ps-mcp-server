<?php
$secret = 'bTLk5SvOhwIfemioUWKclg6E2NC3yjG4';
$token  = $_GET['secret'] ?? '';
if ($token !== $secret) { http_response_code(401); die('Unauthorized'); }

$pdo = new PDO("mysql:host=127.0.0.1;dbname=u466062032_WH9vP;charset=utf8",
               'u466062032_MCtWP', 'Duplex8821',
               [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$results = [];

// ── Drop existing triggers ────────────────────────────────────────────────────
foreach (['trg_order_detail_after_insert','trg_order_detail_before_update','trg_order_detail_before_delete'] as $t) {
    $pdo->exec("DROP TRIGGER IF EXISTS `$t`");
    $results[] = "DROP $t: OK";
}

// ── INSERT trigger ────────────────────────────────────────────────────────────
$pdo->exec("
CREATE TRIGGER trg_order_detail_after_insert
AFTER INSERT ON zc2b_order_detail
FOR EACH ROW
INSERT INTO zc2b_order_detail_log
  (action, id_order, id_order_detail, product_id, product_name,
   product_quantity, product_quantity_new,
   unit_price_tax_incl, unit_price_tax_incl_new,
   id_employee)
VALUES
  ('INSERT', NEW.id_order, NEW.id_order_detail, NEW.product_id, NEW.product_name,
   NULL, NEW.product_quantity,
   NULL, NEW.unit_price_tax_incl,
   NULL)
");
$results[] = "CREATE trg_order_detail_after_insert: OK";

// ── UPDATE trigger ────────────────────────────────────────────────────────────
$pdo->exec("
CREATE TRIGGER trg_order_detail_before_update
BEFORE UPDATE ON zc2b_order_detail
FOR EACH ROW
BEGIN
  IF OLD.product_quantity <> NEW.product_quantity
     OR OLD.unit_price_tax_incl <> NEW.unit_price_tax_incl THEN
    INSERT INTO zc2b_order_detail_log
      (action, id_order, id_order_detail, product_id, product_name,
       product_quantity, product_quantity_new,
       unit_price_tax_incl, unit_price_tax_incl_new,
       id_employee)
    VALUES
      ('UPDATE', OLD.id_order, OLD.id_order_detail, OLD.product_id, OLD.product_name,
       OLD.product_quantity, NEW.product_quantity,
       OLD.unit_price_tax_incl, NEW.unit_price_tax_incl,
       NULL);
  END IF;
END
");
$results[] = "CREATE trg_order_detail_before_update: OK";

// ── DELETE trigger ────────────────────────────────────────────────────────────
$pdo->exec("
CREATE TRIGGER trg_order_detail_before_delete
BEFORE DELETE ON zc2b_order_detail
FOR EACH ROW
INSERT INTO zc2b_order_detail_log
  (action, id_order, id_order_detail, product_id, product_name,
   product_quantity, product_quantity_new,
   unit_price_tax_incl, unit_price_tax_incl_new,
   id_employee)
VALUES
  ('DELETE', OLD.id_order, OLD.id_order_detail, OLD.product_id, OLD.product_name,
   OLD.product_quantity, NULL,
   OLD.unit_price_tax_incl, NULL,
   NULL)
");
$results[] = "CREATE trg_order_detail_before_delete: OK";

header('Content-Type: application/json');
echo json_encode(['status' => 'done', 'results' => $results], JSON_PRETTY_PRINT);
