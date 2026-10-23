import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { DatabaseService } from './db/index.js';
import { MqttService } from './mqtt/client.js';
import { runMqttMock } from './mqtt/mock.js';
import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '8090', 10);
const HOST = process.env.HOST || '0.0.0.0';
const isMock = process.env.MOCK_MQTT === 'true';

export async function startServer() {
  const db = new DatabaseService(
    process.env.DATABASE_PATH || './data/zigbee_sentinel.db'
  );

  const mqttService = new MqttService({
    db,
    brokerUrl: process.env.MQTT_URL,
    baseTopic: process.env.Z2M_BASE_TOPIC,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    mock: isMock,
  });

  mqttService.on('error', (err) => console.error('[MQTT Error]', err.message));

  // Retention purge on startup & daily interval
  const retentionDays = parseInt(process.env.HISTORY_RETENTION_DAYS || '60', 10);
  db.purgeOldRecords(retentionDays);
  const purgeTimer = setInterval(() => {
    db.purgeOldRecords(retentionDays);
  }, 24 * 3600 * 1000);
  purgeTimer.unref();

  let mockSimulator: { stop: () => void } | null = null;
  if (isMock) {
    console.log('[Mock] Starting MQTT Mock simulator...');
    mockSimulator = runMqttMock(mqttService, db);
  }

  const app = await buildApp({ db, mqttService });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    if (mockSimulator) {
      mockSimulator.stop();
    }
    try {
      await app.close();
      await mqttService.close();
      db.close();
      console.log('Server shut down cleanly.');
    } catch (err) {
      console.error('Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Zigbee Sentinel server listening on http://${HOST}:${PORT}`);
    return app;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Auto-start when executed directly
const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution || process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
  });
}
