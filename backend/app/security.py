from datetime import datetime

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app import models
from app.database import get_db


def get_current_session(
    authorization: str | None = Header(default=None),
    db: DBSession = Depends(get_db),
) -> models.Session:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = db.query(models.Session).filter(models.Session.token == token).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    # Cheap presence signal for the "linked devices" list - updated on every
    # authenticated request.
    session.last_active_at = datetime.utcnow()
    db.commit()
    return session


def get_current_user(
    session: models.Session = Depends(get_current_session),
    db: DBSession = Depends(get_db),
) -> models.User:
    user = db.query(models.User).filter(models.User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_user_from_token(token: str, db: DBSession) -> models.User | None:
    session = db.query(models.Session).filter(models.Session.token == token).first()
    if not session:
        return None
    return db.query(models.User).filter(models.User.id == session.user_id).first()
