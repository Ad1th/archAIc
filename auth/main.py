import os
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel

app = FastAPI()

class UserCredentials(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-learning-key")

@app.post("/register", response_model=Token)
def register_student(user: UserCredentials):
    token = "dummy_jwt_token_for_" + user.email
    return {"access_token": token, "token_type": "bearer"}

@app.post("/login", response_model=Token)
def login_student(user: UserCredentials):
    if user.password != "valid_password":
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = "dummy_jwt_token_for_" + user.email
    return {"access_token": token, "token_type": "bearer"}

@app.get("/verify")
def verify_token(token: str):
    if not token.startswith("dummy_jwt_token"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"valid": True, "student_id": "student_123"}