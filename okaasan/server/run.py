#!/usr/bin/env python3
"""Okaasan API Server Runner — runs the FastAPI server with uvicorn."""

import os
import sys


def main():
    import uvicorn

    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', '5001'))
    debug = os.getenv('FLASK_ENV', 'development') == 'development'

    print("")
    print("Starting Okaasan API Server...")
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"Debug: {debug}")
    print(f"Access at: http://localhost:{port}")
    print("=" * 50)

    try:
        uvicorn.run(
            "okaasan.server.run:entry",
            host=host,
            port=port,
            reload=debug,
        )
    except KeyboardInterrupt:
        print("\nServer stopped")
    except Exception as e:
        print(f"Error starting server: {e}")
        sys.exit(1)


def entry():
    from .server import create_app
    return create_app()


if __name__ == '__main__':
    main()
