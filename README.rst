Okaasan
=======

A self-hosted home management web application.
Okaasan started as a recipe manager and grew into a personal dashboard that
handles meal planning, calendars, budgeting, task tracking, notes, and more.

It runs on a local server (NAS, Raspberry Pi, etc.) for day-to-day use and can
also be published as a static read-only site on GitHub Pages for sharing.


Features
--------

* **Recipes**: create, edit, scale, and compare recipes with ingredient
  management, unit conversions, and USDA nutrition data.
* **Meal Planning**: weekly planner with portion tracking, leftovers, and a
  grocery list generator (shareable via Telegram).
* **Calendar & Routine**: local event calendar with Google Calendar
  integration and repeatable routine templates.
* **Tasks**: task lists with subtasks and status tracking.
* **Home Dashboard**: 7-day overview combining weather (Open-Meteo), events,
  and meals at a glance.
* **Budget & Expense Tracker**: receipt scanning, pantry inventory, and
  expense categorisation.
* **Notes**: article editor with rich blocks (code, math, diagrams, images,
  quizzes, and more).
* **Scratch Pad**: miscellaneous tools: 3D-print cost estimator, wood project
  planner, brainstorming boards, filament calculator.
* **Settings**: Git-backed data sync, auto-updates from PyPI, sidebar
  customisation, and integration setup wizards.


Install
-------

.. code-block:: bash

   curl -sSL https://raw.githubusercontent.com/Delaunay/okaasan/master/install.sh | bash

Safe to re-run: upgrades the package, preserves data.
Installs to ``/opt/okaasan/`` with a Python virtual environment, a systemd
service, and a data directory.

After installation the app is accessible at ``http://localhost:5001``.

Useful commands::

   sudo systemctl status okaasan      # check status
   sudo systemctl restart okaasan     # restart
   sudo journalctl -u okaasan -f      # view logs


How It Works
------------

Two Modes
~~~~~~~~~

The application has two operating modes:

* **Dev / Server mode**: the full application with a FastAPI backend, SQLite
  database, and a React (Vite + Chakra UI) frontend.  All features are
  read-write.
* **Static mode**: a pre-built, read-only version of the site that can be
  deployed to GitHub Pages (or any static host) without a server.  During the
  static build the server's API responses are cached as JSON files and the
  frontend reads those instead of calling a live API.


Repository Layout
~~~~~~~~~~~~~~~~~

