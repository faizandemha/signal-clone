import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS, UPLOAD_DIR
from app.database import Base, engine
from app.routers import auth, contacts, conversations, uploads, ws

Base.metadata.create_all(bind=engine)
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="Signal Clone API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(contacts.router)
app.include_router(conversations.router)
app.include_router(uploads.router)
app.include_router(ws.router)

# Serves uploaded attachments back out (e.g. /uploads/<file>.png).
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"status": "ok", "service": "signal-clone-api"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}
