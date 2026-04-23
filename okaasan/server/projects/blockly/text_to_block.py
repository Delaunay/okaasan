"""
Convert text-based code to Blockly block representation.
Uses ast.NodeTransformer for cleaner AST traversal and transformation.
"""

import ast
from typing import Dict, List, Any, Optional


class BlocklyTransformer(ast.NodeTransformer):
    """
    Transforms Python AST nodes into Blockly block structure.
    """

    def __init__(self):
        self.blocks: List[Dict[str, Any]] = []
        self.x_pos = 50
        self.y_pos = 50
        self.y_increment = 100

    def get_blocks(self) -> List[Dict[str, Any]]:
        """Return the list of generated blocks."""
        return self.blocks

    def _unparse(self, node: ast.AST) -> str:
        """Safely unparse an AST node to string."""
        if node is None:
            return ''
        if hasattr(ast, 'unparse'):
            return ast.unparse(node)
        # Fallback for older Python versions
        return str(node)

    def _create_value_block(self, node: ast.AST) -> Optional[Dict[str, Any]]:
        """Create a value block from an expression node."""
        if isinstance(node, ast.Constant):
            if isinstance(node.value, str):
                return {
                    'type': 'text',
                    'fields': {
                        'TEXT': node.value
                    }
                }
            elif isinstance(node.value, (int, float)):
                return {
                    'type': 'math_number',
                    'fields': {
                        'NUM': node.value
                    }
                }
            elif isinstance(node.value, bool):
                return {
                    'type': 'logic_boolean',
                    'fields': {
                        'BOOL': 'TRUE' if node.value else 'FALSE'
                    }
                }
        elif isinstance(node, ast.Name):
            return {
                'type': 'variables_get',
                'fields': {
                    'VAR': node.id
                }
            }
        elif isinstance(node, ast.BinOp):
            return self._create_math_block(node)
        elif isinstance(node, ast.Call):
            return self._create_call_value_block(node)

        # Fallback: return as text
        return {
            'type': 'text',
            'fields': {
                'TEXT': self._unparse(node)
            }
        }

    def _create_math_block(self, node: ast.BinOp) -> Dict[str, Any]:
        """Create a math arithmetic block."""
        op_map = {
            ast.Add: 'ADD',
            ast.Sub: 'MINUS',
            ast.Mult: 'MULTIPLY',
            ast.Div: 'DIVIDE',
            ast.Pow: 'POWER'
        }

        op_type = op_map.get(type(node.op), 'ADD')

        return {
            'type': 'math_arithmetic',
            'fields': {
                'OP': op_type
            },
            'inputs': {
                'A': {
                    'block': self._create_value_block(node.left)
                },
                'B': {
                    'block': self._create_value_block(node.right)
                }
            }
        }

    def _create_call_value_block(self, node: ast.Call) -> Dict[str, Any]:
        """Create a block for a function call that returns a value."""
        func_name = ''
        if isinstance(node.func, ast.Name):
            func_name = node.func.id

        return {
            'type': 'procedures_callreturn',
            'fields': {
                'NAME': func_name
            }
        }

    def _process_statement_list(self, statements: List[ast.stmt]) -> Optional[Dict[str, Any]]:
        """Process a list of statements into a chain of blocks."""
        if not statements:
            return None

        blocks = []
        for stmt in statements:
            block = self._statement_to_block(stmt)
            if block:
                blocks.append(block)

        # Chain blocks together
        if blocks:
            for i in range(len(blocks) - 1):
                blocks[i]['next'] = {'block': blocks[i + 1]}
            return blocks[0]

        return None

    def _statement_to_block(self, node: ast.stmt) -> Optional[Dict[str, Any]]:
        """Convert a statement node to a block."""
        if isinstance(node, ast.Return):
            return self._create_return_block(node)
        elif isinstance(node, ast.Assign):
            return self._create_assign_block(node)
        elif isinstance(node, ast.Expr):
            return self._create_expr_block(node)
        elif isinstance(node, ast.If):
            return self._create_if_block(node)
        elif isinstance(node, ast.While):
            return self._create_while_block(node)
        elif isinstance(node, ast.For):
            return self._create_for_block(node)

        return None

    def _create_return_block(self, node: ast.Return) -> Dict[str, Any]:
        """Create a return block."""
        block = {
            'type': 'procedures_return',
            'fields': {}
        }

        if node.value:
            block['inputs'] = {
                'VALUE': {
                    'block': self._create_value_block(node.value)
                }
            }

        return block

    def _create_assign_block(self, node: ast.Assign) -> Dict[str, Any]:
        """Create a variable assignment block."""
        target = node.targets[0]
        var_name = target.id if isinstance(target, ast.Name) else 'var'

        return {
            'type': 'variables_set',
            'fields': {
                'VAR': var_name
            },
            'inputs': {
                'VALUE': {
                    'block': self._create_value_block(node.value)
                }
            }
        }

    def _create_expr_block(self, node: ast.Expr) -> Optional[Dict[str, Any]]:
        """Create a block from an expression statement."""
        if isinstance(node.value, ast.Call):
            func = node.value.func
            func_name = func.id if isinstance(func, ast.Name) else ''

            if func_name == 'print':
                # Create print block
                arg = node.value.args[0] if node.value.args else None
                block = {
                    'type': 'text_print',
                    'fields': {}
                }

                if arg:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        block['fields']['TEXT'] = arg.value
                    else:
                        block['inputs'] = {
                            'TEXT': {
                                'block': self._create_value_block(arg)
                            }
                        }

                return block
            else:
                # Generic function call
                return {
                    'type': 'procedures_callnoreturn',
                    'fields': {
                        'NAME': func_name
                    }
                }

        return None

    def _create_if_block(self, node: ast.If) -> Dict[str, Any]:
        """Create an if/else block."""
        block = {
            'type': 'controls_if',
            'inputs': {
                'IF0': {
                    'block': self._create_value_block(node.test)
                }
            },
            'statements': {}
        }

        # Add then branch
        then_block = self._process_statement_list(node.body)
        if then_block:
            block['statements']['DO0'] = {'block': then_block}

        # Add else branch if present
        if node.orelse:
            else_block = self._process_statement_list(node.orelse)
            if else_block:
                block['statements']['ELSE'] = {'block': else_block}

        return block

    def _create_while_block(self, node: ast.While) -> Dict[str, Any]:
        """Create a while loop block."""
        block = {
            'type': 'controls_whileUntil',
            'fields': {
                'MODE': 'WHILE'
            },
            'inputs': {
                'BOOL': {
                    'block': self._create_value_block(node.test)
                }
            },
            'statements': {}
        }

        body_block = self._process_statement_list(node.body)
        if body_block:
            block['statements']['DO'] = {'block': body_block}

        return block

    def _create_for_block(self, node: ast.For) -> Dict[str, Any]:
        """Create a for loop block."""
        var_name = node.target.id if isinstance(node.target, ast.Name) else 'i'

        block = {
            'type': 'controls_forEach',
            'fields': {
                'VAR': var_name
            },
            'inputs': {},
            'statements': {}
        }

        # Add list/iterable
        if node.iter:
            block['inputs']['LIST'] = {
                'block': self._create_value_block(node.iter)
            }

        # Add loop body
        body_block = self._process_statement_list(node.body)
        if body_block:
            block['statements']['DO'] = {'block': body_block}

        return block

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
        """Visit a function definition node."""
        # Create function block
        function_block = {
            'type': 'procedures_defnoreturn',
            'x': self.x_pos,
            'y': self.y_pos,
            'fields': {
                'NAME': node.name
            },
            'statements': {}
        }

        # Process function body
        body_block = self._process_statement_list(node.body)
        if body_block:
            function_block['statements']['STACK'] = {'block': body_block}

        self.blocks.append(function_block)
        self.y_pos += 200

        return node

    def visit_Assign(self, node: ast.Assign) -> ast.Assign:
        """Visit an assignment node at module level."""
        block = self._create_assign_block(node)
        if block:
            block['x'] = self.x_pos
            block['y'] = self.y_pos
            self.blocks.append(block)
            self.y_pos += self.y_increment

        return node

    def visit_Expr(self, node: ast.Expr) -> ast.Expr:
        """Visit an expression statement at module level."""
        block = self._create_expr_block(node)
        if block:
            block['x'] = self.x_pos
            block['y'] = self.y_pos
            self.blocks.append(block)
            self.y_pos += self.y_increment

        return node


def text_to_block(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert text code to Blockly block representation.

    Args:
        data: Dictionary containing 'code' key with text code string

    Returns:
        Dictionary with Blockly block structure
    """
    code = data.get('code', '')

    if not code.strip():
        return {
            'blocks': {
                'languageVersion': 0,
                'blocks': []
            }
        }

    try:
        tree = ast.parse(code)
        transformer = BlocklyTransformer()
        transformer.visit(tree)

        return {
            'blocks': {
                'languageVersion': 0,
                'blocks': transformer.get_blocks()
            }
        }

    except SyntaxError as e:
        return {
            'blocks': {
                'languageVersion': 0,
                'blocks': []
            },
            'error': f'Syntax error: {str(e)}'
        }
    except Exception as e:
        return {
            'blocks': {
                'languageVersion': 0,
                'blocks': []
            },
            'error': f'Error parsing code: {str(e)}'
        }
