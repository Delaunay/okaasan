"""
MCP Tool Generator

Automatically generates MCP tool definitions from Flask routes.
Introspects the Flask app to discover all routes and creates the TOOLS dictionary.
"""

from __future__ import annotations

import logging
import sys
import inspect
import json
from pathlib import Path
from dataclasses import dataclass
from typing import get_type_hints, Dict, Any, Optional, List, TYPE_CHECKING

from argklass.arguments import add_arguments
from argklass.command import Command, newparser

if TYPE_CHECKING:
    from werkzeug.routing import Rule


@dataclass
class Arguments:
    """Arguments for MCP tool generator"""
    output: str = None  # Output file path (default: recipes/server/mcp/tools.json)
    format: str = "json"  # Output format: json or python
    verbose: bool = False


# Route patterns to ignore (internal Flask routes)
IGNORE_PATTERNS = [
    "static",
    "serve_frontend",
    "uploaded_file",
    "mcp",  # Don't generate MCP routes for MCP itself
]

# HTTP methods we care about
SUPPORTED_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"]


def should_include_route(rule: Rule) -> bool:
    """Determine if a route should be included in MCP tools"""
    # Skip if no methods we care about
    if not any(method in rule.methods for method in SUPPORTED_METHODS):
        return False

    # Skip ignored patterns
    for pattern in IGNORE_PATTERNS:
        if pattern in rule.rule:
            return False

    # Skip routes with no endpoint
    if not rule.endpoint:
        return False

    return True


def extract_path_params(rule: Rule) -> List[str]:
    """Extract parameter names from a route rule"""
    import re
    # Find all parameters in angle brackets: <param> or <int:param>
    pattern = r'<(?:[^:]+:)?([^>]+)>'
    return re.findall(pattern, rule.rule)


def infer_param_type(param_name: str, type_converter: str = None) -> str:
    """Infer parameter type from name and converter"""
    if type_converter:
        type_map = {
            'int': 'integer',
            'float': 'number',
            'string': 'string',
            'path': 'string',
            'uuid': 'string',
        }
        return type_map.get(type_converter, 'string')

    # Infer from parameter name
    if any(x in param_name.lower() for x in ['id', 'count', 'num', 'index']):
        return 'integer'
    elif any(x in param_name.lower() for x in ['price', 'amount', 'quantity']):
        return 'number'
    elif any(x in param_name.lower() for x in ['date', 'time']):
        return 'string'  # ISO format
    else:
        return 'string'


def extract_param_types(rule: Rule) -> Dict[str, str]:
    """Extract parameter types from route converters"""
    import re
    param_types = {}

    # Pattern to match <converter:param> or <param>
    pattern = r'<(?:([^:]+):)?([^>]+)>'
    matches = re.findall(pattern, rule.rule)

    for converter, param_name in matches:
        param_types[param_name] = infer_param_type(param_name, converter or None)

    return param_types


def get_handler_signature(handler) -> Dict[str, Any]:
    """Get function signature and parameter hints"""
    try:
        sig = inspect.signature(handler)
        params = {}

        for param_name, param in sig.parameters.items():
            # Skip special parameters
            if param_name in ['self', 'cls', 'args', 'kwargs']:
                continue

            param_info = {}

            # Get type hint
            if param.annotation != inspect.Parameter.empty:
                annotation = param.annotation
                if hasattr(annotation, '__name__'):
                    type_name = annotation.__name__
                    type_map = {
                        'int': 'integer',
                        'float': 'number',
                        'str': 'string',
                        'bool': 'boolean',
                        'list': 'array',
                        'dict': 'object',
                    }
                    param_info['type'] = type_map.get(type_name, 'string')
                else:
                    param_info['type'] = 'string'

            # Get default value
            if param.default != inspect.Parameter.empty:
                param_info['default'] = param.default
                param_info['required'] = False
            else:
                param_info['required'] = True

            params[param_name] = param_info

        return params
    except Exception as e:
        return {}


def generate_tool_name(rule: Rule) -> str:
    """Generate a descriptive tool name from a route"""
    endpoint = rule.endpoint

    # Remove common prefixes
    for prefix in ['route_', 'api_', 'get_', 'post_', 'put_', 'delete_']:
        if endpoint.startswith(prefix):
            endpoint = endpoint[len(prefix):]

    # Convert to snake_case if needed
    return endpoint


