# IoT Platform — Monolith vs. Microservices (ESP32)


IoT monitoring platform for ESP32-C3 devices, implemented in **two comparable architectures** (monolith and microservices) for an empirical study on scalability and performance.

- **Backend:** Node.js + Express
- **Frontend:** React + Vite
- **Monolith:** PostgreSQL, scaling via PM2 cluster
- **Microservices:** Kubernetes + Nginx + Kafka + Redis + TimescaleDB + MinIO, automatic scaling (HPA)
- **Firmware:** identical on both architectures (PlatformIO / Arduino-ESP32)

## Requirements

| Component | Version |
|---|---|
| Node.js | 20 LTS |
| Docker | Engine 24+ |
| Kubernetes (Minikube) | 1.28+ |
| kubectl | compatible with the cluster |
| PostgreSQL (monolith) | 16 |

---

## Project Structure

```
iot-platform/
├── client/                  # React + Vite frontend
├── server/                  # Monolith backend (Node.js + Express)
│   └── src/db/database.js    # schema + connection pool
├── simulator/
│   ├── simulator-workers.js     # load generator (Worker Threads)
│   └── simulator-autocannon.js  # autocannon benchmark
└── ...

iot-platform-k8s-aws/        # Microservices variant
├── services/
│   ├── api/                 # API (publishes to Kafka)
│   ├── worker-telemetry/    # consumes Kafka → TimescaleDB + Redis + MinIO
│   ├── worker-alerts/       # consumes Kafka → threshold evaluation + alerts
│   └── nginx/               # reverse proxy + React build
├── k8s/                     # Kubernetes manifests
│   ├── secrets.yaml         # secrets
│   ├── timescaledb/ redis/ kafka/ minio/ api/ ...
└── simulator/
```

---

## Architecture Diagrams

### 1. Monolithic Architecture

All five route groups (`auth`, `devices`, `telemetry`, `relay`, `alerts`) run inside the same Node.js process, sharing database connections through the `pg` pool. Optionally, PM2 cluster mode spawns *N* identical processes for horizontal scaling.

```mermaid
flowchart TB
    ESP1["ESP32 #1<br/>DHT11 + flame + relay"]
    ESP2["ESP32 #2 ... #N"]
    WEB["Web Client<br/>React + Recharts"]

    subgraph MONOLITH["Node.js Monolith (optional: PM2 cluster -i N)"]
        EXPRESS["Express.js<br/>middleware pipeline"]
        CORS["cors / express.json"]
        AUTHMW["requireAuth<br/>(JWT, for web users)"]
        DEVMW["deviceAuth<br/>(X-API-Key, for ESP32)"]
        R_AUTH["/api/auth"]
        R_DEV["/api/devices"]
        R_TEL["/api/telemetry"]
        R_RELAY["/api/relay"]
        R_ALERT["/api/alerts"]
        DAL["Data access layer<br/>db.query / queryOne / queryAll<br/>(pg pool)"]
    end

    DB[("PostgreSQL<br/>users, devices, sensors,<br/>telemetry, relay_state, alerts")]

    ESP1 -->|"HTTP POST, X-API-Key"| EXPRESS
    ESP2 -->|"HTTP POST, X-API-Key"| EXPRESS
    WEB -->|"HTTPS + JWT"| EXPRESS
    EXPRESS --> CORS
    CORS --> AUTHMW
    CORS --> DEVMW
    AUTHMW --> R_AUTH
    AUTHMW --> R_DEV
    AUTHMW --> R_ALERT
    DEVMW --> R_TEL
    DEVMW --> R_RELAY
    R_AUTH --> DAL
    R_DEV --> DAL
    R_TEL --> DAL
    R_RELAY --> DAL
    R_ALERT --> DAL
    DAL -->|"pg protocol"| DB
```

### 2. Microservices — Telemetry Request (Sequence Diagram)

The hot path (from the ESP32 request to the response) uses only sub-millisecond Redis operations and a fire-and-forget Kafka publish (`acks=0`). Persistence to TimescaleDB happens asynchronously via the workers, fully decoupled from the device's response time.

