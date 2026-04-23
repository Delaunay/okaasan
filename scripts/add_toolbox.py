#!/usr/bin/env python3
"""Script to add __toolbox__() methods to all BlocklyNode classes"""

import re

# Read the blocks.py file
with open('/home/setepenre/work/website/recipes/recipes/server/projects/blockly/blocks.py', 'r') as f:
    content = f.read()

# Pattern to match __def_blockly__() methods and extract the block type
# We need to find all patterns like:
#     @staticmethod
#     def __def_blockly__():
#         return {
#             'type': 'python_module',
#             ...
#         }
#
# And add after it:
#     @staticmethod
#     def __toolbox__():
#         return {'kind': 'block', 'type': 'python_module'}

pattern = r"(@staticmethod\s+def __def_blockly__\(\):\s+return \{[^}]*'type':\s+'([^']+)'[^}]*\})\s+"

def replacement(match):
    original = match.group(0)
    block_type = match.group(2)
    
    # Check if __toolbox__ already exists after this __def_blockly__
    # If it does, don't add it again
    next_chars = content[match.end():match.end()+200]
    if 'def __toolbox__' in next_chars:
        return original
    
    # Add the __toolbox__ method
    toolbox_method = f"""
    @staticmethod
    def __toolbox__():
        return {{'kind': 'block', 'type': '{block_type}'}}
"""
    
    return original + toolbox_method

# Apply the replacements
new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE | re.DOTALL)

# Write back to the file
with open('/home/setepenre/work/website/recipes/recipes/server/projects/blockly/blocks.py', 'w') as f:
    f.write(new_content)

print("✓ Successfully added __toolbox__() methods to all dataclasses")

# Count how many were added
count = new_content.count("def __toolbox__():")
print(f"✓ Total __toolbox__() methods found in file: {count}")


