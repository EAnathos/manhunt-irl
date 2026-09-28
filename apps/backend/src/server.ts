import Fastify from 'fastify';

const app = Fastify({ logger: true });

const PORT = Number(process.env.PORT) || 3001;

app.get('/health', async () => ({ status: 'ok' }));

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info(`ManHunt backend listening on :${PORT}`);
});
