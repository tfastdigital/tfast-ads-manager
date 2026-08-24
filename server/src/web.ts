/**
 * Static serving for the TFast Agency Command Center SPA (web/).
 * Zero-build: plain HTML/CSS/JS. UI routes are public; all data goes
 * through the authenticated /api/v1 surface.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

export function serveWeb(app: FastifyInstance): void {
  app.get('/', async (_req, reply) => {
    reply.type('text/html; charset=utf-8');
    return readFile(join(WEB_DIR, 'index.html'), 'utf-8');
  });
  app.get('/app.js', async (_req, reply) => {
    reply.type('text/javascript; charset=utf-8');
    return readFile(join(WEB_DIR, 'app.js'), 'utf-8');
  });
  app.get('/styles.css', async (_req, reply) => {
    reply.type('text/css; charset=utf-8');
    return readFile(join(WEB_DIR, 'styles.css'), 'utf-8');
  });
  app.get('/enhancements.css', async (_req, reply) => {
    reply.type('text/css; charset=utf-8');
    return readFile(join(WEB_DIR, 'enhancements.css'), 'utf-8');
  });
}
