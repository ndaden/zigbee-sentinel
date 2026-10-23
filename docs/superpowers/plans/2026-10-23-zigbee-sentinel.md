# Zigbee Sentinel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer une application web légère et autonome (Node.js/Fastify + React + SQLite) pour surveiller en temps réel des périphériques Zigbee gérés par Zigbee2MQTT et ConBee II, diagnostiquer les pannes de connectivité et guider leur reconnexion.

**Architecture:** Monolithe léger déployable en un seul conteneur Docker sur Raspberry Pi. Un backend Fastify/TypeScript souscrit au broker MQTT Mosquitto local, maintient l'état en mémoire et l'historique dans une base SQLite (`better-sqlite3`), diffuse les événements aux clients via WebSocket (`@fastify/websocket`), et sert la SPA React (Vite + Tailwind CSS).

**Tech Stack:** 
- Backend: Node.js 20, TypeScript, Fastify, `@fastify/websocket`, `@fastify/static`, `better-sqlite3`, `mqtt`
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Lucide React
- Tests: Vitest, Supertest
- Packaging: Docker multi-stage (Node Alpine), `docker-compose.yml`

**Spec:** [docs/superpowers/specs/2026-10-23-zigbee-sentinel-design.md](file:///Users/nabil/dev/zigbee-sentinel/docs/superpowers/specs/2026-10-23-zigbee-sentinel-design.md)

## Global Constraints
- **Port réseau par défaut :** 8090 (évite les conflits avec Jeedom sur 80/443 et Zigbee2MQTT sur 8080).
- **Ressources :** Empreinte mémoire cible < 80 Mo de RAM sur Raspberry Pi.
- **Stockage :** Base SQLite fichier unique local (`data/zigbee_sentinel.db`), rétention paramétrable (60 jours par défaut).
- **Indépendance domotique :** L'application ne modifie aucune configuration Jeedom ni Zigbee2MQTT existante.
- **Mode simulation :** Doit pouvoir s'exécuter avec un mock MQTT (`npm run dev:mock`) sans matériel ConBee II physique.

---

### Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `index.html`
- Create: `.env.example`
- Create: `.gitignore`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Produces: Base project structure, build tools, and test runner (Vitest).

- [ ] **Step 1: Write failing sanity test**

```typescript
// tests/setup.test.ts
import { describe, it, expect } from 'vitest';

describe('Project setup sanity check', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Initialize package.json, TypeScript, Vite, and Vitest configuration**

Create `package.json`:
```json
{
  "name": "zigbee-sentinel",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:server": "tsx watch server/index.ts",
    "dev:mock": "MOCK_MQTT=true tsx watch server/index.ts",
    "build": "tsc && vite build && tsc -p tsconfig.server.json",
    "start": "NODE_ENV=production node dist/server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/static": "^7.0.4",
    "@fastify/websocket": "^10.0.1",
    "better-sqlite3": "^11.8.1",
    "dotenv": "^16.4.5",
    "fastify": "^4.28.1",
    "lucide-react": "^0.475.0",
    "mqtt": "^5.10.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^20.17.10",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create configuration files: `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `.gitignore`, `.env.example`, `index.html`.

- [ ] **Step 3: Run npm install and verify tests pass**

Run: `cd /Users/nabil/dev/zigbee-sentinel && npm install && npm test`
Expected: 1 test passed.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: scaffold project structure with Vite, Fastify, Tailwind, and Vitest"
```

---

### Task 2: SQLite Database & Repository Layer

**Files:**
- Create: `server/types.ts`
- Create: `server/db/schema.ts`
- Create: `server/db/index.ts`
- Test: `tests/server/db.test.ts`

**Interfaces:**
- Produces: `DatabaseService` class with methods:
  - `upsertDevice(device: Partial<ZigbeeDevice> & { ieee_address: string }): void`
  - `getDevices(): ZigbeeDevice[]`
  - `getDevice(ieee_address: string): ZigbeeDevice | null`
  - `recordBattery(ieee_address: string, battery: number): void`
  - `getBatteryHistory(ieee_address: string, limit?: number): { battery: number, recorded_at: number }[]`
  - `recordEvent(ieee_address: string, event_type: 'connected' | 'disconnected', duration_offline_ms?: number): void`
  - `getEventHistory(limit?: number): EventRecord[]`
  - `recordDiagnosticLog(ieee_address: string, action_type: string, status: string, details?: string): void`
  - `purgeOldRecords(retentionDays?: number): void`

- [ ] **Step 1: Write failing database tests**

```typescript
// tests/server/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../server/db/index';

describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeEach(() => {
    // In-memory database for testing
    db = new DatabaseService(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should upsert and retrieve a device', () => {
    db.upsertDevice({
      ieee_address: '0x00158d0001a2b3c4',
      friendly_name: 'Capteur Salon',
      type: 'EndDevice',
      model: 'WSDCGQ11LM',
      vendor: 'Xiaomi',
      power_source: 'Battery',
      status: 'online',
      battery: 92,
      linkquality: 110,
      last_seen: Date.now()
    });

    const device = db.getDevice('0x00158d0001a2b3c4');
    expect(device).not.toBeNull();
    expect(device?.friendly_name).toBe('Capteur Salon');
    expect(device?.battery).toBe(92);
  });

  it('should record battery history and limit results', () => {
    const ieee = '0x00158d0001a2b3c4';
    db.upsertDevice({ ieee_address: ieee, friendly_name: 'Capteur Salon', type: 'EndDevice' });
    db.recordBattery(ieee, 95);
    db.recordBattery(ieee, 92);
    db.recordBattery(ieee, 90);

    const history = db.getBatteryHistory(ieee);
    expect(history.length).toBe(3);
    expect(history[0].battery).toBe(90); // newest first
  });

  it('should record and retrieve connection events', () => {
    const ieee = '0x00158d0001a2b3c4';
    db.upsertDevice({ ieee_address: ieee, friendly_name: 'Capteur Salon', type: 'EndDevice' });
    db.recordEvent(ieee, 'disconnected');
    db.recordEvent(ieee, 'connected', 3600000);

    const events = db.getEventHistory();
    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe('connected');
    expect(events[0].duration_offline_ms).toBe(3600000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/server/db.test.ts`
Expected: FAIL with "Cannot find module '../../server/db/index'".

- [ ] **Step 3: Implement DatabaseService and schemas**

Create `server/types.ts`: define `ZigbeeDevice`, `BatteryHistoryRecord`, `EventRecord`, `DiagnosticLogRecord`.
Create `server/db/schema.ts`: DDL for tables `devices`, `history_battery`, `history_events`, `diagnostic_logs`.
Create `server/db/index.ts`: `DatabaseService` with prepared statements using `better-sqlite3`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/server/db.test.ts`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/types.ts server/db/ tests/server/db.test.ts
git commit -m "feat(db): implement SQLite database service and history tracking"
```

---

### Task 3: Diagnostic Engine

**Files:**
- Create: `server/diagnostic/engine.ts`
- Test: `tests/server/diagnostic_engine.test.ts`

**Interfaces:**
- Consumes: `ZigbeeDevice`, `BatteryHistoryRecord[]`
- Produces: `DiagnosticEngine.analyze(device: ZigbeeDevice, batteryHistory: BatteryHistoryRecord[]): DiagnosticReport`
  - `DiagnosticReport`:
    - `verdict`: string (Clear summary of cause)
    - `severity`: 'critical' | 'warning' | 'info'
    - `likelyCause`: 'dead_battery' | 'weak_signal' | 'mains_power_loss' | 'desynchronized' | 'healthy'
    - `recommendedActions`: Array of `{ id: string, label: string, type: 'ping' | 'permit_join' | 'interview' | 'manual', instruction?: string }`
    - `details`: { batteryStatus: string, signalStatus: string, lastSeenHuman: string }

- [ ] **Step 1: Write failing diagnostic engine tests**

```typescript
// tests/server/diagnostic_engine.test.ts
import { describe, it, expect } from 'vitest';
import { DiagnosticEngine } from '../../server/diagnostic/engine';
import { ZigbeeDevice } from '../../server/types';

describe('DiagnosticEngine', () => {
  it('should diagnose dead battery on EndDevice with <= 15% battery', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x123',
      friendly_name: 'Capteur Humidite',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'offline',
      battery: 8,
      linkquality: 80,
      last_seen: Date.now() - 3600000 * 24
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBe('dead_battery');
    expect(report.severity).toBe('critical');
    expect(report.recommendedActions.some(a => a.type === 'permit_join')).toBe(true);
  });

  it('should diagnose mains power loss on Router device when offline', () => {
    const router: ZigbeeDevice = {
      ieee_address: '0x456',
      friendly_name: 'Prise Cuisine',
      type: 'Router',
      power_source: 'Mains',
      status: 'offline',
      battery: null,
      linkquality: 100,
      last_seen: Date.now() - 3600000 * 5
    };

    const report = DiagnosticEngine.analyze(router, []);
    expect(report.likelyCause).toBe('mains_power_loss');
    expect(report.recommendedActions.some(a => a.type === 'ping')).toBe(true);
  });

  it('should diagnose weak signal when LQI < 35', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x789',
      friendly_name: 'Capteur Jardin',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'offline',
      battery: 75,
      linkquality: 18,
      last_seen: Date.now() - 3600000 * 12
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBe('weak_signal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/server/diagnostic_engine.test.ts`
Expected: FAIL with "Cannot find module '../../server/diagnostic/engine'".

- [ ] **Step 3: Implement DiagnosticEngine**

Create `server/diagnostic/engine.ts`:
- Check device type: `Router` (Mains) vs `EndDevice` (Battery).
- For battery: detect low threshold (< 15%), steep drop in history.
- For signal: evaluate `linkquality` (LQI < 35 = weak signal).
- Format actionable steps (ping for router, permit join + wake up button for sleepy sensor).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/server/diagnostic_engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/diagnostic/engine.ts tests/server/diagnostic_engine.test.ts
git commit -m "feat(diagnostic): implement diagnostic decision engine"
```

---

### Task 4: MQTT Ingestion, Command Publisher & Mock Simulator

**Files:**
- Create: `server/mqtt/client.ts`
- Create: `server/mqtt/handlers.ts`
- Create: `server/mqtt/mock.ts`
- Test: `tests/server/mqtt_handlers.test.ts`

**Interfaces:**
- Consumes: `DatabaseService`, MQTT broker or mock broker
- Produces: 
  - `MqttHandler.handleMessage(topic: string, message: Buffer): void`
  - `MqttService.pingDevice(friendlyName: string): Promise<boolean>`
  - `MqttService.reinterviewDevice(friendlyName: string): Promise<boolean>`
  - `MqttService.permitJoin(seconds?: number): Promise<boolean>`
  - `runMqttMock(mqttService: MqttService, db: DatabaseService): void` (for dev and tests)

- [ ] **Step 1: Write failing MQTT handlers tests**

```typescript
// tests/server/mqtt_handlers.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MqttHandler } from '../../server/mqtt/handlers';
import { DatabaseService } from '../../server/db/index';

describe('MqttHandler', () => {
  let db: DatabaseService;
  let handler: MqttHandler;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    handler = new MqttHandler(db, 'zigbee2mqtt');
  });

  it('should parse zigbee2mqtt/bridge/devices and register all devices', () => {
    const rawDevices = JSON.stringify([
      {
        ieee_address: '0x001',
        friendly_name: 'Coordinator',
        type: 'Coordinator'
      },
      {
        ieee_address: '0x002',
        friendly_name: 'Ampoule Salon',
        type: 'Router',
        model_id: 'LWB010',
        definition: { vendor: 'Philips', model: 'Hue White' },
        power_source: 'Mains'
      },
      {
        ieee_address: '0x003',
        friendly_name: 'Capteur Porte',
        type: 'EndDevice',
        model_id: 'MCCGQ11LM',
        definition: { vendor: 'Aqara', model: 'Door Sensor' },
        power_source: 'Battery'
      }
    ]);

    handler.handleMessage('zigbee2mqtt/bridge/devices', Buffer.from(rawDevices));

    const devices = db.getDevices();
    expect(devices.length).toBe(2); // Coordinator excluded
    expect(devices.find(d => d.ieee_address === '0x002')?.vendor).toBe('Philips');
  });

  it('should update battery and linkquality from device state topic', () => {
    db.upsertDevice({
      ieee_address: '0x003',
      friendly_name: 'Capteur Porte',
      type: 'EndDevice'
    });

    const state = JSON.stringify({
      battery: 84,
      linkquality: 125,
      contact: true
    });

    handler.handleMessage('zigbee2mqtt/Capteur Porte', Buffer.from(state));

    const device = db.getDevice('0x003');
    expect(device?.battery).toBe(84);
    expect(device?.linkquality).toBe(125);
  });

  it('should update availability status when availability message arrives', () => {
    db.upsertDevice({
      ieee_address: '0x003',
      friendly_name: 'Capteur Porte',
      type: 'EndDevice',
      status: 'online'
    });

    handler.handleMessage('zigbee2mqtt/Capteur Porte/availability', Buffer.from('offline'));

    const device = db.getDevice('0x003');
    expect(device?.status).toBe('offline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/server/mqtt_handlers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement MQTT client, handlers, and mock service**

- `server/mqtt/handlers.ts`: Logic to parse topics, extract telemetry, dispatch WebSocket updates.
- `server/mqtt/client.ts`: Connection to Mosquitto via `mqtt.js`, reconnect handling, publish commands.
- `server/mqtt/mock.ts`: Mock broker emitter generating 4 realistic devices (1 online router, 1 offline router, 1 online sensor, 1 offline sensor with low battery).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/server/mqtt_handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/mqtt/ tests/server/mqtt_handlers.test.ts
git commit -m "feat(mqtt): implement Zigbee2MQTT ingestion, commands, and mock simulator"
```

---

### Task 5: Fastify API & WebSocket Server

**Files:**
- Create: `server/ws/server.ts`
- Create: `server/app.ts`
- Create: `server/index.ts`
- Test: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: `DatabaseService`, `MqttService`, `DiagnosticEngine`
- Produces:
  - Fastify server with REST endpoints:
    - `GET /api/devices`: Returns device list with current status
    - `GET /api/devices/:ieee/history`: Returns battery and event history
    - `POST /api/devices/:ieee/diagnose`: Runs DiagnosticEngine, returns report
    - `POST /api/devices/:ieee/ping`: Sends ping command via MQTT
    - `POST /api/devices/:ieee/interview`: Sends interview command via MQTT
    - `POST /api/bridge/permit-join`: Opens permit join for X seconds
    - `GET /api/status`: Returns bridge, coordinator, MQTT connection status
  - WebSocket at `/ws`: Pushes `{ type: 'initial_state' | 'device_updated' | 'bridge_status', data: ... }`

- [ ] **Step 1: Write API tests**

```typescript
// tests/server/api.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../server/app';
import { DatabaseService } from '../../server/db/index';

describe('Fastify REST API', () => {
  let app: any;
  let db: DatabaseService;

  beforeEach(async () => {
    db = new DatabaseService(':memory:');
    db.upsertDevice({
      ieee_address: '0x111',
      friendly_name: 'Lampe Bureau',
      type: 'Router',
      status: 'online',
      linkquality: 100
    });

    app = await buildApp({ db, mockMqtt: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('GET /api/devices should return all devices', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/devices'
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBe(1);
    expect(body[0].friendly_name).toBe('Lampe Bureau');
  });

  it('POST /api/devices/:ieee/diagnose should return diagnostic report', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/devices/0x111/diagnose'
    });
    expect(res.statusCode).toBe(200);
    const report = JSON.parse(res.payload);
    expect(report.verdict).toBeDefined();
    expect(report.recommendedActions).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/server/api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement WebSocket server and Fastify application**

- `server/ws/server.ts`: Maintain set of active WebSocket clients, send broadcast helper.
- `server/app.ts`: Configure Fastify, static file serving (`dist/`), REST routes, WS route.
- `server/index.ts`: Read env variables, start listener on `PORT`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/server/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/ws/ server/index.ts tests/server/api.test.ts
git commit -m "feat(api): implement Fastify server, REST endpoints, and WebSocket broadcasting"
```

---

### Task 6: Frontend State & Real-Time WebSocket Hook

**Files:**
- Create: `src/types/device.ts`
- Create: `src/hooks/useZigbeeState.ts`
- Create: `src/api/client.ts`
- Test: `tests/frontend/hook_state.test.ts`

**Interfaces:**
- Produces:
  - `useZigbeeState()` returning `{ devices, bridgeStatus, isConnected, permitJoinTimer, triggerPing, triggerInterview, triggerPermitJoin, runDiagnostic }`
  - `apiClient` with typed fetch helpers for REST actions

- [ ] **Step 1: Write test for device state reduction logic**

```typescript
// tests/frontend/hook_state.test.ts
import { describe, it, expect } from 'vitest';
import { reduceDeviceUpdate } from '../../src/hooks/useZigbeeState';
import { ZigbeeDevice } from '../../src/types/device';

describe('reduceDeviceUpdate', () => {
  it('should update existing device or add new device in state list', () => {
    const existing: ZigbeeDevice[] = [
      {
        ieee_address: '0x123',
        friendly_name: 'Capteur 1',
        type: 'EndDevice',
        status: 'online',
        battery: 90,
        linkquality: 100,
        last_seen: 1000
      }
    ];

    const updated = reduceDeviceUpdate(existing, {
      ieee_address: '0x123',
      battery: 88,
      last_seen: 2000
    });

    expect(updated.length).toBe(1);
    expect(updated[0].battery).toBe(88);
    expect(updated[0].friendly_name).toBe('Capteur 1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/frontend/hook_state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement device types, API client, and useZigbeeState hook**

- Create `src/types/device.ts` matching backend `ZigbeeDevice` and `DiagnosticReport`.
- Create `src/api/client.ts`: Functions `fetchDevices()`, `runDiagnostic(ieee)`, `pingDevice(ieee)`, etc.
- Create `src/hooks/useZigbeeState.ts`: Connect to `ws://${location.host}/ws` with automatic reconnection, state store for device list and bridge status.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/frontend/hook_state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/ src/hooks/ src/api/ tests/frontend/
git commit -m "feat(frontend): implement real-time state management and WebSocket client hook"
```

---

### Task 7: UI Dashboard & Device Components

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/FilterToolbar.tsx`
- Create: `src/components/DeviceCard.tsx`
- Create: `src/components/DeviceList.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `useZigbeeState` hook
- Produces: Complete responsive dashboard view with counters, search/filter bar, and device card grid.

- [ ] **Step 1: Implement Header component**
Display: Title, Bridge Status pill (Online/Offline), MQTT status pill, Counters (Total, Online, Offline, Low Battery), and "Permit Join (120s)" button with countdown indicator.

- [ ] **Step 2: Implement FilterToolbar component**
Display: Search input with instant filtering (by name, vendor, model), and filter tabs (`Tous`, `Hors-ligne`, `Batterie faible`, `Sur secteur`, `Sur pile`).

- [ ] **Step 3: Implement DeviceCard component**
Display:
- Device icon (bulb for light, plug for socket, thermometer for temp, shield for motion/door).
- Friendly name and model name.
- Status badge (Pulsing green `En ligne`, solid red `Hors-ligne`).
- Battery gauge bar with % or plug icon if Mains-powered.
- LQI signal indicator (4-bar signal visual).
- Relative last seen timestamp (e.g. "Vu il y a 5 min", "Hors-ligne depuis 12h").
- Quick actions: `Ping` (if Router), `Interview`, and highlighted `Diagnostiquer` button.

- [ ] **Step 4: Implement DeviceList and wire into App.tsx**
Assemble layout in `src/App.tsx` with responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`).

- [ ] **Step 5: Test build output**

Run: `npm run build`
Expected: Vite build succeeds with zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ src/App.tsx src/index.css
git commit -m "feat(ui): implement responsive dashboard, header counters, and device card grid"
```

---

### Task 8: Interactive Diagnostic Wizard & History Modals

**Files:**
- Create: `src/components/DiagnosticModal.tsx`
- Create: `src/components/HistoryModal.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `runDiagnostic(ieee)`, `triggerPing(ieee)`, `triggerPermitJoin()`, `fetchHistory(ieee)`
- Produces:
  - Step-by-step diagnostic modal with automated findings, guided repair steps, and live reconnection detection.
  - History drawer/modal displaying event history and battery trend chart.

- [ ] **Step 1: Implement DiagnosticModal**
- Step 1: Automated check displays severity, verdict banner, and details (battery, LQI, last seen).
- Step 2: Contextual action:
  - If Router: "Envoyer un Ping forcé" + button with loading spinner.
  - If Battery Sensor: "Ouvrir l'appairage (2 min)" + visual instruction ("Appuyez une fois sur le bouton du capteur").
  - General: "Relancer l'interview Zigbee".
- Step 3: Live detection: listens for WebSocket status changes. If device status transitions to `online`, shows green celebratory alert: "Périphérique rétabli avec succès !".

- [ ] **Step 2: Implement HistoryModal**
- Tab 1: "Historique des déconnexions" showing table of recent offline events with duration.
- Tab 2: "Évolution de la batterie" rendering an SVG sparkline of battery levels over time.

- [ ] **Step 3: Wire modals into App.tsx and verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/DiagnosticModal.tsx src/components/HistoryModal.tsx src/App.tsx
git commit -m "feat(ui): add interactive diagnostic wizard and history modal"
```

---

### Task 9: End-to-End Simulation & Verification

**Files:**
- Modify: `server/mqtt/mock.ts` (fine-tune simulation scenarios)
- Test: `tests/e2e/workflow.test.ts`

- [ ] **Step 1: Write integration test testing complete diagnostic workflow**

```typescript
// tests/e2e/workflow.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../server/app';
import { DatabaseService } from '../../server/db/index';

describe('E2E Diagnostic & Reconnect Workflow', () => {
  let app: any;
  let db: DatabaseService;

  beforeEach(async () => {
    db = new DatabaseService(':memory:');
    app = await buildApp({ db, mockMqtt: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('should run diagnostic on offline device and execute permit join', async () => {
    // 1. Fetch devices
    const devicesRes = await app.inject({ method: 'GET', url: '/api/devices' });
    const devices = JSON.parse(devicesRes.payload);
    const offlineDevice = devices.find((d: any) => d.status === 'offline');
    expect(offlineDevice).toBeDefined();

    // 2. Request diagnostic
    const diagRes = await app.inject({
      method: 'POST',
      url: `/api/devices/${offlineDevice.ieee_address}/diagnose`
    });
    expect(diagRes.statusCode).toBe(200);
    const diag = JSON.parse(diagRes.payload);
    expect(diag.recommendedActions.length).toBeGreaterThan(0);

    // 3. Trigger permit join
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/bridge/permit-join',
      payload: { time: 120 }
    });
    expect(joinRes.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run all test suites**

Run: `npm test`
Expected: All unit, integration, and E2E tests PASS.

- [ ] **Step 3: Test manual mock execution**

Start mock server: `npm run dev:mock &`
Verify HTTP status: `curl http://localhost:8090/api/devices`
Kill mock server.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ server/mqtt/mock.ts
git commit -m "test(e2e): add end-to-end workflow verification test"
```

---

### Task 10: Dockerization & Raspberry Pi Deployment Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `README.md`

- [ ] **Step 1: Create multi-stage Dockerfile**
Optimized Alpine build:
- Stage 1: build React frontend with Vite and TypeScript backend
- Stage 2: runtime with `better-sqlite3` native bindings compiled for Alpine Linux

- [ ] **Step 2: Create docker-compose.yml**
With host networking (`network_mode: host`) and persistent volume `./data:/app/data`.

- [ ] **Step 3: Create comprehensive README.md**
Include installation on Raspberry Pi alongside Jeedom, configuration options, and screenshots/usage guide.

- [ ] **Step 4: Test local Docker build**

Run: `docker build -t zigbee-sentinel:test .` (if Docker is running locally) or verify build configuration.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml README.md
git commit -m "chore(deploy): add multi-stage Dockerfile, docker-compose.yml, and documentation"
```
