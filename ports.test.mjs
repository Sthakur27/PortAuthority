import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSs } from './ports.mjs';

test('ss parses IPv4, IPv6, wildcard endpoints and spaced commands, deduplicating sockets', () => {
  const result = parseSs(`LISTEN 0 511 *:3000 *:* users:(("next-server (v1",pid=42,fd=22))
LISTEN 0 511 [::]:3001 [::]:* users:(("node",pid=43,fd=24))
LISTEN 0 511 127.0.0.1:3002 0.0.0.0:* users:(("node",pid=44,fd=25))
LISTEN 0 511 *:3000 *:* users:(("next-server (v1",pid=42,fd=26))
LISTEN 0 511 *:3003 *:*`);
  assert.deepEqual(result.map(({pid, command, port}) => ({pid, command, port})), [
    {pid:42, command:'next-server (v1', port:3000},
    {pid:43, command:'node', port:3001},
    {pid:44, command:'node', port:3002},
  ]);
});
