"""
Convert Blockly block representation to text-based code.
"""

from typing import Dict, Any


def block_to_text(data: Dict[str, Any]) -> Dict[str, str]:
    """
    Convert Blockly blocks to Python text code.

    Args:
        data: Dictionary containing Blockly block structure

    Returns:
        Dictionary with 'code' key containing generated Python code
    """
    blocks_data = data.get('blocks', {})
    blocks = blocks_data.get('blocks', [])

    if not blocks:
        return {'code': ''}

    lines = []
    indent = 0

    def process_block(block: Dict[str, Any], indent_level: int = 0) -> None:
        indent_str = '    ' * indent_level
        block_type = block.get('type', '')
        fields = block.get('fields', {})
        statements = block.get('statements', {})

        if block_type == 'procedures_defnoreturn':
            func_name = fields.get('NAME', 'function')
            lines.append(f"{indent_str}def {func_name}():")

            # Process function body
            stack = statements.get('STACK', {}).get('block')
            if stack:
                process_block(stack, indent_level + 1)
            else:
                lines.append(f"{indent_str}    pass")

        elif block_type == 'procedures_return':
            value = fields.get('VALUE', '0')
            lines.append(f"{indent_str}return {value}")

        elif block_type == 'text_print':
            text = fields.get('TEXT', '')
            lines.append(f'{indent_str}print("{text}")')

        elif block_type == 'variables_set':
            var = fields.get('VAR', 'variable')
            value = fields.get('VALUE', '0')
            lines.append(f"{indent_str}{var} = {value}")

        elif block_type == 'math_number':
            # This is typically a value block, not a statement
            pass

        else:
            # Unknown block type
            lines.append(f"{indent_str}# Unknown block: {block_type}")

        # Process next block in sequence
        next_block = block.get('next', {}).get('block')
        if next_block:
            process_block(next_block, indent_level)

    try:
        # Process all top-level blocks
        for block in blocks:
            process_block(block, 0)
            lines.append('')  # Add blank line between top-level blocks

        code = '\n'.join(lines).strip()
        return {'code': code}

    except Exception as e:
        return {
            'code': f'# Error converting blocks: {str(e)}',
            'error': str(e)
        }

