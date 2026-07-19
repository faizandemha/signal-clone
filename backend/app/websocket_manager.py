"""In-memory connection registry + broadcast helpers for real-time events.

Each connected user may have multiple sockets (multiple tabs). Events are
broadcast to every conversation member that currently has a live socket.
"""

import json
from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: Dict[str, Set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        sockets = self.active.get(user_id)
        if sockets and websocket in sockets:
            sockets.remove(websocket)
        if sockets is not None and not sockets:
            self.active.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self.active.get(user_id))

    async def send_to_user(self, user_id: str, payload: dict) -> None:
        sockets = list(self.active.get(user_id, set()))
        data = json.dumps(payload, default=str)
        for ws in sockets:
            try:
                await ws.send_text(data)
            except Exception:
                self.disconnect(user_id, ws)

    async def send_to_users(self, user_ids, payload: dict) -> None:
        for uid in user_ids:
            await self.send_to_user(uid, payload)


manager = ConnectionManager()