```mermaid
sequenceDiagram
    participant ESP32
    participant Nginx
    participant API as API pod
    participant Redis
    participant Kafka
    participant Worker as Worker Telemetry
    participant TSDB as TimescaleDB

    ESP32->>Nginx: POST /api/telemetry (X-API-Key + readings)
    Nginx->>API: forward (least_conn)

    Note over API,Redis: Hot path — all operations on Redis, sub-millisecond
    API->>Redis: GET apikey:{key}
    Redis-->>API: device + user (TTL 5 min)
    API->>Redis: GET sensors:{deviceId}
    Redis-->>API: sensor list (TTL 60s)
    API->>Redis: SET device:lastseen NX EX 60
    Redis-->>API: OK or nil

    alt lock acquired (about once per minute)
        API->>TSDB: UPDATE devices SET last_seen (fire-and-forget)
    end

    API->>Kafka: publish device_id + readings (acks=0, fire-and-forget)
    API->>Redis: MGET relay:{sensorIds}
    Redis-->>API: pending relay commands
    API-->>Nginx: 200 OK (success, commands)
    Nginx-->>ESP32: 200 OK
    ESP32->>ESP32: apply commands on GPIO

    Note over Kafka,TSDB: Asynchronous processing, decoupled from the device's response time
    Kafka->>Worker: consume message
    Worker->>TSDB: INSERT INTO telemetry (batch)
    TSDB-->>Worker: OK
    Worker->>Redis: SET latest:{sensorId}
    Worker->>Kafka: commit offset
```

### 3. Microservices Architecture

Eight services grouped into functional layers (ingress, API, cache, messaging, workers, storage), orchestrated by Kubernetes. HPA automatically scales the API (8–64 pods) and worker-telemetry (4–32 pods) based on CPU usage.

```mermaid
flowchart TB
    WEB["Web Client<br/>React + Recharts"]
    ESP["ESP32 #1 ... #N"]

    subgraph CLUSTER["Kubernetes Cluster"]
        NGINX["Nginx (x2+ replicas)<br/>reverse proxy, least_conn LB,<br/>rate limiting, serves SPA"]

        API1["API pod #1"]
        API2["API pod #2"]
        APIN["API pod #N<br/>(HPA: 8-64 pods)"]

        KAFKA["Apache Kafka<br/>topic: iot.telemetry<br/>32 partitions, acks=0"]

        WT["Worker Telemetry<br/>(HPA: 4-32 pods)"]
        WA["Worker Alerts<br/>(1 pod, no HPA)"]

        REDIS[("Redis<br/>apikey, sensors, relay,<br/>latest, online, cooldown")]
        TS[("TimescaleDB<br/>relational + hypertable")]
        MINIO[("MinIO<br/>S3-compatible archive")]
    end

    WEB --> NGINX
    ESP --> NGINX
    NGINX --> API1
    NGINX --> API2
    NGINX --> APIN

    API1 -->|"publish, fire-and-forget"| KAFKA
    API2 -->|"publish, fire-and-forget"| KAFKA
    APIN -->|"publish, fire-and-forget"| KAFKA

    API1 -->|"GET/SET, sub-ms"| REDIS
    API2 -->|"GET/SET, sub-ms"| REDIS
    APIN -->|"GET/SET, sub-ms"| REDIS

    APIN -->|"SELECT history/stats"| TS

    KAFKA --> WT
    KAFKA --> WA

    WT -->|"batch INSERT"| TS
    WT -->|"SET latest:*"| REDIS
    WT -->|"CSV export, older than 1yr"| MINIO
    WA -->|"read thresholds,<br/>write alerts"| TS
```

---

## Secrets Configuration

> **Important for security.** Secrets (Google OAuth key, `JWT_SECRET`, DB passwords).

### Monolith

Secrets are kept in a `server/.env` file.

