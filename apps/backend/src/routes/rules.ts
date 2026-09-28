import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../../../../rules.json');

export async function rulesRoutes(app: FastifyInstance) {
  app.get('/api/rules', async (_req, reply) => {
    try {
      const raw = await readFile(RULES_PATH, 'utf-8');
      const rules = JSON.parse(raw);
      return reply.send(rules);
    } catch {
      return reply.status(500).send({ error: 'Could not load rules.json' });
    }
  });
}
