import os
import json
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from groq import Groq

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "service": "ai-operator",
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "trace_id": getattr(record, "trace_id", "N/A"),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger = logging.getLogger("ai-operator")
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False

execution_history = []

def _log(level: str, message: str, trace_id: str = "N/A"):
    extra = {"trace_id": trace_id}
    getattr(logger, level.lower())(message, extra=extra)

app = FastAPI(title="AI Operator Service", version="1.0.0")

API_KEY = os.environ.get("GROQ_API_KEY")
if not API_KEY:
    _log("error", "GROQ_API_KEY environment variable is missing! Groq calls will fail.")
else:
    _log("info", f"Loaded Groq API Key: {API_KEY[:4]}...{API_KEY[-4:]}")

client = Groq(
    api_key=API_KEY,
)

class AlertPayload(BaseModel):
    service: str
    alert_type: str
    description: str
    context: str
    trace_id: str = "N/A"

@app.post("/analyze")
async def analyze_alert(payload: AlertPayload, request: Request):
    _log("info", f"Analyzing {payload.service}: {payload.alert_type}", payload.trace_id)
    
    prompt = f"""
SYSTEM: You are an expert Kubernetes Site Reliability Engineer managing the 'archaics' namespace.
Analyze this outage:
SERVICE: {payload.service}
ALERT: {payload.alert_type} - {payload.description}
CONTEXT: {payload.context}

CRITICAL REQUIREMENT: The "command" field MUST contain a strict, valid kubectl command that directly mitigates the issue in the 'archaics' namespace.
Examples of valid commands you should emit depending on the outage:
- Restarting (clears transient errors/timeouts): kubectl rollout restart deployment/<target_service> -n archaics
- Scaling up (handles CPU/latency spikes): kubectl scale deployment/<target_service> --replicas=3 -n archaics
- Spinning down (prevents bad data cascade): kubectl scale deployment/<target_service> --replicas=0 -n archaics

TASK: Output ONLY valid JSON matching this structure:
{{
  "root_cause": "Explanation of what induced the outage",
  "confidence": 0.95,
  "action_type": "scale | rollback | restart",
  "target": "deployment_name",
  "command": "kubectl command"
}}
"""

    try:
        response = client.chat.completions.create(
            model='openai/gpt-oss-20b',
            messages=[
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        
        # Parse the JSON string from the response
        ai_response = json.loads(response.choices[0].message.content)
        _log("info", f"Remediation generated successfully: {json.dumps(ai_response)}", payload.trace_id)
        
        execution_history.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "trace_id": payload.trace_id,
            "service": payload.service,
            "alert_type": payload.alert_type,
            "evidence": payload.context,
            "ai_response": ai_response,
        })
        if len(execution_history) > 50:
            execution_history.pop(0)
            
        return {
            "status": "success",
            "ai_operator_response": ai_response
        }

    except Exception as e:
        _log("error", f"Groq API failure: {str(e)}", payload.trace_id)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "key_loaded": bool(API_KEY)}

@app.get("/history")
async def get_history():
    return {"history": execution_history}