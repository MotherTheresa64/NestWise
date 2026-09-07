import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { WebSocket } from 'ws';
import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Pushes invalidations only. Actual care data is fetched over the authorized cursor API. */
export async function registerRealtime(app: FastifyInstance, pool: pg.Pool) {
  await app.register(websocket, { options: { maxPayload: 2048 } });
  const peers = new Map<WebSocket, { householdId: string; tokenHash: string }>();
  let listener: pg.PoolClient | null = null; let reconnect: ReturnType<typeof setTimeout> | undefined; let stopped = false;
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8081').split(',');
  async function authorized(peer: { householdId: string; tokenHash: string }) {
    const result = await pool.query('SELECT 1 FROM sessions s JOIN members m ON m.user_id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND m.household_id=$2', [peer.tokenHash, peer.householdId]);
    return !!result.rowCount;
  }
  async function signal(socket: WebSocket, type: 'ready' | 'changed' | 'heartbeat') {
    const peer = peers.get(socket); if (!peer || socket.readyState !== 1) return;
    try {
      if (!await authorized(peer)) { socket.close(4403, 'Session or household access ended'); return; }
      if (socket.bufferedAmount > 8192) { socket.close(1013, 'Reconnect to catch up'); return; }
      if (socket.readyState === 1) socket.send(JSON.stringify({ type }));
    } catch { socket.close(1011, 'Database unavailable'); }
  }
  async function listen() {
    if (stopped) return;
    try {
      const client = await pool.connect();
      if (stopped) { client.release(); return; }
      listener = client;
      const lost = () => {
        if (listener !== client) return;
        listener = null; client.release(true);
        for (const socket of peers.keys()) socket.close(1012, 'Change stream reconnecting');
        if (!stopped) reconnect = setTimeout(() => void listen(), 1000);
      };
      client.on('error', lost); client.on('end', lost);
      client.on('notification', message => { for (const [socket, peer] of peers) if (peer.householdId === message.payload) void signal(socket, 'changed'); });
      await client.query('LISTEN nestwise_changes');
      for (const socket of peers.keys()) void signal(socket, 'ready');
    } catch { if (!stopped) reconnect = setTimeout(() => void listen(), 1000); }
  }
  app.get('/realtime', { websocket: true, preValidation: async (request, reply) => {
    if (request.headers.origin && !allowedOrigins.includes(request.headers.origin)) return reply.code(403).send({ error: 'Origin not allowed' });
  } }, socket => {
    let authenticating = false;
    const deadline = setTimeout(() => socket.close(4401, 'Authentication required'), 5000);
    socket.on('close', () => { clearTimeout(deadline); peers.delete(socket); });
    socket.on('error', () => { peers.delete(socket); });
    socket.on('message', data => {
      if (peers.has(socket) || authenticating) { socket.close(4400, 'One subscription per connection'); return; }
      authenticating = true;
      void (async () => {
        try {
          const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), householdId: z.string().uuid() }).strict().parse(JSON.parse(data.toString()));
          const peer = { householdId: input.householdId, tokenHash: createHash('sha256').update(input.token).digest('hex') };
          if (!await authorized(peer)) { socket.close(4403, 'Access denied'); return; }
          if (socket.readyState !== 1) return;
          if (!listener) { socket.close(1013, 'Change stream unavailable'); return; }
          peers.set(socket, peer); clearTimeout(deadline); await signal(socket, 'ready');
        } catch { socket.close(4401, 'Invalid authentication'); }
      })();
    });
  });
  // Heartbeats detect dead connections and revoked/expired sessions, without fetching care snapshots.
  const heartbeat = setInterval(() => { for (const socket of peers.keys()) void signal(socket, 'heartbeat'); }, 25000);
  app.addHook('onReady', listen);
  app.addHook('preClose', async () => {
    stopped = true; clearInterval(heartbeat); clearTimeout(reconnect);
    for (const socket of peers.keys()) socket.close(1001, 'Server stopping');
    if (listener) { const client = listener; listener = null; await client.query('UNLISTEN nestwise_changes'); client.release(); }
  });
}
