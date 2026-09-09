const BASE = '/api';

function getToken() {
  return localStorage.getItem('iot_token');
}

async function request(method, path, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Daca avem token expirat -> logout
  if (res.status === 401) {
    localStorage.removeItem('iot_token');
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // auth
  getGoogleLoginUrl: ()       => request('GET', '/auth/google'),
  getMe: ()                   => request('GET', '/auth/me'),
  logout: ()                  => request('POST', '/auth/logout'),

  // devices
  getDevices: ()              => request('GET', '/devices'),
  getDevice: (id)             => request('GET', `/devices/${id}`),
  createDevice: (body)        => request('POST', '/devices', body),
  updateDevice: (id, body)    => request('PUT', `/devices/${id}`, body),
  deleteDevice: (id)          => request('DELETE', `/devices/${id}`),

  // sensors
  createSensor: (devId, body)          => request('POST', `/devices/${devId}/sensors`, body),
  updateSensor: (devId, sId, body)     => request('PUT', `/devices/${devId}/sensors/${sId}`, body),
  deleteSensor: (devId, sId)           => request('DELETE', `/devices/${devId}/sensors/${sId}`),

  // telemetry
  getTelemetry: (deviceId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/telemetry/${deviceId}${q ? '?' + q : ''}`);
  },
  getLatest: (deviceId)       => request('GET', `/telemetry/${deviceId}/latest`),
  getStats: (deviceId, sensorId) => request('GET', `/telemetry/${deviceId}/stats/${sensorId}`),

  // Releu'
  setRelay: (sensorId, body)  => request('POST', `/relay/${sensorId}`, body),

  // Alerte
  getAlerts: (params = {})    => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/alerts${q ? '?' + q : ''}`);
  },
  acknowledgeAlert: (id)      => request('POST', `/alerts/${id}/acknowledge`),
  acknowledgeAll: (deviceId)  => request('POST', '/alerts/acknowledge-all', { deviceId }),

  // Alert toggle + cooldown / senzor
  updateSensorAlert: (devId, sId, body) =>
    request('PATCH', `/devices/${devId}/sensors/${sId}/alert`, body),
};