::

   recipes/
   ├── install.sh                      # one-line installer (systemd + venv)
   ├── setup.py                        # pip-installable package definition
   ├── requirements.txt                # Python dependencies
   ├── README.rst
   │
   └── okaasan/
       ├── main/                       # CLI entry point (okaasan command)
       │
       ├── server/                     # FastAPI backend
       │   ├── server.py               # app factory, middleware, startup hooks
       │   ├── run.py                  # uvicorn runner
       │   ├── updater.py              # auto-update from PyPI
       │   ├── gitsync.py              # git-based data backup
       │   │
       │   ├── recipe/                 # Recipe feature
       │   │   ├── routes.py           #   recipe CRUD
       │   │   ├── route_ingredient.py #   ingredient CRUD
       │   │   ├── route_units.py      #   unit conversion CRUD
       │   │   ├── models.py           #   Recipe, Ingredient, Category, …
       │   │   └── facts.py            #   nutrition facts DB
       │   │
       │   ├── calendar/               # Calendar feature
       │   │   ├── routes.py
       │   │   └── models.py           #   Event
       │   │
       │   ├── tasks/                  # Tasks feature
       │   │   ├── routes.py
       │   │   └── models.py           #   Task
       │   │
       │   ├── articles/               # Notes / Articles feature
       │   │   ├── routes.py
       │   │   └── models.py           #   Article, ArticleBlock
       │   │
       │   ├── budget/                 # Budget feature (stub)
       │   │   ├── routes.py
       │   │   └── models.py           #   Receipt, ReceiptItem, Expense
       │   │
       │   ├── product/                # Product / Pantry feature (stub)
       │   │   ├── routes.py
       │   │   └── models.py           #   Product, ProductInventory
       │   │
       │   ├── models/                 # Shared models & re-export facade
       │   │   ├── common.py           #   SQLAlchemy Base class
       │   │   ├── keyvalue.py         #   generic key-value store
       │   │   ├── user.py
       │   │   └── __init__.py         #   re-exports all feature models
       │   │
       │   ├── integrations/           # Third-party service adapters
       │   │   ├── gcalendar.py        #   Google Calendar (service account)
       │   │   ├── route_gcalendar.py
       │   │   ├── route_weather.py    #   Open-Meteo weather
       │   │   ├── route_usda.py       #   USDA FoodData Central
       │   │   ├── route_messaging.py  #   Telegram
       │   │   └── route_garmin.py     #   Garmin (stub)
       │   │
       │   ├── projects/               # Graph / Blockly tools
       │   ├── route_keyvalue.py       # generic key-value API
       │   ├── route_images.py         # image upload API
       │   └── route_jsonstore.py      # generic JSON file store API
       │
       ├── cli/                        # CLI commands
       │   └── staticwebsite.py        # static site generator
       │
       └── ui/                         # React frontend (Vite + TypeScript)
           ├── src/
           │   ├── App.tsx             # router & top-level layout
           │   ├── components/
           │   │   ├── home/           #   dashboard & day detail
           │   │   ├── recipes/        #   recipe CRUD, ingredients, units
           │   │   ├── meal-planning/  #   weekly meal planner
           │   │   ├── calendar/       #   calendar view
           │   │   ├── tasks/          #   tasks & routine
           │   │   ├── settings/       #   app settings pages
           │   │   ├── budget/         #   budget & expense tracker
           │   │   ├── inventory/      #   grocery receipts & pantry
           │   │   ├── content/        #   notes & article views
           │   │   ├── scratch/        #   misc tools (3D print, wood, …)
           │   │   ├── common/         #   shared modals & widgets
           │   │   ├── article/        #   rich block editor & renderer
           │   │   └── ui/             #   UI primitives (color mode, toaster)
           │   ├── services/           #   API client, types, Telegram SDK
           │   ├── utils/              #   date, fraction, unit helpers
           │   └── layout/             #   shell layout & sidebar
           └── dist/                   # production build (bundled into package)


Local Development
~~~~~~~~~~~~~~~~~

1. **Backend**: start the FastAPI server with hot-reload:

   .. code-block:: bash

      cd recipes
      pip install -e ".[all]"
      python -m okaasan.server.run          # http://localhost:5001

   The server reads ``OKAASAN_DATA`` (or ``FLASK_STATIC``) for the data
   directory and creates a SQLite database there.

2. **Frontend**: start the Vite dev server with HMR:

   .. code-block:: bash

      cd recipes/okaasan/ui
      npm install
      npm run dev                           # http://localhost:5173

   The Vite dev server proxies ``/api/*`` requests to the backend at
   ``localhost:5001``.

3. **Build the UI** for production:

   .. code-block:: bash

      cd recipes/okaasan/ui
      npm run build                         # outputs to ui/dist/

   The built files are served directly by FastAPI in production (no separate
   web server needed).


Static Deployment (GitHub Pages)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The static build turns the live app into a set of HTML + JSON files that can be
hosted anywhere without a server:

1. The static site generator (``okaasan staticwebsite``) starts the server
   locally, crawls every API route, and caches each response as a ``.json``
   file.
2. The React frontend is built with a ``base_path`` matching the GitHub Pages
   URL.
3. At runtime the frontend detects static mode and reads from the cached JSON
   files instead of calling the API.

To set it up from the Settings page:

1. Configure **Git Backup** with a GitHub repository.
2. Click **Setup GitHub Pages** to generate a deploy workflow.
3. Push: GitHub Actions builds and publishes the static site automatically.

The result is a public, read-only version of your data at
``https://<user>.github.io/<repo>/``.
