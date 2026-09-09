require("dotenv").config();
const { Kafka } = require("kafkajs");
const { Pool } = require("pg");
const Redis = require("ioredis");
const Minio = require("minio");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (t) => Math.min(t * 200, 5000),
});
const minio = new Minio.Client({
  endPoint: process.env.MINIO_HOST || "minio",
  port: parseInt(process.env.MINIO_PORT || "9000"),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});
const BUCKET = process.env.MINIO_BUCKET || "iot-archive";

const kafka = new Kafka({
  clientId: "worker-telemetry",
  brokers: (process.env.KAFKA_BROKERS || "kafka:9092").split(","),
  retry: { initialRetryTime: 500, retries: 10 },
});
const consumer = kafka.consumer({
  groupId: "worker-telemetry-group",
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

async function ensureBucket() {
  if (!(await minio.bucketExists(BUCKET))) {
    await minio.makeBucket(BUCKET, "us-east-1");
    console.log(`[MinIO] Bucket created: ${BUCKET}`);
  }
}

async function archiveToMinIO(deviceId, rows) {
  if (!rows.length) return;
  const fname = `${deviceId}/${new Date().toISOString().slice(0, 10)}-${Date.now()}.csv`;
  const csv =
    "sensor_id,value,recorded_at\n" +
    rows.map((r) => `${r.sensor_id},${r.value},${r.recorded_at}`).join("\n");
  await minio.putObject(BUCKET, fname, csv, csv.length, {
    "Content-Type": "text/csv",
  });
  console.log(`[MinIO] Archived ${rows.length} rows → ${fname}`);
}

async function processBatch(messages) {
  if (!messages.length) return;
  const allReadings = [];
  for (const msg of messages) {
    try {
      const { device_id, readings, received_at } = JSON.parse(
        msg.value.toString(),
      );
      for (const r of readings)
        allReadings.push({
          device_id,
          sensor_id: r.sensor_id,
          value: r.value,
          recorded_at: received_at || new Date().toISOString(),
        });
    } catch {}
  }
  if (!allReadings.length) return;

  // Batch INSERT
  const vals = [];
  const ph = allReadings.map((r, i) => {
    const b = i * 4;
    vals.push(r.device_id, r.sensor_id, r.value, r.recorded_at);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`;
  });
  await pool.query(
    `INSERT INTO telemetry(device_id,sensor_id,value,recorded_at) VALUES ${ph.join(",")}`,
    vals,
  );
  console.log(`[Worker] Inserted ${allReadings.length} readings`);

  // Redis latest values + device online
  const latestBySensor = {};
  for (const r of allReadings) {
    if (
      !latestBySensor[r.sensor_id] ||
      new Date(r.recorded_at) >
        new Date(latestBySensor[r.sensor_id].recorded_at)
    )
      latestBySensor[r.sensor_id] = r;
  }
  const pipe = redis.pipeline();
  for (const [sid, r] of Object.entries(latestBySensor))
    pipe.setex(
      `latest:${sid}`,
      3600,
      JSON.stringify({ value: r.value, recorded_at: r.recorded_at }),
    );
  const deviceIds = [...new Set(allReadings.map((r) => r.device_id))];
  for (const did of deviceIds) pipe.setex(`device:online:${did}`, 60, "1");
  await pipe.exec();

  // arhiveaza datele vechi
  for (const did of deviceIds) {
    const old = await pool.query(
      `SELECT sensor_id,value,recorded_at FROM telemetry WHERE device_id=$1 AND recorded_at<NOW()-INTERVAL '1 year' LIMIT 10000`,
      [did],
    );
    if (old.rows.length) {
      await archiveToMinIO(did, old.rows);
      await pool.query(
        `DELETE FROM telemetry WHERE device_id=$1 AND recorded_at<NOW()-INTERVAL '1 year'`,
        [did],
      );
    }
  }
}

async function run() {
  console.log("[Worker Telemetry] Starting...");
  await ensureBucket();
  await consumer.connect();
  await consumer.subscribe({ topics: ["iot.telemetry"], fromBeginning: false });
  console.log("[Worker Telemetry] Consuming iot.telemetry...");

  let batch = [];
  let timer = null;
  const flush = async () => {
    if (!batch.length) return;
    const toProcess = [...batch];
    batch = [];
    try {
      await processBatch(toProcess);
    } catch (err) {
      console.error("[Worker] Batch error:", err.message);
    }
  };

  await consumer.run({
    eachMessage: async ({ message }) => {
      batch.push(message);
      clearTimeout(timer);
      if (batch.length >= 100) await flush();
      else timer = setTimeout(flush, 500);
    },
  });
}

run().catch((err) => {
  console.error("[Worker Telemetry] Fatal:", err.message);
  process.exit(1);
});
process.on("SIGTERM", async () => {
  await consumer.disconnect();
  await pool.end();
  redis.disconnect();
  process.exit(0);
});
