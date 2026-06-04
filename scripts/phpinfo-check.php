<?php
if (($_GET['secret'] ?? '') !== 'bTLk5SvOhwIfemioUWKclg6E2NC3yjG4') { die('no'); }
echo json_encode(['php' => PHP_VERSION, 'major' => PHP_MAJOR_VERSION]);