Minimum `server/.env` content:
```env
DATABASE_URL=postgresql://iotuser:PASSWORD@localhost:5432/iotplatform
JWT_SECRET=<long_random_hex>
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=<google_client_id>
GOOGLE_CLIENT_SECRET=<google_client_secret>
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
CLIENT_URL=http://localhost:5173
```

Generate a new `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Microservices

The `k8s/secrets.yaml` file holds the cluster secrets.

**1. Template `k8s/secrets.example.yaml`** (with placeholders, not real values):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: iot-secrets
  namespace: iot-platform
type: Opaque
stringData:
  DATABASE_URL: "postgresql://iotuser:CHANGE_ME@timescaledb:5432/iotplatform"
  POSTGRES_USER: "iotuser"
  POSTGRES_PASSWORD: "CHANGE_ME"
  POSTGRES_DB: "iotplatform"
  REDIS_HOST: "redis"
  REDIS_PORT: "6379"
  KAFKA_BROKERS: "kafka:9092"
  GOOGLE_CLIENT_ID: "CHANGE_ME.apps.googleusercontent.com"
  GOOGLE_CLIENT_SECRET: "CHANGE_ME"
  GOOGLE_REDIRECT_URI: "http://localhost:8080/api/auth/google/callback"
  JWT_SECRET: "CHANGE_ME"
  JWT_EXPIRES_IN: "7d"
  MINIO_HOST: "minio"
  MINIO_PORT: "9000"
  MINIO_ACCESS_KEY: "CHANGE_ME"
  MINIO_SECRET_KEY: "CHANGE_ME"
  MINIO_BUCKET: "iot-archive"
  CLIENT_URL: "http://localhost:8080"
  NODE_ENV: "production"
```

---

## Part 1 — Monolith

### 1.1 Start PostgreSQL (Docker) or natively
```bash
docker run -d --name iot-postgres \
  -e POSTGRES_USER=iotuser \
  -e POSTGRES_PASSWORD=iotpassword123 \
  -e POSTGRES_DB=iotplatform \
  -p 5432:5432 postgres:16
```

### 1.2 Install dependencies
```bash
cd server  && npm install
cd ../client && npm install
cd ../simulator && npm install
```

### 1.3 Start backend + frontend
```bash
# Terminal 1 — backend (single process)
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

### 1.4 Scaling with PM2 (horizontal cluster — 8 processes)
```bash
cd server
pm2 start src/index.js -i 8 --name iot-api
pm2 logs          # view the logs
pm2 delete all    # stop
```

> **Connection pool:** in `server/src/db/database.js`, the pool's `max` parameter is **per process**. With PM2 `-i 8`, 8 independent pools run, so the rule is `max × number_of_processes ≤ max_connections` of PostgreSQL. A `max` that's too high (e.g. 1000 per process × 8 = 8000) exceeds PostgreSQL's default limit (100) and produces the `too many clients already` error. Recommended value: `max: 10` (local) / `max: 15` (server with more resources).

---

## Part 2 — Microservices (Kubernetes)

### 2.1 Start Minikube
```bash
minikube start --cpus=<n> --memory=<MB>
docker context use default
sudo systemctl start docker
minikube start --driver=docker

# Delete with
kubectl delete namespace iot-platform
minikube delete
```

### 2.2 Build the images in the Minikube context
```bash
eval $(minikube docker-env)
cd <your_path>/iot-platform-k8s-aws

docker build -t iot-nginx:latest            -f services/nginx/Dockerfile .
docker build -t iot-api:latest               services/api/
docker build -t iot-worker-telemetry:latest  services/worker-telemetry/
docker build -t iot-worker-alerts:latest     services/worker-alerts/
```

### 2.3 Apply the manifests (in order)
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml

kubectl apply -f k8s/timescaledb/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/kafka/
kubectl apply -f k8s/minio/

# wait for the database before the API
kubectl wait --for=condition=Ready pod -l app=timescaledb -n iot-platform --timeout=120s

kubectl apply -f k8s/api/
kubectl apply -f k8s/worker-telemetry/
kubectl apply -f k8s/worker-alerts/
kubectl apply -f k8s/nginx/
```

