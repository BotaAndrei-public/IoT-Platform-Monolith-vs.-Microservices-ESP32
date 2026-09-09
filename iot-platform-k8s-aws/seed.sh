#!/bin/bash
# Seed database with 2000 devices
set -euo pipefail

echo "=== Waiting for TimescaleDB to be ready ==="
kubectl wait --for=condition=Ready pod -l app=timescaledb -n iot-platform --timeout=120s

echo "=== Populating database ==="
kubectl cp simulator/seed.sql iot-platform/timescaledb-0:/tmp/seed.sql
kubectl exec -n iot-platform timescaledb-0 -- psql -U iotuser -d iotplatform -f /tmp/seed.sql

echo "=== Verifying created devices ==="
kubectl exec -n iot-platform timescaledb-0 -- psql -U iotuser -d iotplatform -c "SELECT COUNT(*) as devices FROM devices;"

echo "=== Saving device list for simulator ==="
kubectl exec -n iot-platform timescaledb-0 -- psql -U iotuser -d iotplatform -P pager=off -c \
  "SELECT d.id, d.name, d.api_key, s.id, s.name FROM devices d JOIN sensors s ON s.device_id = d.id ORDER BY d.name, s.name;" \
  > simulator/lista_boti.txt

echo "✓ Seeding complete! $(wc -l < simulator/lista_boti.txt) lines written to simulator/lista_boti.txt"