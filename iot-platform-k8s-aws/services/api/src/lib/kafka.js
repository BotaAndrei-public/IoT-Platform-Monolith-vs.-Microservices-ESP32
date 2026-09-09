const { Kafka, Partitioners } = require('kafkajs');
let producer = null;
let connected = false;
const kafka = new Kafka({ clientId:'iot-api', brokers:(process.env.KAFKA_BROKERS||'kafka:9092').split(','),
  retry:{initialRetryTime:300,retries:10} });


async function getProducer() {
  if (!producer) {
    producer = kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner, allowAutoTopicCreation:true });
    producer.on('producer.disconnect', () => { connected = false; console.log('[Kafka] Producer disconnected'); });
    producer.on('producer.connect', () => { connected = true; console.log('[Kafka] Producer connected'); });
  }
  if (!connected) {
    await producer.connect();
  }
  return producer;
}

async function publishTelemetry(deviceId, userId, readings) {
  const p = await getProducer();
  await p.send({ topic:'iot.telemetry', acks: 0, messages:[{
    key: deviceId,
    value: JSON.stringify({ device_id:deviceId, user_id:userId, readings, received_at:new Date().toISOString() })
  }]});
}
module.exports = { getProducer, publishTelemetry };
