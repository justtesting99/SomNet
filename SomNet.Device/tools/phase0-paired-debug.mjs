import WebSocket from 'ws';

const BASE = 'http://localhost:5031';
const RS = '\x1e';

async function negotiate() {
  const res = await fetch(`${BASE}/hubs/hardware/negotiate?negotiateVersion=1`, { method: 'POST', body: '{}' });
  return res.json();
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'demo', password: 'demo' }),
}).then((r) => r.json());

const pair = await fetch(`${BASE}/api/devices/pair?subTarget=Slv66`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token.accessToken}` },
  body: JSON.stringify({ deviceId: 'esp32-PHASE0TEST03' }),
}).then((r) => r.json());

console.log('token payload', JSON.parse(Buffer.from(pair.accessToken.split('.')[1], 'base64url').toString()));

const negotiation = await negotiate();
const params = new URLSearchParams({ id: negotiation.connectionToken, access_token: pair.accessToken });
const ws = new WebSocket(BASE.replace(/^http/, 'ws') + `/hubs/hardware?${params}`);

ws.on('message', (d) => console.log('RX:', d.toString().replace(/\x1e/g, '<RS>')));
ws.on('open', () => ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS));
ws.on('close', (c, r) => console.log('CLOSE', c, r?.toString()));

setTimeout(() => process.exit(0), 5000);
