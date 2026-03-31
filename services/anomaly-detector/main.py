"""
ML Anomaly Detector Service — archAIc Layer 2
Port: 8006

Responsibilities:
  - Scrapes Prometheus every 10s for multivariate metrics:
    - HTTP 500-level error rates
    - Cluster p95 latency
    - Process CPU usage
  - Maintains a sliding window history of metrics
  - Runs a low-parameter multivariate anomaly detection model (Isolation Forest)
  - Sends webhooks to ai-operator if an anomaly is detected by the model.
  - Exposes /inject-metrics to directly push synthetic metric vectors (for testing/demos)
"""

import os
import time
import json
import logging
import asyncio
from datetime import datetime, timezone
import collections
from typing import Optional

import requests
import numpy as np
from sklearn.ensemble import IsolationForest
from fastapi import FastAPI, Query
from pydantic import BaseModel

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

log_history = []

def _log(level: str, message: str):
    log_obj = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level.upper(),
        "message": message
    }
    log_history.append(log_obj)
    if len(log_history) > 50:
        log_history.pop(0)
        
    getattr(logger, level.lower())(message)

# ─── App & Config ─────────────────────────────────────────────────────────────

app = FastAPI(title="ML Anomaly Detector", version="1.0.0")

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
AI_OPERATOR_URL = os.getenv("AI_OPERATOR_URL", "http://ai-operator:8005")

POLL_INTERVAL_SEC = 5
MAX_HISTORY = 720  # 1 hour of data at 1 poll per 5 seconds
MIN_SAMPLES_FOR_TRAINING = 12  # Build an accurate IsolationForest boundary over 60 seconds
CONTAMINATION = 0.1  # Strict outlier threshold (top 10%)
COOLDOWN_SEC = 20 # Prevent webhook spam
ZSCORE_THRESHOLD = 2.0  # Require standard 95% confidence deviation

# Store history as a deque of lists: [[error, latency, cpu], ...]
metric_history = collections.deque(maxlen=MAX_HISTORY)
last_anomaly_time = 0

model = IsolationForest(contamination=CONTAMINATION, n_estimators=50, random_state=42)

