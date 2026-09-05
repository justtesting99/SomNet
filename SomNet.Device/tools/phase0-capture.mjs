/**
 * Phase 0 — capture SomNet /hubs/hardware SignalR JSON protocol traffic.
 * Run with API at http://localhost:5031
 */
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const BASE = process.env.SOMNET_API ?? 'http://localhost:5031';
const DEVICE_ID = process.env.TEST_DEVICE_ID ?? 'esp32-PHASE0TEST01';
const SUB_TARGET = process.env.SUB_TARGET ?? 'Slv66';
const RS = '\x1e';

const captures = {
  meta: { base: BASE, deviceId: DEVICE_ID, subTarget: SUB_TARGET, capturedAt: new Date().toISOString() },
  sections: {},
};

function splitFrames(data) {
  return data.toString().split(RS).filter(Boolean);
}

async function negotiate() {
  const url = `${BASE}/hubs/hardware/negotiate?negotiateVersion=1`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error(`Negotiate failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function connectHub(extraQuery = {}) {
  return new Promise(async (resolve, reject) => {
    const negotiation = await negotiate();
    const params = new URLSearchParams({ id: negotiation.connectionToken, ...extraQuery });
    const wsUrl = BASE.replace(/^http/, 'ws') + `/hubs/hardware?${params}`;
    const ws = new WebSocket(wsUrl);
    const inbox = [];
    const outbox = [];

    ws.on('error', reject);

    ws.on('open', () => {
      const handshakeSend = JSON.stringify({ protocol: 'json', version: 1 }) + RS;
      outbox.push({ label: 'handshakeSend', raw: handshakeSend.replace(RS, '<RS>') });
      ws.send(handshakeSend);
    });

    ws.on('message', (data) => {
      for (const frame of splitFrames(data)) {
        inbox.push(frame);
        try {
          const msg = JSON.parse(frame);
          if (Object.keys(msg).length === 0 && outbox.some((o) => o.label === 'handshakeSend') && !outbox.some((o) => o.label === 'handshakeReceive')) {
            outbox.push({ label: 'handshakeReceive', raw: frame });
          }
        } catch {
          /* ignore */
        }
      }
    });

    const waitFor = (predicate, timeoutMs = 15000) =>
      new Promise((res, rej) => {
        const start = Date.now();
        const tick = () => {
          const parsed = inbox.map((f) => {
            try {
              return JSON.parse(f);
            } catch {
              return null;
            }
          });
          const hit = parsed.find(predicate);
          if (hit) return res(hit);
          if (Date.now() - start > timeoutMs) {
            return rej(new Error(`waitFor timeout; inbox=${JSON.stringify(parsed)}`));
          }
          setTimeout(tick, 50);
        };
        tick();
      });

    const waitForHandshake = () =>
      waitFor((m) => m && typeof m === 'object' && Object.keys(m).length === 0, 10000);

    resolve({
      ws,
      wsUrl: wsUrl.replace(/access_token=[^&]+/, 'access_token=<REDACTED>'),
      inbox,
      outbox,
      waitFor,
      waitForHandshake,
      sendInvocation(target, args) {
        const payload = JSON.stringify({ type: 1, invocationId: String(Date.now()), target, arguments: args }) + RS;
        outbox.push({ label: `invoke:${target}`, raw: payload.replace(RS, '<RS>') });
        ws.send(payload);
      },
      close() {
        return new Promise((r) => {
          if (ws.readyState === WebSocket.CLOSED) return r();
          ws.once('close', () => r());
          ws.close();
          setTimeout(r, 1000);
        });
      },
    });
  });
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'demo' }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const body = await res.json();
  return body.token.accessToken;
}

function redactToken(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => {
    if (typeof v === 'string' && v.split('.').length === 3 && v.length > 40) return '<JWT_REDACTED>';
    return v;
  }));
}

async function main() {
  console.log('Phase 0 capture starting…');

  // A — unpaired connect
  const unpaired = await connectHub({ deviceId: DEVICE_ID });
  const handshakeReceive = await unpaired.waitForHandshake();
  captures.sections.unpairedConnect = {
    url: unpaired.wsUrl,
    handshakeSend: unpaired.outbox.find((o) => o.label === 'handshakeSend')?.raw,
    handshakeReceive,
    connectionOpen: unpaired.ws.readyState === WebSocket.OPEN,
    recordSeparator: '0x1E',
  };

  // B — pair via REST
  const operatorJwt = await login();
  const pairRes = await fetch(`${BASE}/api/devices/pair?subTarget=${encodeURIComponent(SUB_TARGET)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorJwt}`,
    },
    body: JSON.stringify({ deviceId: DEVICE_ID }),
  });
  const pairBody = await pairRes.json();
  if (!pairRes.ok) throw new Error(`Pair failed: ${pairRes.status} ${JSON.stringify(pairBody)}`);

  const pairDeviceMsg = await unpaired.waitFor((m) => m?.type === 1 && m?.target === 'PairDevice');
  captures.sections.pairDevice = {
    restResponse: redactToken(pairBody),
    signalRMessage: redactToken(pairDeviceMsg),
    arguments0Fields: Object.keys(pairDeviceMsg.arguments?.[0] ?? {}),
  };

  const deviceJwt = pairBody.accessToken;

  await unpaired.close();

  // C — paired reconnect
  const paired = await connectHub({ access_token: deviceJwt });
  await paired.waitForHandshake();

  const statusRes = await fetch(`${BASE}/api/devices/status?subTarget=${encodeURIComponent(SUB_TARGET)}`, {
    headers: { Authorization: `Bearer ${operatorJwt}` },
  });
  const statusBody = await statusRes.json();

  captures.sections.pairedConnect = {
    urlPattern: paired.wsUrl,
    handshakeReceive: paired.inbox[0] ?? null,
    deviceStatus: statusBody,
  };

  // D — ExecuteCommand (ack in parallel so REST does not hit 10s timeout)
  const executePromise = paired.waitFor((m) => m?.type === 1 && m?.target === 'ExecuteCommand');

  const commandPromise = fetch(`${BASE}/api/devices/commands`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorJwt}`,
    },
    body: JSON.stringify({
      subTarget: SUB_TARGET,
      commandKey: 'stroke',
      payloadJson: '{"powerPercent":50,"strokeMs":200}',
    }),
  }).then((r) => r.json());

  const executeMsg = await executePromise;
  const correlationId = executeMsg.arguments?.[0]?.correlationId;

  const ackSend = {
    type: 1,
    invocationId: 'ack1',
    target: 'AckCommand',
    arguments: [{ correlationId, success: true, message: 'stroke complete' }],
  };
  paired.ws.send(JSON.stringify(ackSend) + RS);

  const commandBody = await commandPromise;

  captures.sections.executeCommand = {
    restResponse: commandBody,
    signalRMessage: redactToken(executeMsg),
    arguments0Fields: Object.keys(executeMsg.arguments?.[0] ?? {}),
    payloadJsonInner: executeMsg.arguments?.[0]?.payloadJson,
  };

  // E — AckCommand (already sent above; record envelope)
  captures.sections.ackCommand = {
    clientSend: ackSend,
    note: 'HardwareCommandAckDto has correlationId, success, message — no resultJson field in API today',
  };

  // F — ping (wait up to 20s for server ping type 6)
  try {
    const ping = await paired.waitFor((m) => m?.type === 6, 20000);
    captures.sections.keepalive = {
      pingMessage: ping,
      pongReply: { type: 6, note: 'Client echoes identical type-6 ping frame' },
    };
    paired.ws.send(JSON.stringify({ type: 6 }) + RS);
  } catch {
    captures.sections.keepalive = {
      pingMessage: null,
      note: 'No server ping observed within 20s — document type 6 from SignalR spec; hub may ping on longer interval',
    };
  }

  // Invalid connect — no deviceId, no token
  try {
    const bad = await Promise.race([
      connectHub({}),
      new Promise((_, rej) => setTimeout(() => rej(new Error('invalid connect timeout')), 3000)),
    ]);
    await new Promise((r) => setTimeout(r, 300));
    captures.sections.invalidConnect = {
      closed: bad.ws.readyState === WebSocket.CLOSED,
      readyState: bad.ws.readyState,
      inbox: bad.inbox.slice(0, 3),
    };
    await bad.close().catch(() => {});
  } catch (e) {
    captures.sections.invalidConnect = { error: String(e.message) };
  }

  await paired.close();

  const outputPath = process.env.CAPTURE_OUTPUT ?? 'd:/MoreRepos/SomNet/SomNet.Device/tools/capture-result.json';
  const json = JSON.stringify(captures, null, 2);
  writeFileSync(outputPath, json, 'utf8');
  console.error(`Wrote ${outputPath} (${json.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