### Apply the LITE Manifests (Optional)
The project includes a LITE version; instead of `k8s`, apply `k8s_LITE`.
```bash
cd <your_path>/iot-platform-k8s-aws

<your_path>/iot-platform-k8s-aws/k8s_LITE
```
LITE:
```bash
kubectl apply -f k8s_LITE/namespace.yaml
kubectl apply -f k8s_LITE/secrets.yaml

kubectl apply -f k8s_LITE/timescaledb/
kubectl apply -f k8s_LITE/redis/
kubectl apply -f k8s_LITE/kafka/
kubectl apply -f k8s_LITE/minio/

# wait for the database before the API
kubectl wait --for=condition=Ready pod -l app=timescaledb -n iot-platform --timeout=120s

kubectl apply -f k8s_LITE/api/
kubectl apply -f k8s_LITE/worker-telemetry/
kubectl apply -f k8s_LITE/worker-alerts/
kubectl apply -f k8s_LITE/nginx/
```

### 2.4 Verify
```bash
kubectl get pods -n iot-platform
kubectl get hpa  -n iot-platform
```

### 2.5 Full Reset (delete everything)
```bash
kubectl delete namespace iot-platform
```

---

## Generating Test Devices (Bots)

For benchmarking, dozens of virtual devices are generated and associated with your account. Procedure: (1) create an account through the interface, (2) generate the devices in SQL, (3) export the list for the simulator.

### A) On the MONOLITH (PostgreSQL in Docker)

**1. Enter the database:**
```bash
docker exec -it iot-postgres psql -U iotuser -d iotplatform
```

**2. Generate devices 1→100** (automatically looks up your user by email):
```sql
DO $$
DECLARE
    i int;
    new_device_id UUID;
    target_uid UUID;
BEGIN
    SELECT id INTO target_uid FROM users WHERE email = 'andrei.bota01@e-uvt.ro';
    FOR i IN 1..100 LOOP
        INSERT INTO devices (name, api_key, user_id)
        VALUES ('Bot-ESP32-' || i, 'iot_key_bot_' || i || '_' || md5(random()::text), target_uid)
        RETURNING id INTO new_device_id;

        INSERT INTO sensors (device_id, name, type, pin, unit) VALUES
        (new_device_id, 'flame',  'flame',       18, 'bool'),
        (new_device_id, 'temp',   'temperature',  4, '°C'),
        (new_device_id, 'hum',    'humidity',     5, '%');
    END LOOP;
END $$;
```

**3. Export the list for the simulator** (exit with `\q`, then in the terminal):
```bash
docker exec -it iot-postgres psql -U iotuser -d iotplatform -P pager=off -t -A -F'|' -c "
SELECT d.id, d.name, d.api_key, s.id, s.name
FROM devices d
JOIN sensors s ON s.device_id = d.id
ORDER BY d.name, s.name;" > bot_list.txt
```

### B) On MICROSERVICES (TimescaleDB in Kubernetes)

Same logic, but the database lives in the `timescaledb-0` pod within the cluster.

Port-forwards needed for this to work:
```bash
# 1) Create a new account via the web page (http://localhost:8080/)

kubectl port-forward svc/nginx 8080:80 -n iot-platform

# 2) Add in OAuth 2.0 https://console.cloud.google.com/ -> Credentials -> APP
# Authorized JavaScript origins: http://localhost:8080
# Authorized redirect URIs: http://localhost:8080/api/auth/google/callback

# 3) port-forward the backend
kubectl port-forward svc/api 3001:3001 -n iot-platform
```

**1. Enter TimescaleDB through kubectl:**
```bash
kubectl exec -it -n iot-platform timescaledb-0 -- psql -U iotuser -d iotplatform
```
> If the pod name differs, find it automatically:
> ```bash
> kubectl exec -it -n iot-platform \
>   $(kubectl get pod -n iot-platform -l app=timescaledb -o jsonpath='{.items[0].metadata.name}') \
>   -- psql -U iotuser -d iotplatform
> ```

