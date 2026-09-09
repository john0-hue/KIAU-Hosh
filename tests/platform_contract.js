import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(pkg.type, 'module');
assert.equal(pkg.scripts.start, 'node server.js');
assert.ok(pkg.dependencies.grammy);
assert.ok(pkg.dependencies.express);
assert.ok(pkg.dependencies.pg);
assert.ok(fs.existsSync(path.join(root, 'server.js')));
assert.ok(fs.existsSync(path.join(root, 'db-schema.sql')));
assert.ok(fs.existsSync(path.join(root, 'scripts', 'migrate.js')));
assert.ok(fs.existsSync(path.join(root, 'railway.toml')));
assert.ok(fs.existsSync(path.join(root, '.env.example')));
assert.ok(!fs.existsSync(path.join(root, 'schema.js')));
assert.ok(!fs.existsSync(path.join(root, 'tgcloud.json')));

for (const dir of ['handlers', 'lib', 'scripts']) {
  const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, dir, file), 'utf8');
    assert.ok(!source.includes("from 'sdk"), `${dir}/${file} still references Telegram Serverless sdk`);
    assert.ok(!source.includes('globalThis.bot'), `${dir}/${file} still references globalThis.bot`);
    assert.ok(!source.includes('require('), `${dir}/${file} still uses require()`);
    assert.ok(!source.includes('module.exports'), `${dir}/${file} still uses module.exports`);
  }
}

const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert.match(server, /process\.env\.PORT/);
assert.match(server, /webhookCallback\(telegramBot, 'express'/);
assert.match(server, /\/health/);
assert.match(server, /setWebhook/);

const schema = fs.readFileSync(path.join(root, 'db-schema.sql'), 'utf8');
for (const table of ['users','courses','semesters','group_links','submissions','course_change_requests','course_suggestions','user_sessions','audit_logs','bot_settings']) {
  assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(schema, /canonical_url TEXT NOT NULL UNIQUE/);
assert.match(schema, /normalized_name TEXT NOT NULL UNIQUE/);

console.log('Railway platform contract: OK');
