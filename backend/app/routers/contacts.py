import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session as DBSession

from app import models, schemas
from app.database import get_db
from app.security import get_current_user

router = APIRouter(prefix="/api", tags=["contacts"])

PHONE_RE = re.compile(r"^\+?[0-9()\-\s]{7,20}$")


def looks_like_phone(value: str) -> bool:
    return bool(PHONE_RE.match(value.strip())) and any(ch.isdigit() for ch in value)


def find_user_by_handle(db: DBSession, value: str) -> models.User | None:
    """Look a user up the way another person would find them: by their
    public @username, or by phone number if it looks like one. Deliberately
    does NOT match on email - someone's login email is private, not a
    discovery handle (this mirrors how Signal itself only lets you find
    people by phone number or a chosen username, never by an internal ID)."""
    value = value.strip()
    if value.startswith("@"):
        value = value[1:]

    user = db.query(models.User).filter(models.User.username == value.lower()).first()
    if user:
        return user

    if looks_like_phone(value):
        return db.query(models.User).filter(models.User.identifier == value).first()

    return None


def is_blocked(db: DBSession, blocker_id: str, blocked_user_id: str) -> bool:
    return (
        db.query(models.Block)
        .filter(models.Block.blocker_id == blocker_id, models.Block.blocked_user_id == blocked_user_id)
        .first()
        is not None
    )


@router.get("/contacts", response_model=list[schemas.ContactOut])
def list_contacts(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    contacts = (
        db.query(models.Contact)
        .filter(models.Contact.owner_id == current_user.id)
        .join(models.User, models.Contact.contact_user_id == models.User.id)
        .order_by(models.User.display_name.asc())
        .all()
    )
    blocked_ids = {
        b.blocked_user_id for b in db.query(models.Block).filter(models.Block.blocker_id == current_user.id).all()
    }
    return [
        schemas.ContactOut(
            id=c.id, nickname=c.nickname, user=c.contact_user, is_blocked=c.contact_user_id in blocked_ids
        )
        for c in contacts
    ]


@router.get("/contacts/blocked", response_model=list[schemas.ContactOut])
def list_blocked(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    blocks = (
        db.query(models.Block)
        .filter(models.Block.blocker_id == current_user.id)
        .join(models.User, models.Block.blocked_user_id == models.User.id)
        .order_by(models.User.display_name.asc())
        .all()
    )
    return [schemas.ContactOut(id=b.id, nickname=None, user=b.blocked_user, is_blocked=True) for b in blocks]


@router.post("/contacts/{user_id}/block")
def block_contact(
    user_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't block yourself")
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if not is_blocked(db, current_user.id, user_id):
        db.add(models.Block(blocker_id=current_user.id, blocked_user_id=user_id))
        db.commit()
    return {"message": f"Blocked {target.display_name}"}


@router.delete("/contacts/{user_id}/block")
def unblock_contact(
    user_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db.query(models.Block).filter(
        models.Block.blocker_id == current_user.id, models.Block.blocked_user_id == user_id
    ).delete()
    db.commit()
    return {"message": "Unblocked"}


@router.post("/contacts", response_model=schemas.ContactOut)
def add_contact(
    payload: schemas.AddContactRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    target = find_user_by_handle(db, payload.identifier)
    if not target:
        raise HTTPException(status_code=404, detail="No user found with that username or phone number")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't add yourself")

    existing = (
        db.query(models.Contact)
        .filter(models.Contact.owner_id == current_user.id, models.Contact.contact_user_id == target.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Contact already added")

    contact = models.Contact(owner_id=current_user.id, contact_user_id=target.id, nickname=payload.nickname)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return schemas.ContactOut(id=contact.id, nickname=contact.nickname, user=contact.contact_user)


@router.get("/users/search", response_model=list[schemas.PublicUserOut])
def search_users(
    q: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Search by username or phone number only - never by email or display
    name, so people can't be found by information they didn't choose to
    make public."""
    q = q.strip()
    if not q:
        return []
    handle = q[1:] if q.startswith("@") else q
    like = f"%{handle}%"

    conditions = [models.User.username.ilike(like)]
    if looks_like_phone(q):
        conditions.append(models.User.identifier == q)

    blocked_ids = [
        b.blocked_user_id for b in db.query(models.Block).filter(models.Block.blocker_id == current_user.id).all()
    ]

    users = (
        db.query(models.User)
        .filter(
            models.User.id != current_user.id,
            models.User.username.isnot(None),
            models.User.id.notin_(blocked_ids) if blocked_ids else True,
            or_(*conditions),
        )
        .limit(20)
        .all()
    )
    return users
