from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DBSession

from app import models, schemas
from app.database import get_db
from app.security import get_current_user
from app.websocket_manager import manager

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def serialize_message(msg: models.Message) -> schemas.MessageOut:
    reply = None
    if msg.reply_to:
        reply = schemas.ReplyPreview(
            id=msg.reply_to.id,
            content="This message was deleted" if msg.reply_to.is_deleted else msg.reply_to.content,
            sender_display_name=msg.reply_to.sender.display_name,
        )
    attachment = None
    if msg.attachment_url and not msg.is_deleted:
        attachment = schemas.AttachmentOut(
            url=msg.attachment_url,
            name=msg.attachment_name or "file",
            content_type=msg.attachment_type or "application/octet-stream",
            size=msg.attachment_size or 0,
        )
    return schemas.MessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        sender_display_name=msg.sender.display_name,
        sender_avatar_color=msg.sender.avatar_color,
        content=msg.content,
        status=msg.status.value if hasattr(msg.status, "value") else msg.status,
        created_at=msg.created_at,
        reply_to=reply,
        attachment=attachment,
        is_edited=msg.is_edited,
        is_deleted=msg.is_deleted,
    )


def serialize_conversation(db: DBSession, conv: models.Conversation, user_id: str) -> schemas.ConversationOut:
    my_membership = next((m for m in conv.members if m.user_id == user_id), None)

    last_message = (
        db.query(models.Message)
        .filter(models.Message.conversation_id == conv.id)
        .order_by(models.Message.created_at.desc())
        .first()
    )

    unread_count = 0
    if my_membership:
        q = db.query(models.Message).filter(
            models.Message.conversation_id == conv.id,
            models.Message.sender_id != user_id,
        )
        if my_membership.last_read_at:
            q = q.filter(models.Message.created_at > my_membership.last_read_at)
        unread_count = q.count()

    name = conv.name
    avatar_color = conv.avatar_color
    is_blocked = False
    if conv.type == models.ConversationType.direct:
        other = next((m for m in conv.members if m.user_id != user_id), None)
        if other:
            name = other.user.display_name
            avatar_color = other.user.avatar_color
            is_blocked = (
                db.query(models.Block)
                .filter(models.Block.blocker_id == user_id, models.Block.blocked_user_id == other.user_id)
                .first()
                is not None
            )

    return schemas.ConversationOut(
        id=conv.id,
        type=conv.type.value if hasattr(conv.type, "value") else conv.type,
        name=name,
        avatar_color=avatar_color,
        members=[schemas.MemberOut(user=m.user, is_admin=m.is_admin, joined_at=m.joined_at) for m in conv.members],
        last_message=serialize_message(last_message) if last_message else None,
        unread_count=unread_count,
        last_message_at=conv.last_message_at,
        chat_color=my_membership.chat_color if my_membership else None,
        wallpaper=my_membership.wallpaper if my_membership else None,
        is_blocked=is_blocked,
    )


