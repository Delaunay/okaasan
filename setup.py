#!/usr/bin/env python
from pathlib import Path

from setuptools import setup, find_packages

version = '0.0.1'

extra_requires = {"plugins": ["importlib_resources"]}
extra_requires["all"] = sorted(set(sum(extra_requires.values(), [])))


setup(
    name="okaasan",
    version=version,
    extras_require=extra_requires,
    description="Recipe management web application",
    long_description=(Path(__file__).parent / "README.rst").read_text(),
    author="Gamekit",
    author_email="github@gamekit.ca",
    license="MIT",
    url="https://recipes.readthedocs.io",
    classifiers=[
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Operating System :: OS Independent",
    ],
    packages=find_packages(exclude=["tests*", "docs*"]),
    package_data={
        "okaasan.server": [
            "static/**/*",
            "static/*",
            "templates/*",
        ],
        "okaasan.data": [
            "*.json",
            "**/*.csv",
        ],
    },
    include_package_data=True,
    setup_requires=["setuptools"],
    install_requires=[
        "importlib_resources",
        "sqlalchemy",
        "alembic",
        "fastapi",
        "uvicorn[standard]",
        "python-multipart",
        "httpx",
        "pillow",
        "appdirs",
        "python-telegram-bot",
        "argklass",
        "usda_fdc",
    ],
    entry_points={
        "console_scripts": [
            "okaasan = okaasan.main:main_force",
        ],
    },
)
