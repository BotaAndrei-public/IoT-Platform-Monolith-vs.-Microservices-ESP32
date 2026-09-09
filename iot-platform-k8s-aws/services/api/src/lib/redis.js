const Redis = require('ioredis');
let redis = null;
function getRedis() {
  if (!redis) {
    redis = new Redis({ host: process.env.REDIS_HOST||'redis', port: parseInt(process.env.REDIS_PORT||'6379'),
      password: process.env.REDIS_PASSWORD||undefined, retryStrategy: (t)=>Math.min(t*100,3000), lazyConnect:true });
    redis.on('connect', ()=>console.log('[Redis] Connected'));
    redis.on('error',   (e)=>console.error('[Redis] Error:', e.message));
  }
  return redis;
}
const getDeviceByApiKey  = (k)   => getRedis().get(`apikey:${k}`).then(v=>v?JSON.parse(v):null);
const cacheDeviceApiKey  = (k,d,t=300) => getRedis().setex(`apikey:${k}`, t, JSON.stringify(d));
const invalidateApiKey   = (k)   => getRedis().del(`apikey:${k}`);
const setDeviceOnline    = (id,on=true) => on ? getRedis().setex(`device:online:${id}`,60,'1') : getRedis().del(`device:online:${id}`);
const isDeviceOnline     = (id)  => getRedis().exists(`device:online:${id}`).then(v=>v===1);
const setLatestValue     = (id,v,t) => getRedis().setex(`latest:${id}`, 3600, JSON.stringify({value:v,recorded_at:t}));
const getLatestValue     = (id)  => getRedis().get(`latest:${id}`).then(v=>v?JSON.parse(v):null);
const setRelayCommand    = (id,s,p) => getRedis().set(`relay:${id}`, JSON.stringify({state:s,percent:p,updated_at:new Date().toISOString()}));
const getRelayCommand    = (id)  => getRedis().get(`relay:${id}`).then(v=>v?JSON.parse(v):null);
async function getRelayCommandsForDevice(ids) {
  if (!ids.length) return [];
  const vals = await getRedis().mget(...ids.map(id=>`relay:${id}`));
  return ids.map((id,i)=>({sensor_id:id,...(vals[i]?JSON.parse(vals[i]):{state:0,percent:0})}));
}
const cacheSensors     = (deviceId, rows, ttl=60) => getRedis().setex(`sensors:${deviceId}`, ttl, JSON.stringify(rows));
const getCachedSensors = (deviceId) => getRedis().get(`sensors:${deviceId}`).then(v=>v?JSON.parse(v):null);
const invalidateSensors = (deviceId) => getRedis().del(`sensors:${deviceId}`);
module.exports = { getRedis, getDeviceByApiKey, cacheDeviceApiKey, invalidateApiKey,
  setDeviceOnline, isDeviceOnline, setLatestValue, getLatestValue,
  setRelayCommand, getRelayCommand, getRelayCommandsForDevice,
  cacheSensors, getCachedSensors, invalidateSensors };