**2. Run the SAME SQL block** as for the monolith (above).

**3. Export the list** (from outside the pod):
```bash
kubectl exec -n iot-platform timescaledb-0 -- psql -U iotuser -d iotplatform -P pager=off -t -A -F'|' -c "
SELECT d.id, d.name, d.api_key, s.id, s.name
FROM devices d JOIN sensors s ON s.device_id = d.id
ORDER BY d.name, s.name;" > bot_list.txt
```

---

## Benchmark (Load Simulator)

The `simulator/simulator-workers.js` simulator generates concurrent traffic using Worker Threads. It's configured through environment variables.

| Variable | Default | Description |
|---|---|---|
| `CONNECTIONS` | 500 | **total** concurrent connections (split across workers) |
| `WORKERS` | 2 | load-generation processes |
| `DURATION` | 60s | test duration |
| `TARGET_PATH` | `/api/telemetry` | target endpoint (`/api/benchmark/echo` for the HTTP baseline) |
| `TARGET_ORIGIN` | (see file) | target server address |
| `DEVICE_LIMIT` | 500 | how many devices from the list to use |

### Examples

**HTTP baseline (echo endpoint) — raw stack limit:**
```bash
cd simulator
CONNECTIONS=100 WORKERS=2 TARGET_PATH=/api/benchmark/echo node simulator-workers.js
```

**Real telemetry path:**
```bash
CONNECTIONS=100 WORKERS=2 TARGET_PATH=/api/telemetry node simulator-workers.js
```

**Stress scenarios (increasing connections):**
```bash
CONNECTIONS=1000  WORKERS=4 node simulator-workers.js
CONNECTIONS=4000  WORKERS=4 node simulator-workers.js
CONNECTIONS=16000 WORKERS=4 node simulator-workers.js
```

### Comparative Testing Procedure

1. **Monolith, 1 process:** start `node src/index.js`, run the simulator against `echo`, then against `telemetry`.
2. **Monolith, PM2 `-i 8`:** start `pm2 start src/index.js -i 8`, repeat `echo` + `telemetry`.
3. **Microservices:** deploy on Kubernetes, repeat the tests.

---

## Note on Running Mode

For demonstration purposes, the microservices can be run in a **reduced regime**, with a small number of pods.

**Recommendations for a stable local run:**
- Run with a small number of pods (reduce `replicas` / HPA limits in the manifests).
- Allocate enough RAM to the cluster; enable `swap` on SSD if physical memory is insufficient.
- On modest hardware, sustained maximum load can cause memory-related instability (including kernel panics). A practical workaround (not a complete fix) is reducing CPU frequency, which allowed the simulator to run for extended periods. The limits remain those of the available hardware. Real scaling was validated on AWS (128 vCPUs).

---

## Evaluation Results (Summary — Chapter 5)

The tables below summarize the most relevant benchmark results from the accompanying thesis. All tests used `autocannon` and the same load simulator for every configuration, targeting `POST /api/telemetry`.

### Monolith Results

Tested under 1,000 concurrent connections:

| Configuration | Req/s | p50 | p97.5 |
|---|---|---|---|
| Single-process | 1,676 | 57 ms | 142 ms |
| PM2 cluster `-i 8` | 3,622 | 25 ms | 78 ms |
| PM2 `-i 8` + 2 client threads | 4,180 | 19 ms | 64 ms |

Moving to 8 processes in cluster mode increases throughput by 116%, but the scaling factor isn't linear — the shared PostgreSQL database becomes the bottleneck under high traffic.

### Microservices Results

Three scenarios were evaluated: **A** (unoptimized baseline), **B** (optimized, local hardware), and **C** (optimized, AWS — 128 vCPU):

