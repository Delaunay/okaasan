"""
Convert graph node representation to text-based code.
This performs a topological traversal of the graph to generate sequential code.
"""

from typing import Dict, List, Any, Set


def graph_to_text(data: Dict[str, Any]) -> Dict[str, str]:
    """
    Convert graph nodes to Python text code.

    Args:
        data: Dictionary containing 'nodes' and 'edges' for graph structure

    Returns:
        Dictionary with 'code' key containing generated Python code
    """
    nodes = data.get('nodes', [])
    edges = data.get('edges', [])

    if not nodes:
        return {'code': ''}

    # Build adjacency map
    children = {}
    parents = {}
    for edge in edges:
        from_id = edge['from']
        to_id = edge['to']
        if from_id not in children:
            children[from_id] = []
        children[from_id].append((to_id, edge.get('label', '')))
        if to_id not in parents:
            parents[to_id] = []
        parents[to_id].append(from_id)

    # Create node lookup
    node_map = {node['id']: node for node in nodes}

    # Find root nodes (nodes with no parents or function type)
    root_nodes = []
    for node in nodes:
        if node['id'] not in parents or node['type'] == 'function':
            root_nodes.append(node)

    # Sort by position for consistent ordering
    root_nodes.sort(key=lambda n: (n.get('y', 0), n.get('x', 0)))

    lines = []
    visited: Set[str] = set()

    def process_node(node: Dict[str, Any], indent_level: int = 0) -> None:
        if node['id'] in visited:
            return
        visited.add(node['id'])

        indent_str = '    ' * indent_level
        node_type = node.get('type', '')
        label = node.get('label', '')

        if node_type == 'function':
            # Extract function name from label like "def function_name()"
            func_name = label.replace('def ', '').replace('()', '').strip()
            lines.append(f"{indent_str}def {func_name}():")

            # Process children with 'contains' edge (function body)
            has_body = False
            if node['id'] in children:
                for child_id, edge_label in children[node['id']]:
                    if edge_label == 'contains':
                        has_body = True
                        child_node = node_map.get(child_id)
                        if child_node:
                            process_node(child_node, indent_level + 1)

            if not has_body:
                lines.append(f"{indent_str}    pass")

        elif node_type == 'return':
            # Extract return value from label or use default
            return_val = label.replace('return ', '').strip() or '42'
            lines.append(f"{indent_str}return {return_val}")

        elif node_type == 'call':
            # Function call
            call_text = label if '(' in label else f'{label}()'
            lines.append(f"{indent_str}{call_text}")

        elif node_type == 'assign':
            # Variable assignment
            lines.append(f"{indent_str}{label}")

        elif node_type == 'statement':
            # Generic statement
            lines.append(f"{indent_str}{label}")

        elif node_type == 'print':
            # Print statement
            print_text = label.replace('print ', '').strip()
            lines.append(f"{indent_str}print({print_text})")

        elif node_type == 'code':
            # Raw code block
            code = node.get('code', label)
            for line in code.split('\n'):
                lines.append(f"{indent_str}{line}")
        else:
            # Unknown type, use label as-is
            if label:
                lines.append(f"{indent_str}{label}")

        # Process next siblings (nodes connected with 'next' or 'flow' edges)
        if node['id'] in children:
            for child_id, edge_label in children[node['id']]:
                if edge_label in ('next', 'flow', ''):
                    child_node = node_map.get(child_id)
                    if child_node and child_id not in visited:
                        process_node(child_node, indent_level)

    try:
        # Process all root nodes
        for root in root_nodes:
            process_node(root, 0)
            lines.append('')  # Add blank line between top-level elements

        code = '\n'.join(lines).strip()
        return {'code': code}

    except Exception as e:
        return {
            'code': f'# Error converting graph: {str(e)}',
            'error': str(e)
        }


