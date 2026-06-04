<?php
$secret = 'bTLk5SvOhwIfemioUWKclg6E2NC3yjG4';
if (($_GET['secret'] ?? '') !== $secret) { http_response_code(401); die('Unauthorized'); }

$pdo = new PDO("mysql:host=127.0.0.1;dbname=u466062032_WH9vP;charset=utf8",
               'u466062032_MCtWP', 'Duplex8821',
               [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$steps = [];

// 1. Create log table
$pdo->exec("
CREATE TABLE IF NOT EXISTS zc2b_product_activity_log (
  id_log          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_product      INT UNSIGNED NOT NULL,
  active_before   TINYINT(1) NOT NULL,
  active_after    TINYINT(1) NOT NULL,
  id_employee     INT UNSIGNED DEFAULT NULL,
  date_log        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product  (id_product),
  INDEX idx_date_log (date_log)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");
$steps[] = "CREATE TABLE zc2b_product_activity_log: OK";

// 2. Drop + recreate trigger
$pdo->exec("DROP TRIGGER IF EXISTS trg_product_active_after_update");
$steps[] = "DROP TRIGGER: OK";

$pdo->exec("
CREATE TRIGGER trg_product_active_after_update
AFTER UPDATE ON zc2b_product
FOR EACH ROW
BEGIN
  IF OLD.active <> NEW.active THEN
    INSERT INTO zc2b_product_activity_log
      (id_product, active_before, active_after, id_employee)
    VALUES
      (OLD.id_product, OLD.active, NEW.active, NULL);
  END IF;
END
");
$steps[] = "CREATE TRIGGER trg_product_active_after_update: OK";

header('Content-Type: application/json');
echo json_encode(['status' => 'done', 'steps' => $steps], JSON_PRETTY_PRINT);
