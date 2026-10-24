import { DatabaseService } from '../db/index.js';
import { MqttService } from './client.js';

export function runMqttMock(
  mqttService: MqttService,
  db: DatabaseService
): { stop: () => void } {
  const baseTopic = mqttService.baseTopic;

  const mockDevicesList = [
    {
      ieee_address: '0x00124b001cd12345',
      friendly_name: 'Coordinator',
      type: 'Coordinator',
    },
    {
      ieee_address: '0x00158d0001aaaa01',
      friendly_name: 'Prise Salon',
      type: 'Router',
      model_id: 'TS011F',
      definition: { vendor: 'Tuya', model: 'Smart Plug' },
      power_source: 'Mains',
    },
    {
      ieee_address: '0x00158d0001aaaa02',
      friendly_name: 'Ampoule Cuisine',
      type: 'Router',
      model_id: 'LWB010',
      definition: { vendor: 'Philips', model: 'Hue White' },
      power_source: 'Mains',
    },
    {
      ieee_address: '0x00158d0001aaaa03',
      friendly_name: 'Capteur Temperature',
      type: 'EndDevice',
      model_id: 'WSDCGQ11LM',
      definition: { vendor: 'Aqara', model: 'Temperature & Humidity Sensor' },
      power_source: 'Battery',
    },
    {
      ieee_address: '0x00158d0001aaaa04',
      friendly_name: 'Capteur Porte Entree',
      type: 'EndDevice',
      model_id: 'MCCGQ11LM',
      definition: { vendor: 'Aqara', model: 'Door & Window Sensor' },
      power_source: 'Battery',
    },
  ];

  // 1. Publish bridge info and state
  mqttService.handleMessage(`${baseTopic}/bridge/state`, Buffer.from('online'));
  mqttService.handleMessage(
    `${baseTopic}/bridge/info`,
    Buffer.from(
      JSON.stringify({
        version: '1.36.0',
        coordinator: {
          type: 'ConBee2/RaspBee2',
          meta: { version: '0x26720700' },
        },
        log_level: 'info',
        permit_join: false,
      })
    )
  );

  // 2. Publish bridge devices
  mqttService.handleMessage(
    `${baseTopic}/bridge/devices`,
    Buffer.from(JSON.stringify(mockDevicesList))
  );

  // 3. Publish device states (telemetry)
  mqttService.handleMessage(
    `${baseTopic}/Prise Salon`,
    Buffer.from(JSON.stringify({ state: 'ON', linkquality: 120, power: 35 }))
  );
  mqttService.handleMessage(
    `${baseTopic}/Ampoule Cuisine`,
    Buffer.from(JSON.stringify({ state: 'OFF', linkquality: 0 }))
  );
  mqttService.handleMessage(
    `${baseTopic}/Capteur Temperature`,
    Buffer.from(
      JSON.stringify({
        battery: 88,
        linkquality: 95,
        temperature: 21.2,
        humidity: 49.5,
      })
    )
  );
  mqttService.handleMessage(
    `${baseTopic}/Capteur Porte Entree`,
    Buffer.from(JSON.stringify({ battery: 12, linkquality: 15, contact: true }))
  );

  // 4. Publish availability (2 online, 2 offline)
  mqttService.handleMessage(
    `${baseTopic}/Prise Salon/availability`,
    Buffer.from('online')
  );
  mqttService.handleMessage(
    `${baseTopic}/Ampoule Cuisine/availability`,
    Buffer.from('offline')
  );
  mqttService.handleMessage(
    `${baseTopic}/Capteur Temperature/availability`,
    Buffer.from('online')
  );
  mqttService.handleMessage(
    `${baseTopic}/Capteur Porte Entree/availability`,
    Buffer.from('offline')
  );

  // 5. Add historical battery records for Capteur Porte Entree to simulate battery drain
  const oneHour = 3600 * 1000;
  const now = Date.now();
  db.recordBattery('0x00158d0001aaaa04', 45, now - 48 * oneHour);
  db.recordBattery('0x00158d0001aaaa04', 28, now - 24 * oneHour);
  db.recordBattery('0x00158d0001aaaa04', 18, now - 12 * oneHour);
  db.recordBattery('0x00158d0001aaaa04', 12, now - 2 * oneHour);

  // Also battery history for Capteur Temperature
  db.recordBattery('0x00158d0001aaaa03', 95, now - 48 * oneHour);
  db.recordBattery('0x00158d0001aaaa03', 92, now - 24 * oneHour);
  db.recordBattery('0x00158d0001aaaa03', 88, now - 2 * oneHour);

  // Seeded event logs for Capteur Porte Entree and Ampoule Cuisine
  db.recordEvent('0x00158d0001aaaa04', 'connected', undefined, now - 48 * oneHour);
  db.recordEvent('0x00158d0001aaaa04', 'disconnected', 46 * oneHour, now - 2 * oneHour);
  db.recordEvent('0x00158d0001aaaa02', 'connected', undefined, now - 72 * oneHour);
  db.recordEvent('0x00158d0001aaaa02', 'disconnected', 70 * oneHour, now - 3 * oneHour);

  // 6. Listen for published requests from MqttService and respond as Zigbee2MQTT
  const onPublish = (topic: string, message: Buffer) => {
    try {
      const payload = JSON.parse(message.toString('utf-8'));

      if (topic === `${baseTopic}/bridge/request/device/ping`) {
        const id = payload.id;
        const dev = db.getDevices().find((d) => d.friendly_name === id || d.ieee_address === id);
        const isOnline = dev ? dev.status === 'online' : true;

        if (isOnline) {
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/device/ping`,
            Buffer.from(JSON.stringify({ data: { id }, status: 'ok' }))
          );
        } else {
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/device/ping`,
            Buffer.from(
              JSON.stringify({
                data: { id },
                status: 'error',
                error: `Device '${id}' did not respond to ping`,
              })
            )
          );
        }
      } else if (topic === `${baseTopic}/bridge/request/device/interview`) {
        const id = payload.id;
        mqttService.handleMessage(
          `${baseTopic}/bridge/response/device/interview`,
          Buffer.from(JSON.stringify({ data: { id }, status: 'ok' }))
        );
      } else if (topic === `${baseTopic}/bridge/request/device/configure`) {
        const id = payload.id;
        mqttService.handleMessage(
          `${baseTopic}/bridge/response/device/configure`,
          Buffer.from(JSON.stringify({ data: { id }, status: 'ok' }))
        );
      } else if (topic === `${baseTopic}/bridge/request/device/remove`) {
        const id = payload.id;
        mqttService.handleMessage(
          `${baseTopic}/bridge/response/device/remove`,
          Buffer.from(JSON.stringify({ data: { id, block: false, force: true }, status: 'ok' }))
        );
      } else if (topic === `${baseTopic}/bridge/request/restart`) {
        mqttService.handleMessage(
          `${baseTopic}/bridge/response/restart`,
          Buffer.from(JSON.stringify({ data: {}, status: 'ok' }))
        );
      } else if (topic === `${baseTopic}/bridge/request/permit_join`) {
        const time = payload.time ?? 120;
        const value = payload.value !== false;
        mqttService.handleMessage(
          `${baseTopic}/bridge/response/permit_join`,
          Buffer.from(JSON.stringify({ data: { time, value }, status: 'ok' }))
        );
      }
    } catch {
      // Ignore unparseable
    }
  };

  mqttService.on('publish', onPublish);

  // 7. Periodic updates (fluctuates sensor slightly in background)
  const timer = setInterval(() => {
    try {
      const tempDelta = (Math.random() - 0.5) * 0.4;
      const humDelta = (Math.random() - 0.5) * 1.0;
      mqttService.handleMessage(
        `${baseTopic}/Capteur Temperature`,
        Buffer.from(
          JSON.stringify({
            battery: 88,
            linkquality: Math.floor(90 + Math.random() * 15),
            temperature: +(21.2 + tempDelta).toFixed(1),
            humidity: +(49.5 + humDelta).toFixed(1),
          })
        )
      );
    } catch {
      // Ignore
    }
  }, 15000);

  if (timer.unref) {
    timer.unref();
  }

  return {
    stop: () => {
      clearInterval(timer);
      mqttService.off('publish', onPublish);
    },
  };
}
