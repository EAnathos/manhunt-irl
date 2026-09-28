import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { gameRoutes } from './routes/game.js';
import { rulesRoutes } from './routes/rules.js';
import { wsRoutes } from './routes/ws.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(websocket);
await app.register(gameRoutes);
await app.register(rulesRoutes);
await app.register(wsRoutes);

app.get('/health', async () => ({ status: 'ok' }));

const PORT = Number(process.env.PORT) || 3001;

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info(`ManHunt backend listening on :${PORT}`);
});
