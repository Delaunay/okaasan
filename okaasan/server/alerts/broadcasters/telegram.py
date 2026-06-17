"""Telegram broadcaster — sends alerts via Telegram Bot API."""
from __future__ import annotations

import logging
import urllib.request
import urllib.parse
import json

from . import Broadcaster

log = logging.getLogger("okaasan.alerts.broadcasters.telegram")

_URGENCY_EMOJI = {
    "critical": "\u26a0\ufe0f",  # warning sign
    "warning": "\U0001f7e1",     # yellow circle
    "info": "\u2139\ufe0f",      # info
}


class TelegramBroadcaster(Broadcaster):
    @property
    def type_id(self) -> str:
        return "telegram"

    @property
    def display_name(self) -> str:
        return "Telegram"

    def send(self, config: dict, target: str, message: str, urgency: str) -> bool:
        bot_token = config.get("bot_token", "")
        chat_id = target or config.get("chat_id", "")

        if not bot_token or not chat_id:
            log.error("Telegram broadcaster missing bot_token or chat_id")
            return False

        emoji = _URGENCY_EMOJI.get(urgency, "")
        text = f"{emoji} {message}" if emoji else message

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        }).encode()

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
                if result.get("ok"):
                    log.debug("Telegram message sent to chat %s", chat_id)
                    return True
                else:
                    log.error("Telegram API error: %s", result)
                    return False
        except Exception as e:
            log.error("Failed to send Telegram message: %s", e)
            return False

    def validate_config(self, config: dict) -> list[str]:
        errors = []
        if not config.get("bot_token"):
            errors.append("bot_token is required")
        if not config.get("chat_id"):
            errors.append("chat_id is required (default target)")
        return errors
