"""NordVPN CLI provider (wraps the ``nordvpn`` binary)."""
from __future__ import annotations

import asyncio
import logging
import re
import shutil

from .base import VPNProvider, VPNStatus

log = logging.getLogger("okaasan.vpn.nordvpn")

_KV_RE = re.compile(r"^(.+?):\s+(.+)$")


class NordVPN(VPNProvider):
    name = "nordvpn"

    def __init__(self, binary: str | None = None):
        self._binary = binary or shutil.which("nordvpn")

    def _bin(self) -> str:
        if self._binary:
            return self._binary
        raise RuntimeError(
            "nordvpn CLI not found on PATH. "
            "Install it from: https://nordvpn.com/download/linux/"
        )

    async def _run(self, *args: str, timeout: float = 30) -> tuple[int, str, str]:
        proc = await asyncio.create_subprocess_exec(
            self._bin(), *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"nordvpn {' '.join(args)} timed out after {timeout}s")
        return proc.returncode or 0, stdout.decode(), stderr.decode()

    async def connect(
        self,
        *,
        country: str | None = None,
        city: str | None = None,
        server: str | None = None,
        p2p: bool = False,
    ) -> str:
        cmd: list[str] = ["connect"]
        if server:
            cmd.append(server)
        elif country:
            cmd.append(country)
            if city:
                cmd.append(city)
        elif p2p:
            cmd.extend(["--group", "P2P"])

        log.info("nordvpn %s", " ".join(cmd))
        rc, out, err = await self._run(*cmd, timeout=60)
        combined = (out + err).strip()
        if rc != 0:
            raise RuntimeError(f"nordvpn connect failed (rc={rc}): {combined}")
        log.info("nordvpn connect → %s", combined)
        return combined or "Connected"

    async def disconnect(self) -> str:
        rc, out, err = await self._run("disconnect")
        combined = (out + err).strip()
        if rc != 0:
            raise RuntimeError(f"nordvpn disconnect failed (rc={rc}): {combined}")
        log.info("nordvpn disconnect → %s", combined)
        return combined or "Disconnected"

    async def status(self) -> VPNStatus:
        rc, out, err = await self._run("status")
        text = out.strip()
        if not text:
            text = err.strip()

        fields: dict[str, str] = {}
        for line in text.splitlines():
            m = _KV_RE.match(line.strip())
            if m:
                fields[m.group(1).strip().lower()] = m.group(2).strip()

        connected = fields.get("status", "").lower() == "connected"
        iface = self.detect_interface() if connected else None

        return VPNStatus(
            connected=connected,
            server=fields.get("hostname"),
            country=fields.get("country"),
            city=fields.get("city"),
            ip=fields.get("ip"),
            protocol=fields.get("current protocol"),
            load=fields.get("transfer"),
            interface=iface,
            extra=fields,
        )

    async def countries(self) -> list[dict]:
        rc, out, err = await self._run("countries")
        results: list[dict] = []
        for line in out.strip().splitlines():
            for name in line.split():
                name = name.strip().strip(",")
                if name and not name.startswith("-"):
                    results.append({"name": name, "code": name})
        return results

    async def account_info(self) -> dict:
        """Return account information (email, VPN service status)."""
        rc, out, err = await self._run("account")
        combined = (out + err).strip()
        if rc != 0:
            if "not logged in" in combined.lower() or "log in" in combined.lower():
                return {"logged_in": False, "error": combined}
            raise RuntimeError(f"nordvpn account failed: {combined}")

        fields: dict[str, str] = {}
        for line in combined.splitlines():
            m = _KV_RE.match(line.strip())
            if m:
                fields[m.group(1).strip().lower()] = m.group(2).strip()
        return {"logged_in": True, **fields}

    async def login(self, token: str | None = None) -> dict:
        """Log in to NordVPN using a token: nordvpn login --token <token>."""
        if token:
            rc, out, err = await self._run("login", "--token", token, timeout=30)
        else:
            rc, out, err = await self._run("login", timeout=10)

        combined = (out + err).strip()
        if token and rc == 0:
            return {"success": True, "message": combined}

        url_match = re.search(r"https://\S+", combined)
        if url_match:
            return {"success": False, "login_url": url_match.group(0), "message": combined}

        if rc != 0:
            return {"success": False, "error": combined}
        return {"success": True, "message": combined}

    async def logout(self) -> str:
        rc, out, err = await self._run("logout", timeout=15)
        combined = (out + err).strip()
        if rc != 0:
            raise RuntimeError(f"nordvpn logout failed: {combined}")
        return combined or "Logged out"

    def detect_interface(self) -> str | None:
        """Find the active NordLynx (wg) or OpenVPN (tun) interface."""
        import os

        net_dir = "/sys/class/net"
        if not os.path.isdir(net_dir):
            return None
        for iface in sorted(os.listdir(net_dir)):
            if iface.startswith(("nordlynx", "nordtun", "tun", "wg")):
                return iface
        return None
