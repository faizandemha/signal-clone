import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.security import get_user_from_token
from app.websocket_manager import manager
from app.routers.conversations import create_and_broadcast_message
from app import models

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    db = SessionLocal()
    user = get_user_from_token(token, db)
    if not user:
        await websocket.close(code=4401)
        db.close()
        return

    await manager.connect(user.id, websocket)
    user.is_online = True
    user.last_seen = datetime.utcnow()
    db.commit()

    await _broadcast_presence(db, user, True)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event_type = data.get("type")

            if event_type == "message":
                conversation_id = data.get("conversation_id")
                content = (data.get("content") or "").strip()
                reply_to_id = data.get("reply_to_id")
                if not conversation_id or not content:
                    continue
                membership = (
                    db.query(models.ConversationMember)
                    .filter(
                        models.ConversationMember.conversation_id == conversation_id,
                        models.ConversationMember.user_id == user.id,
                    )
                    .first()
                )
                if not membership:
                    continue
                conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
                try:
                    await create_and_broadcast_message(db, conv, user, content, reply_to_id)
                except HTTPException as exc:
                    await websocket.send_text(
                        json.dumps({"type": "error", "detail": exc.detail, "conversation_id": conversation_id})
                    )

            elif event_type == "typing":
                conversation_id = data.get("conversation_id")
                is_typing = bool(data.get("is_typing"))
                conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
                if not conv:
                    continue
                other_ids = [m.user_id for m in conv.members if m.user_id != user.id]
                await manager.send_to_users(
                    other_ids,
                    {
                        "type": "typing",
                        "conversation_id": conversation_id,
                        "user_id": user.id,
                        "display_name": user.display_name,
                        "is_typing": is_typing,
                    },
                )

            elif event_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user.id, websocket)
        if not manager.is_online(user.id):
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.commit()
            await _broadcast_presence(db, user, False)
        db.close()


async def _broadcast_presence(db, user: models.User, is_online: bool) -> None:
    """Tell everyone who shares a conversation with this user that their
    online status changed (mocked presence)."""
    memberships = db.query(models.ConversationMember).filter(models.ConversationMember.user_id == user.id).all()
    conv_ids = [m.conversation_id for m in memberships]
    if not conv_ids:
        return
    peer_ids = {
        m.user_id
        for m in db.query(models.ConversationMember)
        .filter(models.ConversationMember.conversation_id.in_(conv_ids), models.ConversationMember.user_id != user.id)
        .all()
    }
    # Naive UTC datetime - attach an explicit UTC offset before turning it
    # into a string, or the browser's `new Date(...)` will misread it as
    # local time (see schemas.py's UTCDateTime for the same fix elsewhere).
    last_seen = user.last_seen
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)

    await manager.send_to_users(
        peer_ids,
        {
            "type": "presence",
            "user_id": user.id,
            "is_online": is_online,
            "last_seen": last_seen.isoformat(),
        },
    )
