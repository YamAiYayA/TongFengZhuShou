<?php
return [
  'db_host' => getenv('ASSISTANT_DB_HOST') ?: '127.0.0.1',
  'db_port' => (int)(getenv('ASSISTANT_DB_PORT') ?: 3306),
  'db_name' => getenv('ASSISTANT_DB_NAME') ?: 'assistant',
  'db_user' => getenv('ASSISTANT_DB_USER') ?: 'assistant',
  'db_pass' => getenv('ASSISTANT_DB_PASS') ?: '',
  'deepseek_api_key' => getenv('DEEPSEEK_API_KEY') ?: '',
];
