"""VPN integration — pluggable provider system."""
from .routes import create_router as create_vpn_router

__all__ = ["create_vpn_router"]
