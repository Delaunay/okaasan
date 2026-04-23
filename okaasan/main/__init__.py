"""Entry point for the command line interface"""
from __future__ import annotations

import argparse
import time
import traceback
from contextlib import contextmanager

from argklass.argformat import DumpParserAction, HelpAction, HelpActionException
from argklass.command import ParentCommand
from argklass.parallel import shutdown
from argklass.plugin import with_cache_location
from argklass.cache import get_cache_future, get_cache_status
from argklass.plugin import discover_module_commands


@contextmanager
def timeit(*args):
    yield


def discover_commands():
    import okaasan.cli
    import okaasan.plugin

    return discover_module_commands(okaasan.cli, okaasan.plugin).found_commands


# Argument Parser cannot be pickled
def build_parser(commands):
    with timeit("build_parser"):
        parser = argparse.ArgumentParser(
            add_help=False, description="Unreal Engine Utility"
        )
        parser.add_argument(
            "-h", "--help", action=HelpAction, help="show this help message and exit"
        )

        subparsers = parser.add_subparsers(dest="command")

        ParentCommand.dispatch = dict()
        for k, command in commands.items():
            with timeit(k):
                command.arguments(subparsers)

        return parser


def parse_args(commands, argv):
    """Setup the argument parser for all supported commands"""
    parser = build_parser(commands)

    with timeit("parse_args"):
        args = parser.parse_args(argv)

    return args


def args(*a):
    """Utility to turn arguments into a list"""
    return a


def main(argv=None):
    """Entry point for the command line interface"""

    import okaasan

    with with_cache_location(okaasan):
        with timeit("discover_commands"):
            commands = discover_commands()

        with timeit("parse_args"):
            try:
                parsed_args = parse_args(commands, argv)
            except HelpActionException:
                return 0

    cmd_name = parsed_args.command
    command = commands.get(cmd_name)

    if command is None:
        print(f"Action `{cmd_name}` not implemented")
        return -1

    with timeit("command.execute"):
        returncode = command.execute(parsed_args)

    if returncode is None:
        return 0

    return returncode


@contextmanager
def profiler(enabled=False):
    import cProfile
    import io
    import pstats

    with cProfile.Profile() as profile:
        profile.disable()
        if enabled:
            profile.enable()

        yield

        profile.disable()

        if enabled:
            s = io.StringIO()
            sortby = pstats.SortKey.CUMULATIVE
            ps = pstats.Stats(profile, stream=s).sort_stats(sortby)
            ps.print_stats(25)
            print(s.getvalue())


def main_force(argv=None):
    import sys

    should_profile = "-xyz" in sys.argv
    # should_profile = False

    with profiler(should_profile):
        r = main()

    shutdown()

    sys.exit(r)


if __name__ == "__main__":
    main_force()
