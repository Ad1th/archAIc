import os
import json
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
import google.genai as genai

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

def _log(level: str, message: str, trace_id: str = "N/A"):
    extra = {"trace_id": trace_id}
    getattr(logger, level.lower())(message, extra=extra)

app = FastAPI(title="AI Operator Service", version="1.0.0")

API_KEY = os.environ.get("GOOGLE_API_KEY")
if not API_KEY:
    _log("error", "GOOGLE_API_KEY environment variable is missing")
else:
    _log("info", f"Loaded API Key: {API_KEY[:4]}...{API_KEY[-4:]}")

client = genai.Client(api_key=API_KEY)

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
SYSTEM: You are an expert Kubernetes Site Reliability Engineer.
Analyze this outage:
SERVICE: {payload.service}
ALERT: {payload.alert_type} - {payload.description}
CONTEXT: {payload.context}

TASK: Output ONLY raw JSON matching this structure:
{{
  "root_cause": "string",
  "confidence": float,
  "action_type": "scale | rollback | restart",
  "target": "deployment_name",
  "command": "kubectl command"
}}
"""

    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
        )
        
        raw_text = response.text.strip()
        
        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            if lines[0].startswith("```"):
                raw_text = "\n".join(lines[1:-1])
            else:
                raw_text = raw_text.strip("`")
        
        ai_response = json.loads(raw_text.strip())
        _log("info", "Remediation generated successfully", payload.trace_id)
        
        return {
            "status": "success",
            "ai_operator_response": ai_response
        }

    except Exception as e:
        _log("error", f"Gemini API failure: {str(e)}", payload.trace_id)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "key_loaded": bool(API_KEY)}