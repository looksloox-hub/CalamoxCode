"""In-process event bus for real-time dashboard updates.

Backend operations (task creation, agent activity, …) publish events here;
the WebSocket endpoint subscribes and fans them out to connected clients.
"""

import asyncio
from typing import Awaitable, Callable

Handler = Callable[[dict], Awaitable[None]]


class EventBus:
    """Minimal async pub/sub used to stream events to WebSocket clients."""

    def __init__(self) -> None:
        self._handlers: list[Handler] = []
        self._lock = asyncio.Lock()

    def subscribe(self, handler: Handler) -> None:
        """Register a handler to receive every published event."""
        if handler not in self._handlers:
            self._handlers.append(handler)

    def unsubscribe(self, handler: Handler) -> None:
        """Remove a previously registered handler."""
        if handler in self._handlers:
            self._handlers.remove(handler)

    async def publish(self, event: dict) -> None:
        """Deliver an event to all subscribers; failures never propagate."""
        for handler in list(self._handlers):
            try:
                await handler(event)
            except Exception:
                pass


# Singleton shared across the app
bus = EventBus()
