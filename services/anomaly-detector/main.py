"""
ML Anomaly Detector Service — archAIc Layer 2
Port: 8006

Responsibilities:
  - Scrapes Prometheus every 10s for cluster-wide HTTP 500-level error rates.
  - Maintains a sliding window (1-hour) of metric history.
  - Continuously fits an IsolationForest ML model on the data.
  - Sends webhooks to ai-operator if a positive anomaly spike is detected.
"""

import os
import time
import json
import logging
import asyncio
from datetime import datetime, timezone
import collections

import requests
import numpy as np
from sklearn.ensemble import IsolationForest
from fastapi import FastAPI

# ─── Structured JSON Logger ───────────────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "service": "anomaly-detector",
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger = logging.getLogger("anomaly-detector")
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False

def _log(level: str, message: str):
    getattr(logger, level.lower())(message)

# ─── App & Config ─────────────────────────────────────────────────────────────

app = FastAPI(title="ML Anomaly Detector", version="1.0.0")

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
AI_OPERATOR_URL = os.getenv("AI_OPERATOR_URL", "http://ai-operator:8005")

POLL_INTERVAL_SEC = 10
MAX_HISTORY = 360 # 1 hour at 1 poll per 10 seconds
MIN_SAMPLES_FOR_TRAINING = 12 # Start fitting after 2 minutes of data
CONTAMINATION = 0.05 # Expect 5% of data to be anomalous

metric_history = collections.deque(maxlen=MAX_HISTORY)
last_anomaly_time = 0
COOLDOWN_SEC = 120 # don't fire anomaly webhook more than once every 2 mins

model = IsolationForest(contamination=CONTAMINATION, random_state=42)

def fetch_prometheus_metric():
    """Fetches the sum of 500 error rates across the cluster."""
    query = 'sum(rate(http_requests_total{status=~"5.."}[1m]))'
    url = f"{PROMETHEUS_URL}/api/v1/query"
    
    try:
        response = requests.get(url, params={'query': query}, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        results = data.get('data', {}).get('result', [])
        if not results:
            return 0.0
            
        value_str = results[0]['value'][1]
        return float(value_str)
    except Exception as e:
        _log("error", f"Failed to fetch metric from Prometheus: {e}")
        return None

def trigger_webhook(anomaly_value, baseline_mean):
    """Sends JSON webhook to the ai-operator."""
    global last_anomaly_time
    now = time.time()
    
    if now - last_anomaly_time < COOLDOWN_SEC:
        _log("info", "Anomaly detected, but currently in 120s cooldown window. Ignoring.")
        return
        
    last_anomaly_time = now
    
    payload = {
        "service": "cluster-wide",
        "alert_type": "IsolationForest_Anomaly",
        "description": f"ML model flagged current 500-error rate ({anomaly_value:.3f}) as anomaly against baseline mean ({baseline_mean:.3f}).",
        "context": f"Prometheus Webhook Trigger bridged by Anomaly Detector Microservice.",
        "trace_id": "ml-trigger-" + str(int(now))
    }
    
    webhook_url = f"{AI_OPERATOR_URL}/analyze"
    _log("warning", f"Firing ML Anomaly Webhook to {webhook_url}")
    
    try:
        req = requests.post(webhook_url, json=payload, timeout=8)
        req.raise_for_status()
        _log("info", f"Successfully handed off to AI Operator for RCA. Response: {req.text}")
    except Exception as e:
        _log("error", f"Failed to push webhook to AI Operator: {e}")

async def anomaly_detection_loop():
    """Background async loop for ML polling and streaming fit."""
    _log("info", "Starting ML Anomaly Detection Loop...")
    await asyncio.sleep(5) 
    
    while True:
        try:
            val = fetch_prometheus_metric()
            if val is not None:
                metric_history.append(val)
                
                # Re-train and predict dynamically!
                if len(metric_history) >= MIN_SAMPLES_FOR_TRAINING:
                    X = np.array(metric_history).reshape(-1, 1)
                    model.fit(X)
                    
                    # -1 means outlier, 1 means inlier
                    prediction = model.predict([[val]])[0]
                    baseline_mean = float(np.mean(metric_history))
                    
                    # Trigger only on statistically significant SPIKES (not drops to 0)
                    if prediction == -1 and val > baseline_mean and val > 0.05:
                        _log("warning", f"ANOMALY SPIKE DETECTED! Value: {val:.3f} (Mean: {baseline_mean:.3f})")
                        trigger_webhook(val, baseline_mean)
                    else:
                        _log("info", f"Traffic Normal. Val: {val:.3f} (Mean: {baseline_mean:.3f})")
                else:
                    _log("info", f"Gathering baseline... ({len(metric_history)}/{MIN_SAMPLES_FOR_TRAINING}) Val: {val:.3f}")
        except Exception as e:
             _log("error", f"Error in detection loop: {e}")

        await asyncio.sleep(POLL_INTERVAL_SEC)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(anomaly_detection_loop())

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "anomaly-detector", 
        "history_size": len(metric_history),
        "min_samples_reached": len(metric_history) >= MIN_SAMPLES_FOR_TRAINING
    }
