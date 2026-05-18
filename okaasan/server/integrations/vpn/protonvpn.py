"""Proton VPN CLI provider (wraps the ``protonvpn`` binary)."""
from __future__ import annotations

import asyncio
import logging
import re
import shutil

from .base import VPNProvider, VPNStatus

log = logging.getLogger("okaasan.vpn.protonvpn")

_KV_RE = re.compile(r"^(.+?):\s+(.+)$")


class ProtonVPN(VPNProvider):
    name = "protonvpn"

    def __init__(self, binary: str | None = None):
        self._binary = binary or shutil.which("protonvpn")

    def _bin(self) -> str:
        if self._binary:
            return self._binary
        raise RuntimeError(
            "protonvpn CLI not found on PATH. "
            "Install it with: pip install proton-vpn-cli"
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
            raise RuntimeError(f"protonvpn {' '.join(args)} timed out after {timeout}s")
        return proc.returncode or 0, stdout.decode(), stderr.decode()

    # ── Interface ──────────────────────────────────────────────────

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
        else:
            if country:
                cmd.extend(["--country", country])
            if city:
                cmd.extend(["--city", city])
            if p2p:
                cmd.append("--p2p")

        log.info("protonvpn %s", " ".join(cmd))
        rc, out, err = await self._run(*cmd, timeout=60)
        combined = (out + err).strip()
        if rc != 0:
            raise RuntimeError(f"protonvpn connect failed (rc={rc}): {combined}")
        log.info("protonvpn connect → %s", combined)
        return combined or "Connected"

    async def disconnect(self) -> str:
        rc, out, err = await self._run("disconnect")
        combined = (out + err).strip()
        if rc != 0:
            raise RuntimeError(f"protonvpn disconnect failed (rc={rc}): {combined}")
        log.info("protonvpn disconnect → %s", combined)
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

        connected = fields.get("status", "").lower() not in ("disconnected", "")

        iface = self.detect_interface() if connected else None

        return VPNStatus(
            connected=connected,
            server=fields.get("server"),
            country=fields.get("country"),
            city=fields.get("city"),
            ip=fields.get("ip"),
            protocol=fields.get("protocol"),
            load=fields.get("load"),
            interface=iface,
            extra=fields,
        )

    async def countries(self) -> list[dict]:
        rc, out, err = await self._run("countries", "list")
        results: list[dict] = []
        for line in out.strip().splitlines():
            line = line.strip()
            if not line or line.startswith("-") or line.lower().startswith("country"):
                continue
            parts = line.split()
            if len(parts) >= 2:
                code = parts[-1].strip("()")
                name = " ".join(parts[:-1])
                results.append({"name": name, "code": code})
        return results

    def detect_interface(self) -> str | None:
        """Find the active tun/wg/proton interface."""
        import os

        net_dir = "/sys/class/net"
        if not os.path.isdir(net_dir):
            return None
        for iface in sorted(os.listdir(net_dir)):
            if iface.startswith(("tun", "wg", "proton")):
                return iface
        return None
