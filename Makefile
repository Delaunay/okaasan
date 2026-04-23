
install:
	pip install -e .[all]
	pip install -r requirements.txt
	pip install -r docs/requirements.txt
	pip install -r tests/requirements.txt

doc: build-doc

build-doc:
	sphinx-build -W --color -c docs/ -b html docs/ _build/html

serve-doc:
	sphinx-serve

update-doc: build-doc serve-doc

tests-doc:
	COVERAGE_FILE=.coverage.docstring coverage run --parallel-mode -m pytest --cov=okaasan --doctest-modules okaasan

tests-integration:
	COVERAGE_FILE=.coverage.integration coverage run --parallel-mode -m pytest --cov=okaasan tests/integration

tests-end-to-end:
	COVERAGE_FILE=.coverage.end2end coverage run --parallel-mode -m pytest --cov=okaasan tests/end2end

tests-unit:
	COVERAGE_FILE=.coverage.unit coverage run --parallel-mode -m pytest --cov=okaasan tests/unit

tests-combine:
	coverage combine
	coverage report -m
	coverage xml

tests-codecov: tests-combine
	codecov

tests-all: tests-doc tests-unit tests-integration tests-end-to-end

tests: tests-all tests-codecov

tests-ui:
	cd okaasan/ui && npm test


CONDA_ACTIVATE=. $$(conda info --base)/etc/profile.d/conda.sh ; conda activate

front:
	cd okaasan/ui && npm run dev

back:
	uvicorn okaasan.server.run:entry --reload --host 0.0.0.0 --port 5001

# ── Wheel packaging ──────────────────────────────────────

build-ui:
	cd okaasan/ui && npm ci && VITE_API_URL= VITE_BASE_PATH=/ npx vite build --outDir ../server/static

build-wheel: build-ui
	python -m build

build: build-wheel

clean:
	rm -rf okaasan/server/static dist build *.egg-info


alembic_gen:
	cd okaasan/alembic && alembic revision -m "create account table"

alembic-autogen:
	cd okaasan/alembic && alembic revision --autogenerate -m "makefile"

alembic-update:
	cd okaasan/alembic && alembic upgrade head

static-build:
	(. ../.venv/bin/activate && FDC_API_KEY=$${FDC_API_KEY:-DEMO_KEY} FLASK_STATIC=.. python -m okaasan.main static --base_path / --api_url /api)

static:
	cd okaasan/static_build && python -m http.server

local-deploy:
	cd okaasan/website
	python3 -m venv .venv
	source .venv/bin/activate
	pip install -r ../requirements.txt
	pip install waitress
	pip install ../
	npm install --prefix ../okaasan/ui
	npm run build --prefix  ../okaasan/ui
	mv ../okaasan/ui/dist ./static
	python -c 'import secrets; print(f"SECRET_KEY = \"{secrets.token_hex()}\"")' > .venv/var/flaskr-instance/config.py
	FLASK_STATIC="./static" FLASK_ENV=production waitress-serve --call 'okaasan.server.run:main'


preprocess-images:
	(. .venv/bin/activate && cd okaasan && FDC_API_KEY=$${FDC_API_KEY:-DEMO_KEY} FLASK_STATIC=.. python -m okaasan.main static --skip_frontend --base_path /recipes/ --api_url /recipes/api)

# MCP Tools Generation
mcp-generate:
	(. .venv/bin/activate && python -m okaasan.cli.mcp --output okaasan/server/mcp/tools.json)

mcp-show:
	(. .venv/bin/activate && python -m okaasan.cli.mcp)

mcp-python:
	(. .venv/bin/activate && python -m okaasan.cli.mcp --format python --output okaasan/server/mcp/tools.py)
