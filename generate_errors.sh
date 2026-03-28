#!/bin/bash

# generate_errors.sh
# Induces random failures across the archAIc services to trigger Prometheus alerts 
# and test the anomaly-detector and ai-operator pipeline.

echo "=========================================="
echo " Starting Chaos Experiment for AI-Ops     "
echo "=========================================="

# 1. Start injecting errors
echo "[1/3] Injecting 50% Error Rate on DB Service (30s duration)..."
curl -s -X POST "http://localhost:8002/inject-failure?type=error&probability=0.5&duration=30" > /dev/null

echo "[2/3] Injecting Latency on Auth Service (30s duration)..."
curl -s -X POST "http://localhost:8001/inject-failure?type=timeout&intensity=2&probability=0.5&duration=30" > /dev/null

# 2. Generate some traffic to ensure Prometheus scrapes the metrics
echo "[3/3] Generating traffic to trigger metrics & alerts..."
echo "Sending requests to Product Service..."
for i in {1..20}; do
    curl -s -o /dev/null -w " Request $i -> HTTP %{http_code}\n" http://localhost:8003/health
    sleep 1
done

echo ""
echo "=========================================="
echo " Failures injected and traffic generated! "
echo "=========================================="
echo "Check Prometheus/Alertmanager UI or run the following to see the AI in action:"
echo "  kubectl logs -f deployment/anomaly-detector -n archaics"
echo "  kubectl logs -f deployment/ai-operator -n archaics"
