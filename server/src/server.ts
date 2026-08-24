/**
 * TFast Ads Manager — API bootstrap.
 * Auth middleware resolves the session server-side; tenant values never
 * come from client input.
 */
import Fastify from 'fastify';
import { config } from './config.js';
import { verifyToken } from './http/auth.js';
import { registerRoutes } from './routes.js';
import { serveWeb } from './web.js';
import { startScheduler } from './scheduler.js';

const app = Fastify({ logger: { level: config.LOG_LEVEL } });

// ── Auth + tenant middleware ──────────────────────────────
// UI files (/, /app.js, /styles.css) are public; every /api/* data route
// requires a valid session. Tenant values never come from client input.
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/') || req.url.startsWith('/api/v1/auth/') || req.url.startsWith('/api/v1/oauth/')) return;
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
  const session = verifyToken(auth.slice(7));
  if (!session) return reply.code(401).send({ error: 'UNAUTHORIZED' });
  req.session = session;
});

app.get('/health', async () => ({
  ok: true,
  service: 'TFast Ads Manager API',
  version: '0.1.0',
  tenants_enforced: true,
}));

registerRoutes(app);
serveWeb(app);

const port = config.PORT;
app.listen({ port, host: '127.0.0.1' }).then(() => {
  app.log.info(`TFast Ads Manager API listening on http://127.0.0.1:${port}`);
  startScheduler();
});
