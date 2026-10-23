# Zigbee Sentinel

<p align="center">
  <strong>Surveillance proactive, diagnostic automatisé et reconnexion de périphériques Zigbee pour Jeedom / Raspberry Pi</strong><br>
  <em>Proactive monitoring, automated diagnostics, and recovery companion for Zigbee devices on Jeedom & Raspberry Pi</em>
</p>

<p align="center">
  <a href="https://github.com/ndaden/zigbee-sentinel/actions/workflows/docker-publish.yml">
    <img src="https://github.com/ndaden/zigbee-sentinel/actions/workflows/docker-publish.yml/badge.svg" alt="Build & Publish Docker Image" />
  </a>
  <img src="https://img.shields.io/badge/Docker_Image-ghcr.io-blue.svg?logo=docker" alt="GHCR Image" />
  <img src="https://img.shields.io/badge/Node.js-20_LTS-green.svg" alt="Node.js 20 LTS" />
  <img src="https://img.shields.io/badge/React-18-blue.svg" alt="React 18" />
  <img src="https://img.shields.io/badge/Fastify-4-black.svg" alt="Fastify 4" />
  <img src="https://img.shields.io/badge/SQLite-better--sqlite3-orange.svg" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License MIT" />
</p>

---

## Sommaire / Table of Contents

