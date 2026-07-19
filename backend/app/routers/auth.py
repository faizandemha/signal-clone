from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession

from app import models, schemas
from app.config import MOCK_OTP
from app.database import get_db
from app.device import label_for_user_agent
from app.security import get_current_session, get_current_user
from app.websocket_manager import manager

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.RequestOtpResponse)
def request_otp(payload: schemas.RegisterRequest, db: DBSession = Depends(get_db)):
    """Step 1: issue an OTP for a phone number / username / email.

    Works for both brand-new users and returning users (i.e. this endpoint
    doubles as "login" - Signal's real flow is unified the same way).

    Verification is mocked for every identifier type (email, phone, or
    username) - a fixed code is generated and returned directly in the
    response rather than actually delivered, per the assignment spec
    ("verification can be mocked with a fixed OTP"). This is what keeps the
    seeded demo accounts (alice/bob/..., and the phone-number account
    +12125550123) working without any external provider setup.
    """
    identifier = payload.identifier.strip()

    db.add(models.OtpRequest(identifier=identifier, otp=MOCK_OTP))
    db.commit()

    return schemas.RequestOtpResponse(message="OTP sent (mocked)", otp_hint=MOCK_OTP)


@router.post("/verify", response_model=schemas.AuthResponse)
def verify_otp(payload: schemas.VerifyOtpRequest, request: Request, db: DBSession = Depends(get_db)):
    identifier = payload.identifier.strip()
    latest_otp = (
        db.query(models.OtpRequest)
        .filter(models.OtpRequest.identifier == identifier, models.OtpRequest.consumed.is_(False))
        .order_by(models.OtpRequest.created_at.desc())
        .first()
    )
    if not latest_otp or latest_otp.otp != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    latest_otp.consumed = True

    user = db.query(models.User).filter(models.User.identifier == identifier).first()
    is_new_user = user is None
    if is_new_user:
        user = models.User(identifier=identifier, display_name=identifier)
        db.add(user)
        db.commit()
        db.refresh(user)

    # Each successful login is its own session/"linked device" entry - logging
    # out one device (see /auth/logout) doesn't touch the others.
    device_label = label_for_user_agent(request.headers.get("user-agent"))
    session = models.Session(user_id=user.id, device_label=device_label)
    db.add(session)
    db.commit()
    db.refresh(session)

    return schemas.AuthResponse(token=session.token, user=user, is_new_user=is_new_user)


@router.post("/profile", response_model=schemas.UserOut)
def complete_profile(
    payload: schemas.CompleteProfileRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # username is the public @handle other people search/add contacts by -
    # required, and must be globally unique (case-insensitive).
    taken = (
        db.query(models.User)
        .filter(models.User.username == payload.username, models.User.id != current_user.id)
        .first()
    )
    if taken:
        raise HTTPException(status_code=409, detail="That username is already taken")

    current_user.username = payload.username
    current_user.display_name = payload.display_name.strip() or current_user.display_name
    if payload.avatar_color:
        current_user.avatar_color = payload.avatar_color
    if payload.about is not None:
        current_user.about = payload.about
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    current_session: models.Session = Depends(get_current_session),
):
    # Only revoke THIS device's session - other logged-in devices/tabs stay
    # signed in, same as real Signal.
    db.delete(current_session)
    remaining = db.query(models.Session).filter(models.Session.user_id == current_user.id).count()
    if remaining == 0:
        current_user.is_online = False
        current_user.last_seen = datetime.utcnow()
    db.commit()
    return {"message": "logged out"}


@router.get("/sessions", response_model=List[schemas.SessionOut])
def list_sessions(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    current_session: models.Session = Depends(get_current_session),
):
    """The "linked devices" list - every browser/device currently logged
    into this account."""
    sessions = (
        db.query(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .order_by(models.Session.last_active_at.desc())
        .all()
    )
    return [
        schemas.SessionOut(
            id=s.id,
            device_label=s.device_label,
            created_at=s.created_at,
            last_active_at=s.last_active_at,
            is_current=(s.id == current_session.id),
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Remotely log out a device - the "Remove" action in linked devices."""
    session = (
        db.query(models.Session)
        .filter(models.Session.id == session_id, models.Session.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": "Device logged out"}
