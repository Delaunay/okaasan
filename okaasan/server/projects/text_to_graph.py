"""
Convert text-based code to graph representation.
This is a simple implementation that parses Python code into a visual node graph.
"""

import ast
import re
from typing import Dict, List, Any


def text_to_graph(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert text code to graph representation.

    Args:
        data: Dictionary containing 'code' key with text code string

    Returns:
        Dictionary with 'nodes' and 'edges' for graph visualization
    """
    code = data.get('code', '')

    if not code.strip():
        return {
            'nodes': [],
            'edges': [],
            'error': None
        }

    try:
        # Try to parse as Python code
        tree = ast.parse(code)
        nodes = []
        edges = []
        node_counter = 0

        def add_node(node_type: str, label: str, x: int = 0, y: int = 0) -> str:
            nonlocal node_counter
            node_counter += 1
            node_id = str(node_counter)
            nodes.append({
                'id': node_id,
                'type': node_type,
                'label': label,
                'x': x,
                'y': y
            })
            return node_id

        def add_edge(from_id: str, to_id: str, label: str = ''):
            edges.append({
                'from': from_id,
                'to': to_id,
                'label': label
            })

        # Process AST nodes
        y_pos = 100
        prev_node_id = None

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                func_id = add_node('function', f'def {node.name}()', 100, y_pos)
                if prev_node_id:
                    add_edge(prev_node_id, func_id, 'next')
                prev_node_id = func_id
                y_pos += 100

                # Add function body
                for stmt in node.body:
                    if isinstance(stmt, ast.Return):
                        ret_id = add_node('return', 'return', 100, y_pos)
                        add_edge(func_id, ret_id, 'contains')
                        y_pos += 100
                    elif isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                        call_id = add_node('call', ast.unparse(stmt) if hasattr(ast, 'unparse') else 'call', 100, y_pos)
                        add_edge(func_id, call_id, 'contains')
                        y_pos += 100
                    elif isinstance(stmt, ast.Assign):
                        assign_id = add_node('assign', ast.unparse(stmt) if hasattr(ast, 'unparse') else 'assign', 100, y_pos)
                        add_edge(func_id, assign_id, 'contains')
                        y_pos += 100

            elif isinstance(node, ast.Assign):
                if prev_node_id and not isinstance(ast.walk(tree).__next__(), ast.FunctionDef):
                    target = node.targets[0].id if hasattr(node.targets[0], 'id') else 'var'
                    assign_id = add_node('assign', f'{target} = ...', 100, y_pos)
                    if prev_node_id:
                        add_edge(prev_node_id, assign_id, 'next')
                    prev_node_id = assign_id
                    y_pos += 100

            elif isinstance(node, ast.Call) and not isinstance(node.func, ast.Attribute):
                # Only add top-level calls
                pass

        return {
            'nodes': nodes,
            'edges': edges,
            'error': None
        }

    except SyntaxError as e:
        # If parsing fails, create a simple single-node graph
        return {
            'nodes': [
                {
                    'id': '1',
                    'type': 'code',
                    'label': 'Code Block',
                    'x': 100,
                    'y': 100,
                    'code': code
                }
            ],
            'edges': [],
            'error': f'Syntax error: {str(e)}'
        }
    except Exception as e:
        return {
            'nodes': [],
            'edges': [],
            'error': f'Error parsing code: {str(e)}'
        }