| Scenario / Connections | API pods | Req/s | p50 | p97.5 |
|---|---|---|---|---|
| A unoptimized — 100 | 8 fixed | 764 | 108 ms | 314 ms |
| A unoptimized — 1,000 | 8 fixed | 808 | 540 ms | 1,905 ms |
| A unoptimized — 4,000 | 8 fixed | 573 | 1,618 ms | 5,077 ms |
| B optimized — 100 | 4→16 HPA | 1,768 | 46 ms | 147 ms |
| B optimized — 1,000 | 4→16 HPA | 2,697 | 167 ms | 424 ms |
| B optimized — 4,000 | 4→16 HPA | 2,426 | 309 ms | 1,907 ms |
| C AWS — 100 | 64 | 20,937 | 6 ms | 55 ms |
| C AWS — 1,000 | 64 | 38,569 | 10 ms | 59 ms |
| C AWS — 4,000 | 64 | 48,478 | 13 ms | 56 ms |
| C AWS — 16,000 | 64 | **53,195** | 26 ms | 72 ms |

Five targeted optimizations (Redis caching for the sensor list, an NX-lock for `last_seen` updates, Kafka `acks=0`, a smaller per-pod DB connection pool, and higher Nginx CPU limits) took the unoptimized baseline from ~764 req/s to ~2,697 req/s locally (**+234%**) on identical hardware, and to 53,195 req/s on AWS.

**Bottleneck analysis:** on AWS with 64 API pods, the `echo` endpoint (no Redis/Kafka/DB work) reached 282,160 req/s at 16,000 connections — about **5.3× more** than the full telemetry path (53,195 req/s). Neither Nginx, CPU, nor Redis were saturated; the limiting factor was the **three sequential Redis round-trips** on the hot path (API-key lookup, sensor list, relay commands), which cap each single-threaded API pod at roughly **831 req/s**. Combining them via Redis pipelining is the main lever identified for further gains (see Future Improvements below).

### Comparative Synthesis

| Criterion | Monolith | Microservices |
|---|---|---|
| Maximum throughput | 3,622 req/s (PM2, 1 test client) | 53,195 req/s (AWS) |
| Latency under high load | 57 ms (single) / 25 ms (PM2), 1k conn | 26 ms (16k conn, AWS) |
| Setup & operations | Very simple (1 binary) | Complex (K8s, monitoring) |
| Cost at low traffic | Very low | Medium (K8s overhead) |
| Cost at high traffic | High (expensive server) | Low per request (scale-out) |
| Resilience | Single point of failure | Isolation + self-healing |
| Recommended for | < 1,000 devices | > 5,000 devices |

**Operational conclusion:** for an IoT platform with under 1,000 devices (~200 req/s), the monolithic architecture is the right choice — the added complexity of microservices isn't justified. For ecosystems exceeding 5,000 devices or 1,000 req/s, microservices offer a clear competitive advantage through automatic scaling and resilience. Between these thresholds, the architectural decision depends on budget, team expertise, and future growth plans.

---

## Future Improvements

Planned directions for further development, based on the findings above:

- **Reduce latency via Redis pipelining.** The three sequential Redis operations on the hot path are the current limiting factor for response throughput. Combining them into a single network round-trip via pipelining (natively supported by the `ioredis` library) would cut per-request latency and could meaningfully increase throughput **without any additional hardware**.

- **Migrate to the MQTT protocol.** MQTT would provide real push notifications to devices (under 100 ms), lower per-message overhead, and configurable QoS levels. Plan: implement an MQTT broker as an alternative to the HTTP endpoint, followed by comparative benchmarks between the two protocols on the same platform.

- **Real-scale testing with a multi-node cluster.** All AWS experiments ran on a single node (single-node Minikube, one Kafka broker, one TimescaleDB instance). Migrating to a multi-node Kubernetes cluster would allow distributing TimescaleDB writes (via sharding or replicas) and empirically verifying scaling beyond a single physical node — the one aspect the current study could not confirm.

**Overall takeaway:** start simple (a PostgreSQL-backed monolith), monitor real traffic and actual bottlenecks, optimize only what the data confirms is a bottleneck, and migrate to microservices only once the metrics justify the added infrastructure complexity.
