import os
import requests
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8000")

class LearningModule(BaseModel):
    module_id: str
    title: str
    difficulty: str

class LearningPath(BaseModel):
    student_id: str
    current_focus: str
    recommended_modules: List[LearningModule]

def verify_student(authorization: str = Header(...)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")
    
    token = authorization.replace("Bearer ", "")
    try:
        res = requests.get(f"{AUTH_SERVICE_URL}/verify?token={token}")
        res.raise_for_status()
        return res.json().get("student_id")
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/modules", response_model=List[LearningModule])
def get_catalog():
    return [
        {"module_id": "m1", "title": "Introduction to Algebra", "difficulty": "beginner"},
        {"module_id": "m2", "title": "Advanced Calculus", "difficulty": "expert"}
    ]

@app.post("/path/generate", response_model=LearningPath)
def generate_dynamic_path(student_id: str = Depends(verify_student)):
    ai_recommendations = [
        {"module_id": "m1", "title": "Introduction to Algebra", "difficulty": "beginner"}
    ]
    
    return {
        "student_id": student_id,
        "current_focus": "Foundational Math",
        "recommended_modules": ai_recommendations
    }