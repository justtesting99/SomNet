import WebSocket from 'ws';

const BASE = 'http://localhost:5031';
const DEVICE_ID = 'esp32-PHASE0TEST01';
const RS = '\x1e';

async function negotiate() {
  const res = await fetch(`${BASE}/hubs/hardware/negotiate?negotiateVersion=1`, { method: 'POST', body: '{}' });
  return res.json();
}

const negotiation = await negotiate();
const params = new URLSearchParams({ id: negotiation.connectionToken, deviceId: DEVICE_ID });
const ws = new WebSocket(BASE.replace(/^http/, 'ws') + `/hubs/hardware?${params}`);

ws.on('message', (d) => {
  for (const f of d.toString().split(RS).filter(Boolean)) {
    console.log('RX:', f);
  }
});

ws.on('open', () => {
  console.log('OPEN');
  ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS);
  setTimeout(async () => {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'demo' }),
    }).then((r) => r.json());
    const pair = await fetch(`${BASE}/api/devices/pair?subTarget=Slv66`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token.accessToken}` },
      body: JSON.stringify({ deviceId: DEVICE_ID }),
    }).then((r) => r.json());
    console.log('PAIR REST:', JSON.stringify(pair, null, 2));
  }, 1000);
});

ws.on('close', (c, r) => console.log('CLOSE', c, r?.toString()));

setTimeout(() => process.exit(0), 8000);