def get_membership_or_404(db: DBSession, conversation_id: str, user_id: str) -> models.ConversationMember:
    membership = (
        db.query(models.ConversationMember)
        .filter(
            models.ConversationMember.conversation_id == conversation_id,
            models.ConversationMember.user_id == user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return membership


async def create_and_broadcast_message(
    db: DBSession,
    conversation: models.Conversation,
    sender: models.User,
    content: str,
    reply_to_id: Optional[str] = None,
    attachment_url: Optional[str] = None,
    attachment_name: Optional[str] = None,
    attachment_type: Optional[str] = None,
    attachment_size: Optional[int] = None,
) -> models.Message:
    if conversation.type == models.ConversationType.direct:
        other_member = next((m for m in conversation.members if m.user_id != sender.id), None)
        if other_member:
            blocked_either_way = (
                db.query(models.Block)
                .filter(
                    (
                        (models.Block.blocker_id == sender.id)
                        & (models.Block.blocked_user_id == other_member.user_id)
                    )
                    | (
                        (models.Block.blocker_id == other_member.user_id)
                        & (models.Block.blocked_user_id == sender.id)
                    )
                )
                .first()
            )
            if blocked_either_way:
                raise HTTPException(status_code=403, detail="You can't message this contact")

    message = models.Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        content=content,
        reply_to_id=reply_to_id,
        attachment_url=attachment_url,
        attachment_name=attachment_name,
        attachment_type=attachment_type,
        attachment_size=attachment_size,
    )
    db.add(message)
    db.flush()  # assign message.id before we reference it below
    conversation.last_message_at = datetime.utcnow()

    other_members = [m for m in conversation.members if m.user_id != sender.id]

    # Direct chats get real delivery/read ticks; if the other person is
    # online right now we consider the message instantly delivered.
    if conversation.type == models.ConversationType.direct and other_members:
        other = other_members[0]
        if manager.is_online(other.user_id):
            message.status = models.MessageStatus.delivered
        for m in other_members:
            db.add(
                models.MessageReceipt(
                    message_id=message.id,
                    user_id=m.user_id,
                    delivered_at=datetime.utcnow() if manager.is_online(m.user_id) else None,
                )
            )

    db.commit()
    db.refresh(message)

    payload = {"type": "message", "message": serialize_message(message).model_dump(mode="json")}
    all_member_ids = [m.user_id for m in conversation.members]
    await manager.send_to_users(all_member_ids, payload)

    if message.status == models.MessageStatus.delivered:
        await manager.send_to_user(
            sender.id,
            {
                "type": "message_status",
                "conversation_id": conversation.id,
                "message_id": message.id,
                "status": "delivered",
            },
        )

    return message


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=List[schemas.ConversationOut])
def list_conversations(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    memberships = (
        db.query(models.ConversationMember)
        .filter(models.ConversationMember.user_id == current_user.id)
        .all()
    )
    conv_ids = [m.conversation_id for m in memberships]
    if not conv_ids:
        return []
    convs = (
        db.query(models.Conversation)
        .filter(models.Conversation.id.in_(conv_ids))
        .order_by(models.Conversation.last_message_at.desc())
        .all()
    )
    return [serialize_conversation(db, c, current_user.id) for c in convs]


@router.post("/direct", response_model=schemas.ConversationOut)
def create_or_get_direct(
    payload: schemas.CreateDirectConversationRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    other = db.query(models.User).filter(models.User.id == payload.contact_user_id).first()
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    my_conv_ids = {
        m.conversation_id
        for m in db.query(models.ConversationMember).filter(models.ConversationMember.user_id == current_user.id)
    }
    their_conv_ids = {
        m.conversation_id
        for m in db.query(models.ConversationMember).filter(models.ConversationMember.user_id == other.id)
    }
    shared = my_conv_ids & their_conv_ids
    for cid in shared:
        conv = db.query(models.Conversation).filter(models.Conversation.id == cid).first()
        if conv and conv.type == models.ConversationType.direct:
            return serialize_conversation(db, conv, current_user.id)

    conv = models.Conversation(type=models.ConversationType.direct, created_by=current_user.id)
    db.add(conv)
    db.commit()
    db.refresh(conv)

    db.add(models.ConversationMember(conversation_id=conv.id, user_id=current_user.id, is_admin=True))
    db.add(models.ConversationMember(conversation_id=conv.id, user_id=other.id, is_admin=True))
    db.commit()
    db.refresh(conv)
    return serialize_conversation(db, conv, current_user.id)


@router.post("/group", response_model=schemas.ConversationOut)
def create_group(
    payload: schemas.CreateGroupRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Group name is required")
    member_ids = set(payload.member_ids) | {current_user.id}
    users = db.query(models.User).filter(models.User.id.in_(member_ids)).all()
    if len(users) < 2:
        raise HTTPException(status_code=400, detail="Pick at least one other member")

    conv = models.Conversation(
        type=models.ConversationType.group,
        name=payload.name.strip(),
        created_by=current_user.id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    for uid in member_ids:
        db.add(
            models.ConversationMember(
                conversation_id=conv.id,
                user_id=uid,
                is_admin=(uid == current_user.id),
            )
        )
    db.commit()
    db.refresh(conv)
    return serialize_conversation(db, conv, current_user.id)


@router.get("/{conversation_id}", response_model=schemas.ConversationOut)
def get_conversation(
    conversation_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_membership_or_404(db, conversation_id, current_user.id)
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    return serialize_conversation(db, conv, current_user.id)


@router.get("/{conversation_id}/messages", response_model=List[schemas.MessageOut])
def list_messages(
    conversation_id: str,
    before: Optional[str] = Query(default=None, description="ISO timestamp cursor"),
    limit: int = Query(default=50, le=200),
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_membership_or_404(db, conversation_id, current_user.id)
    q = db.query(models.Message).filter(models.Message.conversation_id == conversation_id)
    if before:
        q = q.filter(models.Message.created_at < before)
    messages = q.order_by(models.Message.created_at.desc()).limit(limit).all()
    messages.reverse()
    return [serialize_message(m) for m in messages]


@router.post("/{conversation_id}/messages", response_model=schemas.MessageOut)
async def send_message(
    conversation_id: str,
    payload: schemas.SendMessageRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_membership_or_404(db, conversation_id, current_user.id)
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    content = payload.content.strip()
    if not content and not payload.attachment_url:
        raise HTTPException(status_code=400, detail="Message can't be empty")
    message = await create_and_broadcast_message(
        db,
        conv,
        current_user,
        content,
        payload.reply_to_id,
        attachment_url=payload.attachment_url,
        attachment_name=payload.attachment_name,
        attachment_type=payload.attachment_type,
        attachment_size=payload.attachment_size,
    )
    return serialize_message(message)


def get_own_message_or_404(db: DBSession, conversation_id: str, message_id: str, user_id: str) -> models.Message:
    message = (
        db.query(models.Message)
        .filter(models.Message.id == message_id, models.Message.conversation_id == conversation_id)
        .first()
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.sender_id != user_id:
        raise HTTPException(status_code=403, detail="You can only edit or delete your own messages")
    return message


@router.patch("/{conversation_id}/messages/{message_id}", response_model=schemas.MessageOut)
async def edit_message(
    conversation_id: str,
    message_id: str,
    payload: schemas.EditMessageRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_membership_or_404(db, conversation_id, current_user.id)
    message = get_own_message_or_404(db, conversation_id, message_id, current_user.id)
    if message.is_deleted:
        raise HTTPException(status_code=400, detail="Can't edit a deleted message")

    content = payload.content.strip()
    if not content and not message.attachment_url:
        raise HTTPException(status_code=400, detail="Message can't be empty")

    message.content = content
    message.is_edited = True
    message.edited_at = datetime.utcnow()
    db.commit()
    db.refresh(message)

    updated = serialize_message(message)
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    all_member_ids = [m.user_id for m in conv.members]
    await manager.send_to_users(
        all_member_ids, {"type": "message_edited", "conversation_id": conversation_id, "message": updated.model_dump(mode="json")}
    )
    return updated


@router.delete("/{conversation_id}/messages/{message_id}", response_model=schemas.MessageOut)
async def delete_message(
    conversation_id: str,
    message_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_membership_or_404(db, conversation_id, current_user.id)
    message = get_own_message_or_404(db, conversation_id, message_id, current_user.id)
    if message.is_deleted:
        raise HTTPException(status_code=400, detail="Message already deleted")

    # Soft delete: clear the actual content/attachment so nothing lingers in
    # the API response or DB dump, but keep the row so message ordering,
    # reply-to references, and read receipts stay intact.
    message.content = ""
    message.attachment_url = None
    message.attachment_name = None
    message.attachment_type = None
    message.attachment_size = None
    message.is_deleted = True
    db.commit()
    db.refresh(message)

    updated = serialize_message(message)
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    all_member_ids = [m.user_id for m in conv.members]
    await manager.send_to_users(
        all_member_ids, {"type": "message_deleted", "conversation_id": conversation_id, "message": updated.model_dump(mode="json")}
    )
    return updated


@router.post("/{conversation_id}/read")
async def mark_read(
    conversation_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    membership = get_membership_or_404(db, conversation_id, current_user.id)
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()

    unread = (
        db.query(models.Message)
        .filter(models.Message.conversation_id == conversation_id, models.Message.sender_id != current_user.id)
        .all()
    )
    now = datetime.utcnow()
    senders_to_notify = set()
    for msg in unread:
        if msg.status != models.MessageStatus.read:
            msg.status = models.MessageStatus.read
            senders_to_notify.add(msg.sender_id)
        receipt = (
            db.query(models.MessageReceipt)
            .filter(models.MessageReceipt.message_id == msg.id, models.MessageReceipt.user_id == current_user.id)
            .first()
        )
        if receipt:
            receipt.read_at = now
            if not receipt.delivered_at:
                receipt.delivered_at = now

    membership.last_read_at = now
    if unread:
        membership.last_read_message_id = unread[-1].id
    db.commit()

    for sender_id in senders_to_notify:
        await manager.send_to_user(
            sender_id,
            {"type": "message_status", "conversation_id": conversation_id, "status": "read", "reader_id": current_user.id},
        )
    return {"message": "marked read"}


@router.patch("/{conversation_id}/appearance", response_model=schemas.ConversationOut)
def update_appearance(
    conversation_id: str,
    payload: schemas.UpdateAppearanceRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Set YOUR chat color / wallpaper for this conversation - a personal
    preference, invisible to the other participant(s)."""
    membership = get_membership_or_404(db, conversation_id, current_user.id)
    if payload.chat_color is not None:
        membership.chat_color = payload.chat_color or None
    if payload.wallpaper is not None:
        membership.wallpaper = payload.wallpaper or None
    db.commit()
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    return serialize_conversation(db, conv, current_user.id)


@router.post("/{conversation_id}/members", response_model=schemas.ConversationOut)
def add_member(
    conversation_id: str,
    payload: schemas.AddMemberRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    membership = get_membership_or_404(db, conversation_id, current_user.id)
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if conv.type != models.ConversationType.group:
        raise HTTPException(status_code=400, detail="Can only add members to a group")
    if not membership.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can add members")

    exists = (
        db.query(models.ConversationMember)
        .filter(models.ConversationMember.conversation_id == conversation_id, models.ConversationMember.user_id == payload.user_id)
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="User already in group")

    target = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    db.add(models.ConversationMember(conversation_id=conversation_id, user_id=payload.user_id))
    db.commit()
    db.refresh(conv)
    return serialize_conversation(db, conv, current_user.id)


@router.delete("/{conversation_id}/members/{user_id}", response_model=schemas.ConversationOut)
def remove_member(
    conversation_id: str,
    user_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    membership = get_membership_or_404(db, conversation_id, current_user.id)
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if conv.type != models.ConversationType.group:
        raise HTTPException(status_code=400, detail="Can only remove members from a group")
    if not membership.is_admin and user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only admins can remove other members")

    target_membership = (
        db.query(models.ConversationMember)
        .filter(models.ConversationMember.conversation_id == conversation_id, models.ConversationMember.user_id == user_id)
        .first()
    )
    if not target_membership:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(target_membership)
    db.commit()
    db.refresh(conv)
    return serialize_conversation(db, conv, current_user.id)