def generate_description(rule: Rule, handler) -> str:
    """Generate a description for the tool"""
    # Try to get from docstring
    if handler and handler.__doc__:
        # Get first line of docstring
        doc = handler.__doc__.strip().split('\n')[0]
        if doc:
            return doc

    # Generate from endpoint and method
    endpoint = rule.endpoint.replace('_', ' ').title()
    methods = [m for m in SUPPORTED_METHODS if m in rule.methods]

    if not methods:
        return endpoint

    method = methods[0]

    action_map = {
        'GET': 'Get' if 'get' not in endpoint.lower() else '',
        'POST': 'Create' if 'create' not in endpoint.lower() else '',
        'PUT': 'Update' if 'update' not in endpoint.lower() else '',
        'DELETE': 'Delete' if 'delete' not in endpoint.lower() else '',
        'PATCH': 'Update' if 'update' not in endpoint.lower() else '',
    }

    action = action_map.get(method, '')
    description = f"{action} {endpoint}".strip()

    return description


def route_to_tool(rule: Rule, handler, app) -> Optional[Dict[str, Any]]:
    """Convert a Flask route to an MCP tool definition"""
    if not should_include_route(rule):
        return None

    # Get primary HTTP method (prefer POST > GET > PUT > DELETE)
    methods = [m for m in rule.methods if m in SUPPORTED_METHODS]
    if not methods:
        return None

    # Prioritize methods
    method_priority = ['POST', 'GET', 'PUT', 'DELETE', 'PATCH']
    method = next((m for m in method_priority if m in methods), methods[0])

    # Extract parameters
    path_params = extract_param_types(rule)
    handler_params = get_handler_signature(handler) if handler else {}

    # Merge parameter info
    all_params = {}

    # Add path parameters (always required)
    for param, ptype in path_params.items():
        all_params[param] = {
            'type': ptype,
            'required': True,
            'description': f'Path parameter: {param}'
        }

    # Add handler parameters
    for param, info in handler_params.items():
        if param not in all_params:  # Don't override path params
            all_params[param] = info

    # Generate tool definition
    tool_name = generate_tool_name(rule)
    description = generate_description(rule, handler)

    tool = {
        'description': description,
        'method': method,
        'path': rule.rule,
        'params': all_params
    }

    return tool_name, tool


def generate_mcp_tools(app) -> Dict[str, Dict[str, Any]]:
    """Generate all MCP tools from Flask app routes"""
    tools = {}

    for rule in app.url_map.iter_rules():
        handler = app.view_functions.get(rule.endpoint)
        result = route_to_tool(rule, handler, app)

        if result:
            tool_name, tool_def = result
            # Avoid duplicates - use first occurrence
            if tool_name not in tools:
                tools[tool_name] = tool_def

    return tools


def format_as_json(tools: Dict[str, Any], pretty: bool = True) -> str:
    """Format tools as JSON"""
    indent = 2 if pretty else None
    return json.dumps(tools, indent=indent)


def format_as_python(tools: Dict[str, Any]) -> str:
    """Format tools as Python dictionary"""
    lines = ['TOOLS = {']

    for tool_name, tool_def in sorted(tools.items()):
        lines.append(f'    "{tool_name}": {{')
        lines.append(f'        "description": "{tool_def["description"]}",')
        lines.append(f'        "method": "{tool_def["method"]}",')
        lines.append(f'        "path": "{tool_def["path"]}",')
        lines.append(f'        "params": {{')

        for param_name, param_info in tool_def['params'].items():
            lines.append(f'            "{param_name}": {{')
            for key, value in param_info.items():
                if isinstance(value, str):
                    lines.append(f'                "{key}": "{value}",')
                else:
                    lines.append(f'                "{key}": {value},')
            lines.append(f'            }},')

        lines.append(f'        }}')
        lines.append(f'    }},')

    lines.append('}')

    return '\n'.join(lines)


class MCPGenerator(Command):
    """Generate MCP tool definitions from Flask routes"""

    name: str = "mcp"

    @staticmethod
    def arguments(subparsers):
        parser = newparser(subparsers, MCPGenerator)
        add_arguments(parser, Arguments)

    @staticmethod
    def execute(args):
        """Execute the MCP generator"""
        from okaasan.server.server import RecipeApp

        # Create Flask app
        print("Creating Flask app...")
        app = RecipeApp().app

        # Generate tools
        print("Analyzing routes...")
        tools = generate_mcp_tools(app)

        print(f"\nFound {len(tools)} tools:")
        for tool_name in sorted(tools.keys()):
            tool = tools[tool_name]
            print(f"  - {tool_name:30s} {tool['method']:6s} {tool['path']}")

        # Format output
        if args.format == "json":
            output = format_as_json(tools, pretty=True)
        elif args.format == "python":
            output = format_as_python(tools)
        else:
            print(f"Unknown format: {args.format}")
            return 1

        # Write to file or stdout
        if args.output:
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output)
            print(f"\nWrote {len(output)} bytes to {output_path}")
        else:
            print("\n" + "="*80)
            print(output)
            print("="*80)

        print(f"\n✓ Generated {len(tools)} MCP tools")

        return 0


COMMANDS = MCPGenerator

