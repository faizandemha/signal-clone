import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app import models, schemas
from app.config import MAX_UPLOAD_MB, UPLOAD_DIR
from app.security import get_current_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("", response_model=schemas.AttachmentOut)
async def upload_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
):
    """Store an attachment (image or file) on disk and hand back a URL the
    message can reference. Deliberately simple - no cloud storage - since
    this is a demo app; see README for the caveat on ephemeral hosts."""
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_MB}MB)")
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    ext = os.path.splitext(file.filename or "")[1][:10]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, stored_name)
    with open(path, "wb") as f:
        f.write(contents)

    return schemas.AttachmentOut(
        url=f"/uploads/{stored_name}",
        name=file.filename or stored_name,
        content_type=file.content_type or "application/octet-stream",
        size=len(contents),
    )
