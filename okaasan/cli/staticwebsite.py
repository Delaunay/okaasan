import logging
import os
import json
import time
import itertools
import subprocess
import shutil
from pathlib import Path
from dataclasses import dataclass
from typing import Any

from argklass.arguments import add_arguments
from argklass.command import Command, newparser


logger = logging.getLogger(__name__)


@dataclass
class Arguments:
    output: str = None
    skip_frontend: bool = False
    skip_api: bool = False
    fail_on_error: bool = False
    base_path: str = "/"
    api_url: str = "/api"


def default_output_dir():
    base_dir = Path(__file__).parent.parent.parent
    return base_dir / "static_build"


class StaticWebsite(Command):
    """Generate a static version of the website with pre-rendered JSON API data."""

    name: str = "static"

    @staticmethod
    def arguments(subparsers):
        parser = newparser(subparsers, StaticWebsite)
        add_arguments(parser, Arguments)

    def __init__(self, output_dir=None):
        self.output_dir = Path(output_dir) if output_dir else default_output_dir()
        self.base_dir = Path(__file__).parent.parent.parent

    @staticmethod
    def execute(args):
        self = StaticWebsite(output_dir=getattr(args, 'output', None))
        return self.run(args)

    def run(self, args):
        from okaasan.server.server import create_app, STATIC_FOLDER

        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )

        logger.info("Starting static site generation...")

        self.fastapi_app = create_app()

        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        db_path = os.path.join(STATIC_FOLDER, "database.db")
        engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        self.SessionLocal = sessionmaker(bind=engine)

        from starlette.testclient import TestClient
        self.client = TestClient(self.fastapi_app)

        skip_api = getattr(args, 'skip_api', False)
        skip_frontend = getattr(args, 'skip_frontend', False)
        base_path = getattr(args, 'base_path', '/')
        api_url = getattr(args, 'api_url', '/api')

        if self.output_dir.exists():
            shutil.rmtree(self.output_dir)
        self.output_dir.mkdir(parents=True)

        if not skip_api:
            self.crawl_exposed_routes()
            self.generate_sidebar_json()

        if not skip_frontend:
            self.build_frontend(base_path=base_path, api_url=api_url)
            self.copy_frontend_build()

        self.copy_uploads()
        self.create_spa_fallback()
        self.create_hosting_configs()
        self.create_build_info()

        logger.info(f"Static site generated at {self.output_dir}")
        return 0

    def crawl_exposed_routes(self):
        """Find all routes with @expose and fetch their data."""
        logger.info("Crawling exposed routes...")

        from starlette.routing import Route
        count = 0
        for route in self.fastapi_app.routes:
            if not isinstance(route, Route):
                continue
            if "GET" not in (route.methods or set()):
                continue

            endpoint = route.endpoint
            if not endpoint:
                continue

            if hasattr(endpoint, '_static_kwargs') or hasattr(endpoint, '_static_args'):
                static_args = getattr(endpoint, '_static_args', ())
                static_kwargs = getattr(endpoint, '_static_kwargs', {})
                count += self.save_route_data(route, static_args, static_kwargs)

        for router in getattr(self.fastapi_app, 'routes', []):
            if hasattr(router, 'routes'):
                for route in router.routes:
                    if not isinstance(route, Route):
                        continue
                    if "GET" not in (route.methods or set()):
                        continue
                    endpoint = route.endpoint
                    if not endpoint:
                        continue
                    if hasattr(endpoint, '_static_kwargs') or hasattr(endpoint, '_static_args'):
                        static_args = getattr(endpoint, '_static_args', ())
                        static_kwargs = getattr(endpoint, '_static_kwargs', {})
                        count += self.save_route_data(route, static_args, static_kwargs)

        logger.info(f"Crawled {count} endpoints total")

    def _build_url(self, route, kwargs):
        """Build a URL from a Starlette route and parameter dict."""
        path = route.path
        for key, val in kwargs.items():
            path = path.replace(f"{{{key}}}", str(val))
            path = path.replace(f"{{{key}:int}}", str(val))
            path = path.replace(f"{{{key}:path}}", str(val))
        return path

    def save_route_data(self, route, static_args, static_kwargs):
        """Generate all route combinations and save the data."""
        from sqlalchemy.sql import Select
        from okaasan.server.query_context import public_articles_only

        logger.info(f"Processing route: {route.path}")

        combinations = []
        db = self.SessionLocal()
        try:
            with public_articles_only():
                if static_kwargs:
                    resolved_params = {}
                    for param_name, generator in static_kwargs.items():
                        if isinstance(generator, Select):
                            resolved_params[param_name] = db.scalars(generator).all()
                        elif callable(generator):
                            resolved_params[param_name] = generator()
                        else:
                            resolved_params[param_name] = generator

                    param_names = resolved_params.keys()
                    param_values = resolved_params.values()
                    for combination in itertools.product(*param_values):
                        combinations.append(dict(zip(param_names, combination)))

                if static_args:
                    for query in static_args:
                        if isinstance(query, Select):
                            rows = db.execute(query).all()
                            for row in rows:
                                combinations.append(dict(row._mapping))
                        elif callable(query):
                            for item in query():
                                combinations.append(item if isinstance(item, dict) else {'id': item})

                if not combinations and not static_args and not static_kwargs:
                    combinations = [{}]
        finally:
            db.close()

        saved = 0
        for kwargs in combinations:
            try:
                url = self._build_url(route, kwargs)

                from okaasan.server.query_context import public_articles_only
                with public_articles_only():
                    response = self.client.get(url)

                if response.status_code == 200:
                    try:
                        data = response.json()
                        if data is not None:
                            self.save_json_file(url, data)
                            saved += 1
                    except Exception as e:
                        logger.error(f"Failed to parse JSON for {url}: {e}")
                else:
                    logger.warning(
                        f"Failed request to {url}: Status {response.status_code}"
                    )

            except Exception as e:
                logger.error(
                    f"Error processing combination {kwargs} for {route.path}: {e}"
                )

        logger.info(f"  Saved {saved}/{len(combinations)} for {route.path}")
        return saved

    def save_json_file(self, endpoint: str, data: Any):
        """Save JSON data to a file structure mimicking the API."""
        if endpoint == "/":
            file_path = self.output_dir / "api" / "index.json"
        else:
            clean_endpoint = endpoint.lstrip("/")
            file_path = self.output_dir / "api" / f"{clean_endpoint}.json"

        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2, default=str)

        logger.debug(f"Saved {file_path}")

    def generate_sidebar_json(self):
        """Fetch /api/sidebar and write it as a static JSON file."""
        logger.info("Generating sidebar config...")
        try:
            response = self.client.get("/api/sidebar")
            if response.status_code == 200:
                self.save_json_file("/api/sidebar", response.json())
                logger.info("Saved api/sidebar.json")
            else:
                logger.warning(f"Failed to fetch /api/sidebar: {response.status_code}")
        except Exception as e:
            logger.error(f"Error generating sidebar config: {e}")

    def build_frontend(self, base_path="/", api_url="/api"):
        """Build the React frontend for production."""
        logger.info("Building React frontend...")

        ui_dir = self.base_dir / "okaasan" / "ui"

        if not ui_dir.exists():
            logger.warning(f"UI directory not found: {ui_dir}")
            return

        logger.info("Installing npm dependencies...")
        result = subprocess.run(
            ["npm", "install"],
            cwd=ui_dir,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            logger.error(f"npm install failed: {result.stderr}")
            raise Exception("npm install failed")

        logger.info("Building React app...")
        env = os.environ.copy()
        env["VITE_USE_STATIC_MODE"] = "true"
        env["VITE_BASE_PATH"] = base_path
        env["VITE_API_URL"] = api_url

        result = subprocess.run(
            ["npx", "vite", "build"],
            cwd=ui_dir,
            env=env,
            capture_output=True,
            text=True,
        )

        if result.stdout:
            print(result.stdout)

        if result.returncode != 0:
            logger.error(f"Frontend build failed: {result.stderr}")
            raise Exception("Frontend build failed")

        logger.info("Frontend build completed")

    def copy_frontend_build(self):
        """Copy the built frontend to the output directory."""
        logger.info("Copying frontend build...")

        ui_dist = self.base_dir / "okaasan" / "ui" / "dist"

        if not ui_dist.exists():
            logger.warning(f"Frontend dist directory not found: {ui_dist}")
            return

        for item in ui_dist.rglob("*"):
            if item.is_file():
                rel_path = item.relative_to(ui_dist)
                dest_path = self.output_dir / rel_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, dest_path)

        logger.info("Frontend files copied")

    def copy_uploads(self):
        """Copy uploaded files to the static build.

        Uploads are placed both at /uploads/ (matching server paths in the JSON data)
        and at /api/uploads/ (matching the API_BASE_URL prefix the frontend adds).
        """
        logger.info("Copying uploaded files...")

        uploads_src = None

        upload_folder = getattr(self.fastapi_app.state, 'upload_folder', None)
        if upload_folder and Path(upload_folder).exists():
            uploads_src = Path(upload_folder)
        else:
            for candidate in [
                self.base_dir / "uploads",
                self.base_dir / "static" / "uploads",
            ]:
                if candidate.exists():
                    uploads_src = candidate
                    break

        if uploads_src is None:
            logger.info("No uploads directory found")
            return

        uploads_dest = self.output_dir / "uploads"
        shutil.copytree(uploads_src, uploads_dest, dirs_exist_ok=True)

        api_uploads_dest = self.output_dir / "api" / "uploads"
        shutil.copytree(uploads_src, api_uploads_dest, dirs_exist_ok=True)

        logger.info(f"Copied uploads from {uploads_src} to /uploads/ and /api/uploads/")

    def create_spa_fallback(self):
        """Create 404.html for SPA routing on static hosts."""
        index_html = self.output_dir / "index.html"
        if not index_html.exists():
            logger.warning("No index.html found, skipping SPA fallback")
            return

        shutil.copy2(index_html, self.output_dir / "404.html")
        logger.info("Created 404.html for SPA fallback")

    def create_hosting_configs(self):
        """Create configuration files for various hosting providers."""
        (self.output_dir / ".nojekyll").touch()

        (self.output_dir / "_redirects").write_text(
            "/api/* /api/:splat.json 200\n"
            "/* /index.html 200\n"
        )

        vercel_config = {
            "routes": [
                {"src": "/api/(.*)", "dest": "/api/$1.json"},
                {"src": "/(.*)", "dest": "/index.html"},
            ]
        }
        with open(self.output_dir / "vercel.json", 'w') as f:
            json.dump(vercel_config, f, indent=2)

        logger.info("Created hosting configuration files (.nojekyll, _redirects, vercel.json)")

    def create_build_info(self):
        """Create build information file."""
        build_info = {
            "build_time": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
            "build_type": "static",
        }

        with open(self.output_dir / "build-info.json", 'w') as f:
            json.dump(build_info, f, indent=2)

        logger.info("Created build-info.json")


COMMANDS = StaticWebsite