- [🇫🇷 Français](#-français)
  - [1. Présentation de Zigbee Sentinel](#1-présentation-de-zigbee-sentinel)
  - [2. Problématique résolue & Zéro interférence avec Jeedom](#2-problématique-résolue--zéro-interférence-avec-jeedom)
  - [3. Fonctionnalités](#3-fonctionnalités)
  - [4. Test local sans matériel (Mode Mock)](#4-test-local-sans-matériel-mode-mock)
  - [5. Déploiement avec Portainer (Recommandé)](#5-déploiement-avec-portainer-recommandé)
  - [6. Déploiement sur Raspberry Pi avec Docker Compose](#6-déploiement-sur-raspberry-pi-avec-docker-compose)
  - [7. Déploiement alternatif Bare-Metal (PM2 / Systemd)](#7-déploiement-alternatif-bare-metal-pm2--systemd)
  - [8. Tableau de référence des variables d'environnement](#8-tableau-de-référence-des-variables-denvironnement)
- [🇬🇧 English](#-english)
  - [1. Overview of Zigbee Sentinel](#1-overview-of-zigbee-sentinel)
  - [2. Problem Solved & Zero Interference with Jeedom](#2-problem-solved--zero-interference-with-jeedom)
  - [3. Features](#3-features)
  - [4. Local Testing without Hardware (Mock Mode)](#4-local-testing-without-hardware-mock-mode)
  - [5. Deployment with Portainer (Recommended)](#5-deployment-with-portainer-recommended)
  - [6. Raspberry Pi Deployment with Docker Compose](#6-raspberry-pi-deployment-with-docker-compose)
  - [7. Alternative Bare-Metal Deployment (PM2 / Systemd)](#7-alternative-bare-metal-deployment-pm2--systemd)
  - [8. Configuration Reference Table](#8-configuration-reference-table)

---

# 🇫🇷 Français

## 1. Présentation de Zigbee Sentinel

**Zigbee Sentinel** est une application web autonome, légère et temps réel conçue pour superviser la santé d'un maillage Zigbee, diagnostiquer les pannes de communication et assister le rétablissement des périphériques déconnectés.

Développée pour cohabiter sur un **Raspberry Pi** hébergeant déjà une box domotique **Jeedom**, un coordinateur **ConBee II** (ou Sonoff / Texas Instruments) et le service **Zigbee2MQTT** adossé au broker MQTT **Mosquitto**, Zigbee Sentinel offre une vision chirurgicale et proactive sans surcharger les ressources matérielles de la box.

### Stack technique
- **Frontend** : React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons, WebSocket bidirectionnel.
- **Backend** : Node.js 20, Fastify 4, `@fastify/websocket`, `@fastify/static`.
- **Stockage** : SQLite 3 via `better-sqlite3` (synchrone, ultra-rapide, zéro thread supplémentaire).
- **Intégration radio** : Client MQTT natif (`mqtt.js`) connecté au broker Mosquitto local.
- **Packaging** : Image Docker multi-stage basée sur `node:20-alpine` avec support ARM64 / ARMv7 / AMD64.

---

## 2. Problématique résolue & Zéro interférence avec Jeedom

### La problématique
Dans un réseau domotique Zigbee, les équipements à pile (capteurs d'ouverture, de température, détecteurs de mouvement) et les équipements sur secteur (prises, micro-modules, ampoules) peuvent cesser de communiquer pour des raisons variées :
- Pile épuisée ou tension descendue sous le seuil d'émission radio (~2700 mV).
- Routeur intermédiaire éteint physiquement ou débranché (rompant le maillage radio).
- Désynchronisation ou endormissement prolongé de l'End-Device.
- Portée radio dégradée (LQI faible).

Dans l'interface classique de Jeedom, ces pannes ne sont souvent constatées que plusieurs jours après coup, lorsqu'un scénario échoue. Le diagnostic nécessite alors de fouiller les logs Zigbee2MQTT ou d'ouvrir manuellement l'appairage à l'aveugle.

### Garantie de Zéro interférence avec Jeedom
Zigbee Sentinel a été pensé dès le premier jour comme un **observateur passif et bienveillant** :
1. **Écoute passive non-bloquante** : Zigbee Sentinel s'abonne aux topics de statut standard Zigbee2MQTT (`zigbee2mqtt/#`, `bridge/devices`, `bridge/state`, `+/availability`). Il ne modifie aucune configuration interne de Jeedom ni du plugin JeeZigbee / Zigbee.
2. **Aucun plugin Jeedom requis** : L'application fonctionne de manière totalement indépendante dans son propre processus (ou conteneur Docker).
3. **Zéro conflit de base de données** : Les métriques, l'historique des batteries et le journal des déconnexions sont enregistrés dans une base SQLite dédiée (`zigbee_sentinel.db`), sans toucher à la base MySQL de Jeedom.
4. **Empreinte mémoire négligeable** : Consommation mémoire typique **inférieure à 45 Mo de RAM** et utilisation CPU quasi-nulle hors rafraîchissement d'affichage. Même sur un Raspberry Pi 3B+ sous tension avec Jeedom, l'impact est imperceptible.

---

## 3. Fonctionnalités

### 🖥️ Dashboard temps réel réactif
- **Badges d'état du réseau** : Suivi en direct du statut du broker Mosquitto, du service Zigbee2MQTT et du coordinateur (modèle ConBee II, firmware, port série).
- **Compteurs synthétiques** : Total équipements, En ligne, Hors-ligne, Piles faibles (< 20%).
- **Cartes périphériques détaillées** :
  - Nom personnalisé (`friendly_name`), modèle matériel, fabricant et type (`Router` vs `EndDevice`).
  - Badge de statut en ligne/hors-ligne immédiat.
  - Jauge visuelle de niveau de batterie (couleurs dynamiques : vert > 50%, orange 20-50%, rouge ≤ 20%).
  - Indicateur de qualité radio LQI (barres visuelles graduées de 0 à 255).
  - Horodatage relatif de la dernière communication (*"il y a 3 minutes"*, *"il y a 2 heures"*).
- **Filtrage et recherche instantanés** : Recherche textuelle par nom/modèle, filtres en 1 clic (`Tous`, `Hors-ligne`, `Batterie faible`, `Routeurs`, `Capteurs`).

### 🩺 Assistant de Diagnostic Intelligent
Lorsqu'un périphérique est hors-ligne, un clic sur **Diagnostiquer** lance un arbre décisionnel expert adapté au type matériel :
- **Appareil sur secteur (Routeur)** :
  1. Envoi immédiat d'un Ping actif via Zigbee2MQTT.
  2. Si réponse : le périphérique est automatiquement requalifié en ligne.
  3. Si échec : alerte sur une probable coupure d'alimentation secteur ou disjoncteur éteint, avec proposition d'une ré-interview.
- **Appareil sur pile (End-Device)** :
  1. Vérification du niveau de batterie connu : alerte rouge si pile ≤ 15% ou tension critique.
  2. Analyse de la dernière qualité radio LQI : détection des signaux faibles (LQI < 35) ou rupture de maillage.
  3. Détection de mise en veille prolongée ou désynchronisation.
  4. Prescription d'action guidée : ouverture temporaire du mode inclusion avec instructions spécifiques (*"Appuyez brièvement sur le bouton d'association du capteur pour réveiller la radio"*).
- **Détection automatique de rétablissement** : La modale de diagnostic écoute le flux WebSocket et confirme instantanément la reconnexion dès que le capteur réapparaît sur le réseau.

### ⚡ Actions de Maintenance en 1 Clic
- **Ping forcé** : Vérification immédiate de la joignabilité d'un routeur.
- **Ré-interview matériel** : Demande à Zigbee2MQTT d'interroger à nouveau les clusters et fonctionnalités de l'équipement.
- **Permit Join (Inclusion ciblée ou globale)** : Bouton d'ouverture d'appairage sécurisé (120 secondes par défaut) avec jauge circulaire de décompte en temps réel.

### 📈 Historique & Graphiques de santé
- **Courbes d'évolution de batterie** : Graphiques vectoriels SVG générés côté client retraçant l'évolution du niveau de pile dans le temps pour anticiper les fins de vie.
- **Journal chronologique des événements** : Enregistrement de chaque transition d'état (`connected`, `disconnected`) avec calcul automatique de la durée totale d'indisponibilité.
- **Audit log des diagnostics** : Historique complet de chaque commande (ping, ré-interview, permit join) avec résultat d'exécution et horodatage.

### 🧪 Mode Mock (Simulateur intégré)
Un simulateur intégré de broker et d'équipements permet de tester l'intégralité des flux, du diagnostic et des reconnexions sans disposer d'aucun matériel Zigbee sous la main (`MOCK_MQTT=true`).

---

## 4. Test local sans matériel (Mode Mock)

Vous pouvez tester et développer Zigbee Sentinel sur votre machine de développement (macOS, Linux, Windows) en moins de 2 minutes grâce au simulateur intégré.

### Prérequis
- Node.js version 20 LTS ou supérieure.
- npm version 9 ou supérieure.

### Lancement rapide

```bash
# 1. Cloner le dépôt
git clone https://github.com/votre-compte/zigbee-sentinel.git
cd zigbee-sentinel

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur backend en mode Mock
npm run dev:mock
```

Le serveur backend Fastify écoute sur **http://localhost:8090** et simule un réseau Zigbee réaliste :
- Un routeur prise connecté
- Un routeur prise hors-ligne (coupure secteur)
- Un capteur de température fonctionnel
- Un capteur d'ouverture de porte hors-ligne avec pile critique (12%)
- Un capteur de présence endormi

### Développement frontend avec Hot-Reload (Vite)
Pour modifier les composants React avec rechargement instantané :

```bash
# Dans un second terminal :
npm run dev
```
Ouvrez votre navigateur sur **http://localhost:5173** (les requêtes `/api` et `/ws` sont automatiquement redirigées vers le backend sur le port 8090).

### Exécuter la suite de tests automatisés

```bash
npm test
```
La suite Vitest exécute **105 tests** couvrant l'analyse MQTT, la base de données SQLite, le moteur de diagnostic déterministe, les composants React et les flux E2E complets.

---

## 5. Déploiement avec Portainer (Recommandé)

Si vous gérez vos conteneurs Docker sur le Raspberry Pi avec **Portainer**, le déploiement se fait en **3 clics** sans avoir besoin de vous connecter en SSH.

L'image Docker multi-architecture (`linux/amd64`, `linux/arm64`) est automatiquement compilée et publiée sur le registre GitHub (`ghcr.io/ndaden/zigbee-sentinel:latest`).

### Procédure dans Portainer :

1. Connectez-vous à votre interface **Portainer** (ex: `http://jeedom.local:9000` ou `http://<IP_RASPBERRY>:9000`).
2. Dans le menu de gauche, cliquez sur **Stacks** puis sur le bouton **+ Add stack**.
3. Donnez un nom à votre stack : `zigbee-sentinel`.
4. Sélectionnez l'onglet **Web editor** et collez le contenu suivant (disponible dans le fichier [`portainer-stack.yml`](portainer-stack.yml)) :

```yaml
version: '3.8'

services:
  zigbee-sentinel:
    image: ghcr.io/ndaden/zigbee-sentinel:latest
    container_name: zigbee-sentinel
    restart: unless-stopped
    # Mode host indispensable pour communiquer directement avec Mosquitto sur 127.0.0.1:1883
    network_mode: host
    environment:
      - PORT=8090
      - MQTT_URL=mqtt://127.0.0.1:1883
      # Authentification Mosquitto (copiable depuis le champ "Authentification" du plugin Jeedom mqtt2)
      - MQTT_USERNAME=jeedom
      - MQTT_PASSWORD=d0R25N0IGWBuCu6IV7whLgTq4qfU1xSZ3dgib58rN1wiQ6nyz85dmbZotMCvcJUi
      # Ou alternativement en une seule ligne :
      # - MQTT_AUTH=jeedom:d0R25N0IGWBuCu6IV7whLgTq4qfU1xSZ3dgib58rN1wiQ6nyz85dmbZotMCvcJUi
      - Z2M_BASE_TOPIC=zigbee2mqtt
      - DATABASE_PATH=/app/data/zigbee_sentinel.db
      - HISTORY_RETENTION_DAYS=60
    volumes:
      - zigbee-sentinel-data:/app/data

volumes:
  zigbee-sentinel-data:
    name: zigbee-sentinel-data
```

5. Cliquez sur le bouton bleu **Deploy the stack** en bas de page.
6. Portainer télécharge l'image Docker pré-compilée et lance le conteneur.
7. Ouvrez votre navigateur sur **`http://<IP_DE_VOTRE_RASPBERRY_PI>:8090`**.

> [!TIP]
> **Mises à jour automatiques :** Pour mettre à jour Zigbee Sentinel lorsqu'une nouvelle version est publiée, ouvrez votre stack dans Portainer, cliquez sur **Editor**, puis cochez l'option **Re-pull image** et cliquez sur **Update the stack**.

---

## 6. Déploiement sur Raspberry Pi avec Docker Compose

C'est la méthode de déploiement **recommandée** sur Raspberry Pi : elle isole complètement les dépendances de Zigbee Sentinel sans impacter l'environnement système de Jeedom.

### Pourquoi `network_mode: host` ?
Sur un Raspberry Pi hébergeant Jeedom, le broker Mosquitto écoute localement sur `127.0.0.1:1883`. Avec le mode réseau par défaut de Docker (bridge), `127.0.0.1` désignerait l'intérieur du conteneur. En utilisant `network_mode: host` :
- Le conteneur partage l'espace réseau de l'hôte et accède directement à Mosquitto sur `127.0.0.1:1883`.
- Le port `8090` de Zigbee Sentinel est exposé directement sur l'adresse IP de votre Raspberry Pi, sans surcoût de proxy ni de table NAT iptables.

### Procédure d'installation pas-à-pas

#### 1. Créer le répertoire de travail sur le Raspberry Pi

Connectez-vous en SSH à votre Raspberry Pi :

```bash
cd /opt
sudo mkdir -p zigbee-sentinel
sudo chown $USER:$USER zigbee-sentinel
cd zigbee-sentinel
```

#### 2. Copier les fichiers du projet

Clonez le projet ou copiez les fichiers :

```bash
git clone https://github.com/votre-compte/zigbee-sentinel.git .
```

#### 3. Préparer l'environnement et le dossier de données

```bash
cp .env.example .env
mkdir -p data
```

Si votre broker Mosquitto utilise des identifiants spécifiques, éditez le fichier `.env` :

```bash
nano .env
```

#### 4. Démarrer le conteneur

```bash
docker compose up -d --build
```

#### 5. Vérifier les logs et le bon fonctionnement

```bash
docker compose logs -f zigbee-sentinel
```

Vous devriez voir :
```text
Zigbee Sentinel server listening on http://0.0.0.0:8090
[MQTT] Connected to broker at mqtt://127.0.0.1:1883
[MQTT] Subscribed to zigbee2mqtt topics
```

#### 6. Accéder à l'application

Ouvrez un navigateur sur votre réseau local :
👉 **`http://<IP_DE_VOTRE_RASPBERRY_PI>:8090`** (ou `http://jeedom.local:8090`)

#### Maintenance du conteneur Docker
- **Mettre à jour** : `git pull && docker compose up -d --build`
- **Redémarrer** : `docker compose restart`
- **Arrêter** : `docker compose down`

---

## 7. Déploiement alternatif Bare-Metal (PM2 / Systemd)

Si vous préférez exécuter Zigbee Sentinel directement sous l'OS de votre Raspberry Pi (sans Docker) :

### Prérequis système
```bash
sudo apt update
sudo apt install -y curl build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Compilation de l'application
```bash
cd /opt/zigbee-sentinel
npm ci
npm run build
```

### Option A : Gestionnaire de processus PM2 (Recommandé en bare-metal)

```bash
sudo npm install -g pm2

# Lancement du serveur de production
pm2 start dist/server/index.js --name zigbee-sentinel

# Sauvegarde pour redémarrage automatique au boot
pm2 save
pm2 startup
```

Commandes PM2 utiles :
- `pm2 logs zigbee-sentinel`
- `pm2 restart zigbee-sentinel`
- `pm2 stop zigbee-sentinel`

### Option B : Service systemd natif

Créez le fichier de service `/etc/systemd/system/zigbee-sentinel.service` :

```ini
[Unit]
Description=Zigbee Sentinel - Health Supervision for Zigbee Devices
After=network.target mosquitto.service zigbee2mqtt.service

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/zigbee-sentinel
ExecStart=/usr/bin/node dist/server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=8090
Environment=MQTT_URL=mqtt://127.0.0.1:1883
Environment=Z2M_BASE_TOPIC=zigbee2mqtt
Environment=DATABASE_PATH=/opt/zigbee-sentinel/data/zigbee_sentinel.db

[Install]
WantedBy=multi-user.target
```

Activez et démarrez le service :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zigbee-sentinel
sudo systemctl status zigbee-sentinel
```

---

## 8. Tableau de référence des variables d'environnement

Toutes les options de configuration peuvent être définies dans un fichier `.env` ou passées comme variables d'environnement au conteneur Docker :

| Variable | Type | Valeur par défaut | Description & Exemple |
| :--- | :---: | :---: | :--- |
| **`PORT`** | Entier | `8090` | Port TCP d'écoute du serveur web et des WebSockets. |
| **`HOST`** | Chaîne | `0.0.0.0` | Adresse réseau d'écoute (`0.0.0.0` pour toutes les interfaces). |
| **`MQTT_URL`** | URL | `mqtt://127.0.0.1:1883` | Adresse du broker MQTT Mosquitto local sur le Raspberry Pi. |
| **`MQTT_AUTH`** | Chaîne | *(vide)* | Chaîne d'authentification `utilisateur:motdepasse` (copiable directement depuis le champ *Authentification* du plugin Jeedom mqtt2). |
| **`MQTT_USERNAME`** | Chaîne | *(vide)* | Nom d'utilisateur MQTT si Mosquitto est sécurisé avec authentification (ex: `jeedom`). |
| **`MQTT_PASSWORD`** | Chaîne | *(vide)* | Mot de passe associé à l'utilisateur MQTT. |
| **`Z2M_BASE_TOPIC`** | Chaîne | `zigbee2mqtt` | Préfixe racine des topics Zigbee2MQTT configuré dans `configuration.yaml`. |
| **`DATABASE_PATH`** | Chemin | `./data/zigbee_sentinel.db` | Chemin du fichier de base de données locale SQLite (`/app/data/...` sous Docker). |
| **`HISTORY_RETENTION_DAYS`** | Entier | `60` | Durée de rétention (en jours) des événements et historiques de batterie avant purge automatique. |
| **`MOCK_MQTT`** | Booléen | `false` | Si `true`, active le simulateur interne Zigbee2MQTT pour tester sans matériel. |

---

# 🇬🇧 English

## 1. Overview of Zigbee Sentinel

**Zigbee Sentinel** is a lightweight, real-time web application purpose-built to monitor Zigbee mesh health, diagnose communication outages, and guide the recovery of disconnected devices.

Designed specifically to run alongside **Jeedom** on a single **Raspberry Pi** equipped with a **ConBee II** (or Sonoff / Texas Instruments) coordinator and **Zigbee2MQTT** connected to a local **Mosquitto** broker, Zigbee Sentinel delivers surgical visibility and instant troubleshooting without overburdening shared system resources.

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons, full-duplex WebSocket client.
- **Backend**: Node.js 20, Fastify 4, `@fastify/websocket`, `@fastify/static`.
- **Database**: Embedded SQLite 3 via `better-sqlite3` (synchronous, ultra-fast, zero additional background threads).
- **Radio Ingestion**: Native MQTT client (`mqtt.js`) subscribed to local Mosquitto.
- **Packaging**: Multi-stage Docker image built on `node:20-alpine` supporting ARM64, ARMv7, and AMD64 architectures.

---

## 2. Problem Solved & Zero Interference with Jeedom

### The Problem
In any smart home Zigbee deployment, battery-powered sensors (door/window contacts, temperature/humidity probes, motion detectors) and mains-powered routers (smart plugs, in-wall modules, bulbs) occasionally drop off the network:
- Depleted coin-cell batteries or voltage dropping below radio transmission thresholds (~2700 mV).
- Intermediate router physically powered off or unplugged, breaking multi-hop routing paths.
- Deep sleep desynchronization or parent router timeout.
- Degraded link quality (LQI dropped below reception limits).

In standard Jeedom setups, these dropouts often go unnoticed for days until an automation fails. Remedying the issue usually requires sifting through raw Zigbee2MQTT logs or blind re-pairing attempts.

### Zero Interference with Jeedom Guarantee
Zigbee Sentinel was architected from day one as a **non-intrusive, read-only observer**:
1. **Passive, non-blocking ingestion**: Zigbee Sentinel subscribes to standard Zigbee2MQTT topics (`zigbee2mqtt/#`, `bridge/devices`, `bridge/state`, `+/availability`). It modifies neither Jeedom's internal configuration nor the JeeZigbee / Zigbee plugin.
2. **No Jeedom plugin required**: Runs as an isolated standalone service or container.
3. **Independent storage**: All device metrics, battery tracking history, and event logs are written to an isolated SQLite file (`zigbee_sentinel.db`), completely avoiding MySQL locks or interference.
4. **Minimal resource footprint**: Typically consumes **less than 45 MB of RAM** and near 0% CPU at idle. Even on a Raspberry Pi 3B+ concurrently running Jeedom, the impact is negligible.

---

## 3. Features

### 🖥️ Real-Time Responsive Dashboard
- **Bridge & Coordinator Health Status**: Live indicators for Mosquitto broker, Zigbee2MQTT bridge, and ConBee II coordinator (model, firmware, serial port).
- **Summary Badges**: Total devices, Online, Offline, and Low Battery (< 20%) counts.
- **Detailed Device Cards**:
  - Friendly name, hardware model, manufacturer, and device category (`Router` vs `EndDevice`).
  - Clear real-time connectivity status badge (`Online` / `Offline`).
  - Dynamic battery level indicator (green > 50%, amber 20-50%, red ≤ 20%).
  - LQI signal strength indicator (visual tiered bars from 0 to 255).
  - Relative "last seen" timestamp (*"3 minutes ago"*, *"2 hours ago"*).
- **Instant Search & Filters**: Live filter chips (`All`, `Offline`, `Low Battery`, `Routers`, `Sensors`) and instant name/model search.

### 🩺 Diagnostic Wizard & Recovery Tree
When a device drops offline, clicking **Diagnostiquer** launches an automated, deterministic diagnostic wizard tailored to the device type:
- **Mains-Powered Routers**:
  1. Issues an active MQTT ping to test reachability.
  2. If successful: device automatically updates to online.
  3. If timeout: warns of a probable power outage or tripped circuit, and suggests a full re-interview.
- **Battery-Powered End-Devices**:
  1. Checks last recorded battery level and voltage: flags critical battery exhaustion if ≤ 15%.
  2. Checks last recorded LQI: detects weak radio signal (LQI < 35) or broken mesh routes.
  3. Detects deep sleep or desynchronization.
  4. Provides guided recovery steps: opens temporary pairing mode with visual advice (*"Briefly press the hardware pairing button on the sensor to force a wake-up frame"*).
- **Live Reconnect Detection**: The diagnostic modal listens to the live WebSocket feed and instantly renders a green confirmation badge when the device rejoins the mesh.

### ⚡ One-Click Maintenance Actions
- **Force Ping**: Immediate reachability check for routers.
- **Re-interview Device**: Triggers Zigbee2MQTT to re-interrogate device clusters and descriptors.
- **Permit Join**: Global or targeted inclusion button with a live 120-second countdown timer.

### 📈 History & Battery Degradation Graphs
- **SVG Battery Curves**: Client-side vector charts showing battery discharge trends over time to spot abnormal battery drains before failure.
- **Chronological Event Log**: Audits all connectivity transitions (`connected`, `disconnected`) and calculates precise downtime duration.
- **Diagnostic Action Log**: Full audit trail of pings, interviews, and permit join actions with timestamps and results.

### 🧪 Built-in Mock Simulator
A realistic Zigbee2MQTT mock simulator (`MOCK_MQTT=true`) allows full development, UI testing, and failure recovery validation without requiring physical Zigbee hardware or an external broker.

---

## 4. Local Testing without Hardware (Mock Mode)

Test or develop Zigbee Sentinel on any machine (macOS, Linux, Windows) in under 2 minutes:

### Prerequisites
- Node.js version 20 LTS or higher.
- npm version 9 or higher.

### Quickstart

```bash
# 1. Clone repository
git clone https://github.com/your-username/zigbee-sentinel.git
cd zigbee-sentinel

# 2. Install dependencies
npm install

# 3. Start backend in Mock Mode
npm run dev:mock
```

The Fastify backend will start at **http://localhost:8090** simulating a realistic Zigbee network:
- 1 connected smart plug (router)
- 1 offline smart plug (unplugged router)
- 1 online temperature sensor
- 1 offline door sensor with critical battery (12%)
- 1 asleep motion sensor

### Frontend Development with Hot Reload (Vite)

```bash
# In a second terminal:
npm run dev
```
Open **http://localhost:5173** in your browser. API and WebSocket calls are automatically proxied to port 8090.

### Automated Test Suite

```bash
npm test
```
Vitest executes all **105 automated unit, integration, and E2E tests**.

---

## 5. Deployment with Portainer (Recommended)

If you manage your Docker containers with **Portainer** on your Raspberry Pi, deploying Zigbee Sentinel takes only a few clicks.

Multi-architecture Docker images (`linux/amd64`, `linux/arm64`) are automatically compiled and published to the GitHub Container Registry (`ghcr.io/ndaden/zigbee-sentinel:latest`).

### Portainer Setup:

1. Open your **Portainer** web interface (e.g. `http://jeedom.local:9000` or `http://<RASPBERRY_IP>:9000`).
2. In the left navigation bar, click **Stacks**, then **+ Add stack**.
3. Name the stack: `zigbee-sentinel`.
4. In the **Web editor** tab, paste the following configuration (available in [`portainer-stack.yml`](portainer-stack.yml)):

```yaml
version: '3.8'

services:
  zigbee-sentinel:
    image: ghcr.io/ndaden/zigbee-sentinel:latest
    container_name: zigbee-sentinel
    restart: unless-stopped
    # Host network mode is required to communicate directly with Mosquitto on 127.0.0.1:1883
    network_mode: host
    environment:
      - PORT=8090
      - MQTT_URL=mqtt://127.0.0.1:1883
      # Authentification Mosquitto (copiable depuis le champ "Authentification" du plugin Jeedom mqtt2)
      - MQTT_USERNAME=jeedom
      - MQTT_PASSWORD=d0R25N0IGWBuCu6IV7whLgTq4qfU1xSZ3dgib58rN1wiQ6nyz85dmbZotMCvcJUi
      # Ou alternativement en une seule ligne :
      # - MQTT_AUTH=jeedom:d0R25N0IGWBuCu6IV7whLgTq4qfU1xSZ3dgib58rN1wiQ6nyz85dmbZotMCvcJUi
      - Z2M_BASE_TOPIC=zigbee2mqtt
      - DATABASE_PATH=/app/data/zigbee_sentinel.db
      - HISTORY_RETENTION_DAYS=60
    volumes:
      - zigbee-sentinel-data:/app/data

volumes:
  zigbee-sentinel-data:
    name: zigbee-sentinel-data
```

5. Click the blue **Deploy the stack** button.
6. Portainer pulls the pre-built multi-arch image and starts the container.
7. Open **`http://<RASPBERRY_PI_IP>:8090`** in your browser.

> [!TIP]
> **Updating:** To update to the latest release, open the stack in Portainer, click **Editor**, check **Re-pull image**, and click **Update the stack**.

---

## 6. Raspberry Pi Deployment with Docker Compose

This is the **recommended** deployment method on Raspberry Pi OS. It encapsulates all dependencies and native C++ SQLite bindings without altering Jeedom's host environment.

### Why `network_mode: host`?
When running alongside Jeedom, Mosquitto listens on `127.0.0.1:1883` on the Raspberry Pi host. With default Docker bridge networking, `127.0.0.1` refers to the container itself. `network_mode: host` enables:
- Direct loopback communication with Mosquitto on `127.0.0.1:1883`.
- Direct exposure of port `8090` without docker-proxy or NAT overhead.

### Step-by-Step Setup

#### 1. Create working directory on Raspberry Pi

SSH into your Raspberry Pi:

```bash
cd /opt
sudo mkdir -p zigbee-sentinel
sudo chown $USER:$USER zigbee-sentinel
cd zigbee-sentinel
```

#### 2. Clone repository

```bash
git clone https://github.com/your-username/zigbee-sentinel.git .
```

#### 3. Setup environment and data directory

```bash
cp .env.example .env
mkdir -p data
```

If your Mosquitto broker requires credentials, edit `.env`:

```bash
nano .env
```

#### 4. Build and start the container

```bash
docker compose up -d --build
```

#### 5. Verify container logs

```bash
docker compose logs -f zigbee-sentinel
```

Expected startup log:
```text
Zigbee Sentinel server listening on http://0.0.0.0:8090
[MQTT] Connected to broker at mqtt://127.0.0.1:1883
[MQTT] Subscribed to zigbee2mqtt topics
```

#### 6. Access the Dashboard

Open your web browser:
👉 **`http://<RASPBERRY_PI_IP>:8090`** (or `http://jeedom.local:8090`)

---

## 7. Alternative Bare-Metal Deployment (PM2 / Systemd)

If you prefer running Zigbee Sentinel natively without Docker:

### System Prerequisites
```bash
sudo apt update
sudo apt install -y curl build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Build Application
```bash
cd /opt/zigbee-sentinel
npm ci
npm run build
```

### Option A: PM2 Process Manager

```bash
sudo npm install -g pm2
pm2 start dist/server/index.js --name zigbee-sentinel
pm2 save
pm2 startup
```

### Option B: Systemd Service

Create `/etc/systemd/system/zigbee-sentinel.service`:

```ini
[Unit]
Description=Zigbee Sentinel - Health Supervision for Zigbee Devices
After=network.target mosquitto.service zigbee2mqtt.service

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/zigbee-sentinel
ExecStart=/usr/bin/node dist/server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=8090
Environment=MQTT_URL=mqtt://127.0.0.1:1883
Environment=Z2M_BASE_TOPIC=zigbee2mqtt
Environment=DATABASE_PATH=/opt/zigbee-sentinel/data/zigbee_sentinel.db

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now zigbee-sentinel
sudo systemctl status zigbee-sentinel
```

---

## 8. Configuration Reference Table

All configuration options can be defined in `.env` or passed as container environment variables:

| Variable | Type | Default | Description & Example |
| :--- | :---: | :---: | :--- |
| **`PORT`** | Integer | `8090` | Web server and WebSocket listening port. |
| **`HOST`** | String | `0.0.0.0` | Bind host address (`0.0.0.0` binds to all network interfaces). |
| **`MQTT_URL`** | URL | `mqtt://127.0.0.1:1883` | Mosquitto broker URL on the local Raspberry Pi. |
| **`MQTT_AUTH`** | String | *(empty)* | Combined `username:password` string (copyable directly from Jeedom mqtt2 Authentication field). |
| **`MQTT_USERNAME`** | String | *(empty)* | Optional MQTT username if Mosquitto authentication is enabled. |
| **`MQTT_PASSWORD`** | String | *(empty)* | Optional MQTT password. |
| **`Z2M_BASE_TOPIC`** | String | `zigbee2mqtt` | Zigbee2MQTT base topic prefix configured in `configuration.yaml`. |
| **`DATABASE_PATH`** | Path | `./data/zigbee_sentinel.db` | Local SQLite database file location (`/app/data/...` in Docker). |
| **`HISTORY_RETENTION_DAYS`** | Integer | `60` | Number of days to retain battery history and events before automatic pruning. |
| **`MOCK_MQTT`** | Boolean | `false` | When `true`, boots the built-in Zigbee2MQTT simulator for hardware-free testing. |

---

## Licence / License

Ce projet est distribué sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.  
*This project is distributed under the MIT License. See `LICENSE` for details.*