def query_prometheus_metric(query: str, default_val=0.0) -> float:
    url = f"{PROMETHEUS_URL}/api/v1/query"
    try:
        response = requests.get(url, params={'query': query}, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        results = data.get('data', {}).get('result', [])
        if not results:
            return default_val
            
        value_str = results[0]['value'][1]
        
        # In case the result is NaN
        if value_str == "NaN":
            return default_val
            
        return float(value_str)
    except Exception as e:
        _log("error", f"Failed to fetch metric `{query}` from Prometheus: {e}")
        return default_val

def fetch_multivariate_metrics() -> dict:
    """Fetches error rates, p95 latency, and cpu usage."""
    # Error rate: rate of 5xx responses globally
    error_q = 'sum(rate(http_requests_total{status=~"5.."}[1m]))'
    # Latency p95: Global across all services reporting
    latency_q = 'histogram_quantile(0.95, sum by(le) (rate(http_request_duration_seconds_bucket[1m])))'
    # CPU usage globally
    cpu_q = 'sum(rate(process_cpu_seconds_total[1m]))'
    
    return {
        "error_rate": query_prometheus_metric(error_q),
        "latency_p95": query_prometheus_metric(latency_q),
        "cpu_usage": query_prometheus_metric(cpu_q)
    }

def trigger_webhook(description: str, metrics: dict):
    """Sends JSON webhook to the ai-operator."""
    global last_anomaly_time
    now = time.time()
    
    if now - last_anomaly_time < COOLDOWN_SEC:
        _log("info", f"Anomaly detected, but currently in {COOLDOWN_SEC}s cooldown window. Ignoring.")
        return
        
    last_anomaly_time = now
    
    payload = {
        "service": "cluster-wide",
        "alert_type": "Multivariate_Model_Anomaly",
        "description": description,
        "context": f"Metrics at time of anomaly: {json.dumps(metrics)}",
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

def compute_zscores(X: np.ndarray, current: list) -> dict:
    """Compute z-scores for the current vector against history."""
    means = np.mean(X, axis=0)
    stds = np.std(X, axis=0)
    # Avoid division by zero — if std is 0, any deviation is significant
    stds = np.where(stds == 0, 1e-8, stds)
    zscores = (np.array(current) - means) / stds
    return {
        "error_rate": float(zscores[0]),
        "latency_p95": float(zscores[1]),
        "cpu_usage": float(zscores[2]),
    }

async def anomaly_detection_loop():
    """Background async loop for ML polling and streaming fit."""
    _log("info", "Starting ML Anomaly Detection Loop (Multivariate)...")
    await asyncio.sleep(5) 
    
    while True:
        try:
            metrics = fetch_multivariate_metrics()
            current_vector = [metrics["error_rate"], metrics["latency_p95"], metrics["cpu_usage"]]
            metric_history.append(current_vector)
            
            if len(metric_history) >= MIN_SAMPLES_FOR_TRAINING:
                # Prepare data
                X = np.array(metric_history)
                model.fit(X)
                
                # Predict (-1 is anomaly, 1 is normal)
                prediction = model.predict([current_vector])[0]
                
                # Calculate means & z-scores
                means = np.mean(X, axis=0)
                zscores = compute_zscores(X, current_vector)
                
                deviations = {
                    "error_rate": metrics["error_rate"] - means[0],
                    "latency_p95": metrics["latency_p95"] - means[1],
                    "cpu_usage": metrics["cpu_usage"] - means[2]
                }
                
                # Two detection paths:
                # 1. Isolation Forest flags anomaly AND threshold met (lowered thresholds)
                # 2. Z-score exceeds threshold on any metric (catches subtle shifts)
                zscore_anomaly = any(abs(z) > ZSCORE_THRESHOLD for z in zscores.values())
                iforest_anomaly = prediction == -1
                
                threshold_hit = (
                    deviations["error_rate"] > 0.0005
                    or deviations["latency_p95"] > 0.005
                    or deviations["cpu_usage"] > 0.0025
                )
                
                if (iforest_anomaly and threshold_hit) or zscore_anomaly:
                    culprit = max(deviations, key=deviations.get)
                    method = "IsolationForest" if iforest_anomaly else "Z-Score"
                    desc = f"Multivariate Anomaly Detected ({method})! Primary culprit: {culprit} deviated by +{deviations[culprit]:.4f} from mean. Z-scores: error={zscores['error_rate']:.2f}, latency={zscores['latency_p95']:.2f}, cpu={zscores['cpu_usage']:.2f}"
                    _log("warning", f"{desc} | Metrics: {metrics}")
                    trigger_webhook(desc, metrics)
                elif iforest_anomaly:
                    _log("info", f"IsolationForest flagged but deviation below threshold. Deviations: {deviations} | Z-scores: {zscores}")
                else:
                    _log("info", f"Traffic Normal: {current_vector}")
            else:
                _log("info", f"Gathering baseline... ({len(metric_history)}/{MIN_SAMPLES_FOR_TRAINING})")
                
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
        "architecture": "multivariate_embedded",
        "history_size": len(metric_history),
        "min_samples_reached": len(metric_history) >= MIN_SAMPLES_FOR_TRAINING
    }

@app.get("/history")
def get_history():
    return {"history": log_history}

@app.get("/status")
def status():
    """Returns current ML model state and recent metric history."""
    history_list = list(metric_history)
    means = np.mean(history_list, axis=0).tolist() if len(history_list) >= 2 else [0.0, 0.0, 0.0]
    latest = history_list[-1] if history_list else [0.0, 0.0, 0.0]
    return {
        "history_size": len(metric_history),
        "min_samples_for_training": MIN_SAMPLES_FOR_TRAINING,
        "ready_for_detection": len(metric_history) >= MIN_SAMPLES_FOR_TRAINING,
        "cooldown_remaining_sec": max(0, int(COOLDOWN_SEC - (time.time() - last_anomaly_time))),
        "latest_vector": {"error_rate": latest[0], "latency_p95": latest[1], "cpu_usage": latest[2]},
        "running_means": {"error_rate": means[0], "latency_p95": means[1], "cpu_usage": means[2]},
    }

class InjectMetricsRequest(BaseModel):
    error_rate: float = 0.5
    latency_p95: float = 3.0
    cpu_usage: float = 0.8
    repeat: int = 1  # how many times to push this vector (to fast-fill history)
    force_trigger: bool = False  # directly call trigger_webhook, bypassing model

@app.post("/inject-metrics")
async def inject_metrics(body: InjectMetricsRequest):
    """
    Directly push synthetic metric vectors into the Isolation Forest history
    and immediately run anomaly analysis.
    
    - Set repeat >= MIN_SAMPLES_FOR_TRAINING to fast-fill the baseline window.
    - Set force_trigger=true to fire the AI Operator webhook unconditionally.
    """
    global last_anomaly_time

    vector = [body.error_rate, body.latency_p95, body.cpu_usage]
    
    # Fill history with normal baseline first, then spike
    if len(metric_history) < MIN_SAMPLES_FOR_TRAINING:
        baseline = [0.001, 0.05, 0.01]  # near-zero normal traffic
        needed = MIN_SAMPLES_FOR_TRAINING - len(metric_history)
        _log("info", f"[inject-metrics] Pre-filling {needed} baseline samples to enable model training")
        for _ in range(needed):
            metric_history.append(baseline)

    # Push the anomalous vector N times
    for _ in range(max(1, body.repeat)):
        metric_history.append(vector)

    _log("warning", f"[inject-metrics] Injected synthetic anomaly vector: {vector} x{body.repeat}")

    if body.force_trigger:
        # Bypass model — directly fire webhook (useful for AI Operator testing)
        last_anomaly_time = 0  # reset cooldown
        desc = f"[FORCED] Synthetic anomaly injection: error_rate={body.error_rate:.3f}, latency_p95={body.latency_p95:.3f}s, cpu={body.cpu_usage:.3f}"
        trigger_webhook(desc, {"error_rate": body.error_rate, "latency_p95": body.latency_p95, "cpu_usage": body.cpu_usage})
        return {"status": "forced_webhook_fired", "vector": vector}

    # Run Isolation Forest immediately
    X = np.array(list(metric_history))
    model.fit(X)
    prediction = model.predict([vector])[0]
    means = np.mean(X, axis=0)
    deviations = {
        "error_rate": vector[0] - means[0],
        "latency_p95": vector[1] - means[1],
        "cpu_usage": vector[2] - means[2],
    }
    
    result = {
        "status": "analyzed",
        "prediction": "ANOMALY" if prediction == -1 else "NORMAL",
        "vector": vector,
        "means": means.tolist(),
        "deviations": deviations,
        "webhook_fired": False
    }

    if prediction == -1:
        threshold_hit = (
            deviations["error_rate"] > 0.0005
            or deviations["latency_p95"] > 0.005
            or deviations["cpu_usage"] > 0.0025
        )
        if threshold_hit:
            culprit = max(deviations, key=deviations.get)
            desc = f"[INJECTED] Multivariate Anomaly: Primary culprit={culprit} deviated by +{deviations[culprit]:.3f}"
            trigger_webhook(desc, {"error_rate": body.error_rate, "latency_p95": body.latency_p95, "cpu_usage": body.cpu_usage})
            result["webhook_fired"] = True
            result["culprit"] = culprit
        else:
            result["note"] = "Isolation Forest flagged anomaly but deviation below actionable threshold"
    
    return result

@app.post("/reset")
def reset_model():
    """Clear all metric history and reset the model state."""
    global last_anomaly_time
    metric_history.clear()
    last_anomaly_time = 0
    _log("info", "[reset] Metric history and cooldown cleared")
    return {"status": "reset", "history_size": 0}
