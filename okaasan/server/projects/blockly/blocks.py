import ast
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union



COLORS = {
    "dict": 230,
    "list": 230,
    "set": 230,
    "tuple": 230, 
    "flow": 230,
    "loop": 230,
    "str": 230,
    "number": 230, 
}


class BlocklyNode:
    @classmethod
    def __def_blockly__(cls):
        """Return the blockly definition of this block"""
        raise NotImplementedError()

    @classmethod
    def __typename__(cls):
        return str(cls.__name__)

    @classmethod
    def __toolbox__(cls):
        return {"kind": "block", "type": cls.__typename__()}

    def __json__(self):
        """Return the json of this blockly node"""
        raise NotImplementedError()

    def __ast__(self):
        """Return the python AST of this blockly node"""
        raise NotImplementedError()


# ==================== Module Nodes ====================


@dataclass
class Module(BlocklyNode):
    """A Python module"""

    body: list[ast.stmt] = field(default_factory=list)
    type_ignores: list[ast.TypeIgnore] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Module %1",
            "args0": [{"type": "input_statement", "name": "BODY"}],
            "colour": 230,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"BODY": [stmt for stmt in self.body]},
        }

    def __ast__(self):
        return ast.Module(body=self.body, type_ignores=self.type_ignores)


@dataclass
class Interactive(BlocklyNode):
    """Interactive mode node"""

    body: list[ast.stmt] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Interactive %1",
            "args0": [{"type": "input_statement", "name": "BODY"}],
            "colour": 230,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"BODY": [stmt for stmt in self.body]},
        }

    def __ast__(self):
        return ast.Interactive(body=self.body)


@dataclass
class Expression(BlocklyNode):
    """Expression node for eval mode"""

    body: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": " %1",
            "args0": [{"type": "input_value", "name": "BODY"}],
            "colour": 230,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.Expression(body=self.body)


# ==================== Literal Nodes ====================


@dataclass
class Constant(BlocklyNode):
    """Constant value (string, number, bool, None, etc.)"""

    value: Any = None
    kind: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Constant %1",
            "args0": [{"type": "field_input", "name": "VALUE", "text": ""}],
            "output": None,
            "colour": 160,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"VALUE": str(self.value)},
        }

    def __ast__(self):
        return ast.Constant(value=self.value, kind=self.kind)


@dataclass
class FormattedValue(BlocklyNode):
    """Formatted value in f-string"""

    value: ast.expr = None
    conversion: int = -1
    format_spec: Optional[ast.expr] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "{%1:%2} ",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "VALUE"},
                # {"type": "field_number", "name": "CONVERSION", "value": -1},
                {"type": "input_value", "name": "FORMAT_SPEC"},
            ],
            "output": None,
            "colour": 160,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value, "FORMAT_SPEC": self.format_spec},
            "fields": {"CONVERSION": self.conversion},
        }

    def __ast__(self):
        return ast.FormattedValue(
            value=self.value, conversion=self.conversion, format_spec=self.format_spec
        )


@dataclass
class JoinedStr(BlocklyNode):
    """F-string (formatted string literal)"""

    values: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "f'%1'",
            "args0": [{"type": "input_value", "name": "VALUES"}],
            "output": None,
            "colour": 160,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"VALUES": self.values},
        }

    def __ast__(self):
        return ast.JoinedStr(values=self.values)


@dataclass
class List(BlocklyNode):
    """List literal"""

    elts: list[ast.expr] = field(default_factory=list)
    ctx: ast.expr_context = field(default_factory=ast.Load)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "[%1]",
            "args0": [{"type": "input_value", "name": "ELEMENTS"}],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"ELEMENTS": self.elts},
        }

    def __ast__(self):
        return ast.List(elts=self.elts, ctx=self.ctx)


@dataclass
class Tuple(BlocklyNode):
    """Tuple literal"""

    elts: list[ast.expr] = field(default_factory=list)
    ctx: ast.expr_context = field(default_factory=ast.Load)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "(%1)",
            "args0": [{"type": "input_value", "name": "ELEMENTS"}],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"ELEMENTS": self.elts},
        }

    def __ast__(self):
        return ast.Tuple(elts=self.elts, ctx=self.ctx)


@dataclass
class Set(BlocklyNode):
    """Set literal"""

    elts: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "{%1}",
            "args0": [{"type": "input_value", "name": "ELEMENTS"}],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"ELEMENTS": self.elts},
        }

    def __ast__(self):
        return ast.Set(elts=self.elts)


@dataclass
class Dict(BlocklyNode):
    """Dictionary literal"""

    keys: list[Optional[ast.expr]] = field(default_factory=list)
    values: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "{%1: %2}",
            "args0": [
                {"type": "input_value", "name": "KEYS"},
                {"type": "input_value", "name": "VALUES"},
            ],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"KEYS": self.keys, "VALUES": self.values},
        }

    def __ast__(self):
        return ast.Dict(keys=self.keys, values=self.values)


# ==================== Variable Nodes ====================


@dataclass
class Name(BlocklyNode):
    """Variable name"""

    id: str = ""
    ctx: ast.expr_context = field(default_factory=ast.Load)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1",
            "args0": [{"type": "field_input", "name": "ID", "text": "name"}],
            "output": None,
            "colour": 330,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"ID": self.id},
        }

    def __ast__(self):
        return ast.Name(id=self.id, ctx=self.ctx)


@dataclass
class Starred(BlocklyNode):
    """Starred expression (*args)"""

    value: ast.expr = None
    ctx: ast.expr_context = field(default_factory=ast.Load)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "* %1",
            "args0": [{"type": "input_value", "name": "VALUE"}],
            "output": None,
            "colour": 330,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.Starred(value=self.value, ctx=self.ctx)


# ==================== Expression Nodes ====================


@dataclass
class Expr(BlocklyNode):
    """Expression statement"""

    value: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Expression %1",
            "args0": [{"type": "input_value", "name": "VALUE"}],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.Expr(value=self.value)


@dataclass
class UnaryOp(BlocklyNode):
    """Unary operation (not, -, +, ~)"""

    op: ast.unaryop = None
    operand: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Unary %1 %2",
            "args0": [
                {
                    "type": "field_dropdown",
                    "name": "OP",
                    "options": [
                        ["not", "Not"],
                        ["-", "USub"],
                        ["+", "UAdd"],
                        ["~", "Invert"],
                    ],
                },
                {"type": "input_value", "name": "OPERAND"},
            ],
            "output": None,
            "colour": 230,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"OP": type(self.op).__name__},
            "inputs": {"OPERAND": self.operand},
        }

    def __ast__(self):
        return ast.UnaryOp(op=self.op, operand=self.operand)


@dataclass
class BinOp(BlocklyNode):
    """Binary operation (+, -, *, /, etc.)"""

    left: ast.expr = None
    op: ast.operator = None
    right: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 %2 %3",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "LEFT"},
                {
                    "type": "field_dropdown",
                    "name": "OP",
                    "options": [
                        ["+", "Add"],
                        ["-", "Sub"],
                        ["*", "Mult"],
                        ["/", "Div"],
                        ["//", "FloorDiv"],
                        ["%", "Mod"],
                        ["**", "Pow"],
                        ["<<", "LShift"],
                        [">>", "RShift"],
                        ["|", "BitOr"],
                        ["^", "BitXor"],
                        ["&", "BitAnd"],
                        ["@", "MatMult"],
                    ],
                },
                {"type": "input_value", "name": "RIGHT"},
            ],
            "output": "NumberType",
            "colour": 230,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"OP": type(self.op).__name__},
            "inputs": {"LEFT": self.left, "RIGHT": self.right},
        }

    def __ast__(self):
        return ast.BinOp(left=self.left, op=self.op, right=self.right)


@dataclass
class BoolOp(BlocklyNode):
    """Boolean operation (and, or)"""

    op: ast.boolop = None
    values: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 %2 %3",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "VALUES"},
                {
                    "type": "field_dropdown",
                    "name": "OP",
                    "options": [["and", "And"], ["or", "Or"]],
                },
                {"type": "input_value", "name": "VALUES"},
            ],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"OP": type(self.op).__name__},
            "statements": {"VALUES": self.values},
        }

    def __ast__(self):
        return ast.BoolOp(op=self.op, values=self.values)


@dataclass
class Compare(BlocklyNode):
    """Comparison operation (==, !=, <, >, etc.)"""

    left: ast.expr = None
    ops: list[ast.cmpop] = field(default_factory=list)
    comparators: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 %2 %3",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "LEFT"},
                {
                    "type": "field_dropdown",
                    "name": "OP",
                    "options": [
                        ["==", "Eq"],
                        ["!=", "NotEq"],
                        ["<", "Lt"],
                        ["<=", "LtE"],
                        [">", "Gt"],
                        [">=", "GtE"],
                        ["is", "Is"],
                        ["is not", "IsNot"],
                        ["in", "In"],
                        ["not in", "NotIn"],
                    ],
                },
                {"type": "input_value", "name": "RIGHT"},
            ],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"LEFT": self.left},
            "fields": {"OP": [type(op).__name__ for op in self.ops]},
            "statements": {"COMPARATORS": self.comparators},
        }

    def __ast__(self):
        return ast.Compare(left=self.left, ops=self.ops, comparators=self.comparators)


@dataclass
class Call(BlocklyNode):
    """Function call"""

    func: ast.expr = None
    args: list[ast.expr] = field(default_factory=list)
    keywords: list[ast.keyword] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1(%2)",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "FUNC"},
                {"type": "input_statement", "name": "ARGS"},
            ],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"FUNC": self.func},
            "statements": {"ARGS": self.args},
        }

    def __ast__(self):
        return ast.Call(func=self.func, args=self.args, keywords=self.keywords)


@dataclass
class Attribute(BlocklyNode):
    """Attribute access (obj.attr)"""

    value: ast.expr = None
    attr: str = ""
    ctx: ast.expr_context = field(default_factory=ast.Load)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 . %2",
            "args0": [
                {"type": "input_value", "name": "VALUE"},
                {"type": "field_input", "name": "ATTR", "text": "attribute"},
            ],
            "output": None,
            "colour": 330,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
            "fields": {"ATTR": self.attr},
        }

    def __ast__(self):
        return ast.Attribute(value=self.value, attr=self.attr, ctx=self.ctx)


@dataclass
class Subscript(BlocklyNode):
    """Subscript access (obj[key])"""

    value: ast.expr = None
    slice: ast.expr = None
    ctx: ast.expr_context = field(default_factory=ast.Load)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 [ %2 ]",
            "args0": [
                {"type": "input_value", "name": "VALUE"},
                {"type": "input_value", "name": "SLICE"},
            ],
            "output": None,
            "colour": 330,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value, "SLICE": self.slice},
        }

    def __ast__(self):
        return ast.Subscript(value=self.value, slice=self.slice, ctx=self.ctx)


@dataclass
class Slice(BlocklyNode):
    """Slice expression (start:stop:step)"""

    lower: Optional[ast.expr] = None
    upper: Optional[ast.expr] = None
    step: Optional[ast.expr] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Slice(start=%1 end=%2 step=%3)",
            "args0": [
                {"type": "input_value", "name": "LOWER"},
                {"type": "input_value", "name": "UPPER"},
                {"type": "input_value", "name": "STEP"},
            ],
            "output": None,
            "colour": 330,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {
                "LOWER": self.lower,
                "UPPER": self.upper,
                "STEP": self.step,
            },
        }

    def __ast__(self):
        return ast.Slice(lower=self.lower, upper=self.upper, step=self.step)


# ==================== Comprehension Nodes ====================


@dataclass
class ListComp(BlocklyNode):
    """List comprehension"""

    elt: ast.expr = None
    generators: list[ast.comprehension] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "inputsInline": True,
            "message0": "[ %1",
            "args0": [
                {"type": "input_value", "name": "ELT"},
            ],
            "message1": "for %1 in %2 ]",
            "args1": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ITERATOR"},
            ],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"ELT": self.elt},
            "statements": {"GENERATORS": self.generators},
        }

    def __ast__(self):
        return ast.ListComp(elt=self.elt, generators=self.generators)


@dataclass
class SetComp(BlocklyNode):
    """Set comprehension"""

    elt: ast.expr = None
    generators: list[ast.comprehension] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "inputsInline": True,
            "message0": "{ %1",
            "args0": [
                {"type": "input_value", "name": "ELT"},
            ],
            "message1": "for %1 in %2 }",
            "args1": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ITERATOR"},
            ],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"ELT": self.elt},
            "statements": {"GENERATORS": self.generators},
        }

    def __ast__(self):
        return ast.SetComp(elt=self.elt, generators=self.generators)


@dataclass
class DictComp(BlocklyNode):
    """Dictionary comprehension"""

    key: ast.expr = None
    value: ast.expr = None
    generators: list[ast.comprehension] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "inputsInline": True,
            "message0": "{ %1: %2",
            "args0": [
                {"type": "input_value", "name": "KEY"},
                {"type": "input_value", "name": "VALUE"},
            ],
            "message1": "for %1 in %2 }",
            "args1": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ITERATOR"},
            ],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"KEY": self.key, "VALUE": self.value},
            "statements": {"GENERATORS": self.generators},
        }

    def __ast__(self):
        return ast.DictComp(key=self.key, value=self.value, generators=self.generators)


@dataclass
class GeneratorExp(BlocklyNode):
    """Generator expression"""

    elt: ast.expr = None
    generators: list[ast.comprehension] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "inputsInline": True,
            "message0": "( %1",
            "args0": [
                {"type": "input_value", "name": "ELT"},
            ],
            "message1": "for %1 in %2 )",
            "args1": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ITERATOR"},
            ],
            "output": None,
            "colour": 260,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"ELT": self.elt},
            "statements": {"GENERATORS": self.generators},
        }

    def __ast__(self):
        return ast.GeneratorExp(elt=self.elt, generators=self.generators)


# ==================== Statement Nodes ====================


@dataclass
class Assign(BlocklyNode):
    """Assignment statement"""

    targets: list[ast.expr] = field(default_factory=list)
    value: ast.expr = None
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 = %2",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "TARGETS"},
                {"type": "input_value", "name": "VALUE"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 330,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"TARGETS": self.targets},
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.Assign(
            targets=self.targets, value=self.value, type_comment=self.type_comment
        )


@dataclass
class AnnAssign(BlocklyNode):
    """Annotated assignment"""

    target: ast.expr = None
    annotation: ast.expr = None
    value: Optional[ast.expr] = None
    simple: int = 1

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 : %2 = %3",
            "args0": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ANNOTATION"},
                {"type": "input_value", "name": "VALUE"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 330,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {
                "TARGET": self.target,
                "ANNOTATION": self.annotation,
                "VALUE": self.value,
            },
        }

    def __ast__(self):
        return ast.AnnAssign(
            target=self.target,
            annotation=self.annotation,
            value=self.value,
            simple=self.simple,
        )


@dataclass
class AugAssign(BlocklyNode):
    """Augmented assignment (+=, -=, etc.)"""

    target: ast.expr = None
    op: ast.operator = None
    value: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 %2 %3",
            "args0": [
                {"type": "input_value", "name": "TARGET"},
                {
                    "type": "field_dropdown",
                    "name": "OP",
                    "options": [
                        ["+=", "Add"],
                        ["-=", "Sub"],
                        ["*=", "Mult"],
                        ["/=", "Div"],
                        ["//=", "FloorDiv"],
                        ["%=", "Mod"],
                        ["**=", "Pow"],
                    ],
                },
                {"type": "input_value", "name": "VALUE"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 330,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TARGET": self.target, "VALUE": self.value},
            "fields": {"OP": type(self.op).__name__},
        }

    def __ast__(self):
        return ast.AugAssign(target=self.target, op=self.op, value=self.value)


@dataclass
class Return(BlocklyNode):
    """Return statement"""

    value: Optional[ast.expr] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "return %1",
            "args0": [{"type": "input_value", "name": "VALUE"}],
            "previousStatement": None,
            "colour": 290,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.Return(value=self.value)


@dataclass
class Delete(BlocklyNode):
    """Delete statement"""

    targets: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "del %1",
            "args0": [{"type": "input_value", "name": "TARGETS"}],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"TARGETS": self.targets},
        }

    def __ast__(self):
        return ast.Delete(targets=self.targets)


@dataclass
class Pass(BlocklyNode):
    """Pass statement"""

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "pass",
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
        }

    def __json__(self):
        return {"type": "python_pass"}

    def __ast__(self):
        return ast.Pass()


@dataclass
class Break(BlocklyNode):
    """Break statement"""

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "break",
            "previousStatement": None,
            "colour": 120,
        }

    def __json__(self):
        return {"type": "python_break"}

    def __ast__(self):
        return ast.Break()


@dataclass
class Continue(BlocklyNode):
    """Continue statement"""

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "continue",
            "previousStatement": None,
            "nextStatement": None,
            "colour": 120,
        }

    def __json__(self):
        return {"type": "python_continue"}

    def __ast__(self):
        return ast.Continue()


@dataclass
class Global(BlocklyNode):
    """Global statement"""

    names: list[str] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "global %1",
            "args0": [{"type": "field_input", "name": "NAMES", "text": ""}],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"NAMES": ",".join(self.names)},
        }

    def __ast__(self):
        return ast.Global(names=self.names)


@dataclass
class Nonlocal(BlocklyNode):
    """Nonlocal statement"""

    names: list[str] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Nonlocal %1",
            "args0": [{"type": "field_input", "name": "NAMES", "text": ""}],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"NAMES": ",".join(self.names)},
        }

    def __ast__(self):
        return ast.Nonlocal(names=self.names)


# ==================== Control Flow Nodes ====================


@dataclass
class If(BlocklyNode):
    """If statement"""

    test: ast.expr = None
    body: list[ast.stmt] = field(default_factory=list)
    orelse: list[ast.stmt] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "if %1:",
            "args0": [
                {"type": "input_value", "name": "TEST"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "message2": "else:",
            "args2": [],
            "message3": "%1",
            "args3": [
                {"type": "input_statement", "name": "ORELSE"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TEST": self.test},
            "statements": {"BODY": self.body, "ORELSE": self.orelse},
        }

    def __ast__(self):
        return ast.If(test=self.test, body=self.body, orelse=self.orelse)


@dataclass
class For(BlocklyNode):
    """For loop"""

    target: ast.expr = None
    iter: ast.expr = None
    body: list[ast.stmt] = field(default_factory=list)
    orelse: list[ast.stmt] = field(default_factory=list)
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "for %1 in %2:",
            "args0": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ITER"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 120,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TARGET": self.target, "ITER": self.iter},
            "statements": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.For(
            target=self.target,
            iter=self.iter,
            body=self.body,
            orelse=self.orelse,
            type_comment=self.type_comment,
        )


@dataclass
class While(BlocklyNode):
    """While loop"""

    test: ast.expr = None
    body: list[ast.stmt] = field(default_factory=list)
    orelse: list[ast.stmt] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "while %1:",
            "args0": [
                {"type": "input_value", "name": "TEST"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 120,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TEST": self.test},
            "statements": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.While(test=self.test, body=self.body, orelse=self.orelse)


@dataclass
class With(BlocklyNode):
    """With statement"""

    items: list[ast.withitem] = field(default_factory=list)
    body: list[ast.stmt] = field(default_factory=list)
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "with %1:",
            "args0": [
                {"type": "input_value", "name": "ITEMS"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"ITEMS": self.items, "BODY": self.body},
        }

    def __ast__(self):
        return ast.With(
            items=self.items, body=self.body, type_comment=self.type_comment
        )


@dataclass
class Raise(BlocklyNode):
    """Raise statement"""

    exc: Optional[ast.expr] = None
    cause: Optional[ast.expr] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "raise %1 from %2",
            "args0": [
                {"type": "input_value", "name": "EXC"},
                {"type": "input_value", "name": "CAUSE"},
            ],
            "previousStatement": None,
            "colour": 0,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"EXC": self.exc, "CAUSE": self.cause},
        }

    def __ast__(self):
        return ast.Raise(exc=self.exc, cause=self.cause)


@dataclass
class Try(BlocklyNode):
    """Try/except statement"""

    body: list[ast.stmt] = field(default_factory=list)
    handlers: list[ast.ExceptHandler] = field(default_factory=list)
    orelse: list[ast.stmt] = field(default_factory=list)
    finalbody: list[ast.stmt] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "try:",
            "args0": [],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],

            "message2": "except:",
            "args2": [],
            "message3": "%1",
            "args3": [
                {"type": "input_statement", "name": "HANDLERS"},
            ],

            "message4": "else:",
            "args4": [],
            "message5": "%1",
            "args5": [
                {"type": "input_statement", "name": "ORELSE"},
            ],

            "message6": "finally:",
            "args6": [],
            "message7": "%1",
            "args7": [
                {"type": "input_statement", "name": "FINALBODY"},
            ],

            "previousStatement": None,
            "nextStatement": None,
            "colour": 0,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {
                "BODY": self.body,
                "HANDLERS": self.handlers,
                "ORELSE": self.orelse,
                "FINALBODY": self.finalbody,
            },
        }

    def __ast__(self):
        return ast.Try(
            body=self.body,
            handlers=self.handlers,
            orelse=self.orelse,
            finalbody=self.finalbody,
        )


@dataclass
class Assert(BlocklyNode):
    """Assert statement"""

    test: ast.expr = None
    msg: Optional[ast.expr] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "assert %1, %2",
            "args0": [
                {"type": "input_value", "name": "TEST"},
                {"type": "input_value", "name": "MSG"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 0,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TEST": self.test, "MSG": self.msg},
        }

    def __ast__(self):
        return ast.Assert(test=self.test, msg=self.msg)


# ==================== Import Nodes ====================


@dataclass
class Import(BlocklyNode):
    """Import statement"""

    names: list[ast.alias] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "import %1",
            "args0": [{"type": "input_statement", "name": "NAMES"}],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 160,
            "inputsInline": True,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"NAMES": self.names},
        }

    def __ast__(self):
        return ast.Import(names=self.names)


@dataclass
class ImportFrom(BlocklyNode):
    """Import from statement"""

    module: Optional[str] = None
    names: list[ast.alias] = field(default_factory=list)
    level: int = 0

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "from %1 import %2",
            "args0": [
                {"type": "field_input", "name": "MODULE", "text": ""},
                {"type": "input_statement", "name": "NAMES"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 160,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"MODULE": self.module or ""},
            "statements": {"NAMES": self.names},
        }

    def __ast__(self):
        return ast.ImportFrom(module=self.module, names=self.names, level=self.level)


# ==================== Function/Class Nodes ====================


@dataclass
class FunctionDef(BlocklyNode):
    """Function definition"""

    name: str = ""
    args: ast.arguments = None
    body: list[ast.stmt] = field(default_factory=list)
    decorator_list: list[ast.expr] = field(default_factory=list)
    returns: Optional[ast.expr] = None
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "def %1(%2):",
            "args0": [
                {"type": "field_input", "name": "NAME", "text": "function"},
                {"type": "input_value", "name": "ARGS"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"NAME": self.name},
            "inputs": {"ARGS": self.args, "RETURNS": self.returns},
            "statements": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.FunctionDef(
            name=self.name,
            args=self.args
            or ast.arguments(
                posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]
            ),
            body=self.body or [ast.Pass()],
            decorator_list=self.decorator_list,
            returns=self.returns,
            type_comment=self.type_comment,
        )


@dataclass
class AsyncFunctionDef(BlocklyNode):
    """Async function definition"""

    name: str = ""
    args: ast.arguments = None
    body: list[ast.stmt] = field(default_factory=list)
    decorator_list: list[ast.expr] = field(default_factory=list)
    returns: Optional[ast.expr] = None
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "async def %1(%2):",
            "args0": [
                {"type": "field_input", "name": "NAME", "text": "function"},
                {"type": "input_value", "name": "ARGS"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"NAME": self.name},
            "inputs": {"ARGS": self.args, "RETURNS": self.returns},
            "statements": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.AsyncFunctionDef(
            name=self.name,
            args=self.args
            or ast.arguments(
                posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]
            ),
            body=self.body or [ast.Pass()],
            decorator_list=self.decorator_list,
            returns=self.returns,
            type_comment=self.type_comment,
        )


@dataclass
class ClassDef(BlocklyNode):
    """Class definition"""

    name: str = ""
    bases: list[ast.expr] = field(default_factory=list)
    keywords: list[ast.keyword] = field(default_factory=list)
    body: list[ast.stmt] = field(default_factory=list)
    decorator_list: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "class %1(%2):",
            "args0": [
                {"type": "field_input", "name": "NAME", "text": "ClassName"},
                {"type": "input_value", "name": "BASES"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 330,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"NAME": self.name},
            "statements": {"BASES": self.bases, "BODY": self.body},
        }

    def __ast__(self):
        return ast.ClassDef(
            name=self.name,
            bases=self.bases,
            keywords=self.keywords,
            body=self.body or [ast.Pass()],
            decorator_list=self.decorator_list,
        )


@dataclass
class Lambda(BlocklyNode):
    """Lambda expression"""

    args: ast.arguments = None
    body: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "lambda %1:",
            "args0": [
                {"type": "input_value", "name": "ARGS"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"ARGS": self.args, "BODY": self.body},
        }

    def __ast__(self):
        return ast.Lambda(
            args=self.args
            or ast.arguments(
                posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]
            ),
            body=self.body or ast.Constant(value=None),
        )


# ==================== Async Nodes ====================


@dataclass
class AsyncFor(BlocklyNode):
    """Async for loop"""

    target: ast.expr = None
    iter: ast.expr = None
    body: list[ast.stmt] = field(default_factory=list)
    orelse: list[ast.stmt] = field(default_factory=list)
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "async for %1 in %2:",
            "args0": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ITER"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 120,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TARGET": self.target, "ITER": self.iter},
            "statements": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.AsyncFor(
            target=self.target,
            iter=self.iter,
            body=self.body,
            orelse=self.orelse,
            type_comment=self.type_comment,
        )


@dataclass
class AsyncWith(BlocklyNode):
    """Async with statement"""

    items: list[ast.withitem] = field(default_factory=list)
    body: list[ast.stmt] = field(default_factory=list)
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "async with %1:",
            "args0": [
                {"type": "input_value", "name": "ITEMS"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"ITEMS": self.items, "BODY": self.body},
        }

    def __ast__(self):
        return ast.AsyncWith(
            items=self.items, body=self.body, type_comment=self.type_comment
        )


@dataclass
class Await(BlocklyNode):
    """Await expression"""

    value: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "await %1",
            "args0": [{"type": "input_value", "name": "VALUE"}],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.Await(value=self.value)


@dataclass
class Yield(BlocklyNode):
    """Yield expression"""

    value: Optional[ast.expr] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "yield %1",
            "args0": [{"type": "input_value", "name": "VALUE"}],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.Yield(value=self.value)


@dataclass
class YieldFrom(BlocklyNode):
    """Yield from expression"""

    value: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "yield from %1",
            "args0": [{"type": "input_value", "name": "VALUE"}],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.YieldFrom(value=self.value)


# ==================== Pattern Matching (Python 3.10+) ====================


@dataclass
class Match(BlocklyNode):
    """Match statement"""

    subject: ast.expr = None
    cases: list[ast.match_case] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "match %1:",
            "args0": [
                {"type": "input_value", "name": "SUBJECT"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "CASES"},
            ],
            "previousStatement": None,
            "nextStatement": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"SUBJECT": self.subject},
            "statements": {"CASES": self.cases},
        }

    def __ast__(self):
        return ast.Match(subject=self.subject, cases=self.cases)


@dataclass
class MatchValue(BlocklyNode):
    """Match value pattern"""

    value: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match value %1",
            "args0": [{"type": "input_value", "name": "PAT"}],
            # "previousStatement": None,
            # "nextStatement": None,
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.MatchValue(value=self.value)


@dataclass
class MatchSingleton(BlocklyNode):
    """Match singleton pattern (True, False, None)"""

    value: Union[bool, None] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match singleton %1",
            "args0": [{"type": "field_input", "name": "VALUE", "text": "None"}],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"VALUE": str(self.value)},
        }

    def __ast__(self):
        return ast.MatchSingleton(value=self.value)


@dataclass
class MatchSequence(BlocklyNode):
    """Match sequence pattern"""

    patterns: list[ast.pattern] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match sequence %1",
            "args0": [{"type": "input_value", "name": "PATTERNS"}],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"PATTERNS": self.patterns},
        }

    def __ast__(self):
        return ast.MatchSequence(patterns=self.patterns)


@dataclass
class MatchMapping(BlocklyNode):
    """Match mapping pattern"""

    keys: list[ast.expr] = field(default_factory=list)
    patterns: list[ast.pattern] = field(default_factory=list)
    rest: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match mapping keys %1 patterns %2 rest %3",
            "args0": [
                {"type": "input_value", "name": "KEYS"},
                {"type": "input_value", "name": "PATTERNS"},
                {"type": "field_input", "name": "REST", "text": ""},
            ],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"KEYS": self.keys, "PATTERNS": self.patterns},
            "fields": {"REST": self.rest or ""},
        }

    def __ast__(self):
        return ast.MatchMapping(keys=self.keys, patterns=self.patterns, rest=self.rest)


@dataclass
class MatchClass(BlocklyNode):
    """Match class pattern"""

    cls: ast.expr = None
    patterns: list[ast.pattern] = field(default_factory=list)
    kwd_attrs: list[str] = field(default_factory=list)
    kwd_patterns: list[ast.pattern] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match class %1 patterns %2",
            "args0": [
                {"type": "input_value", "name": "CLS"},
                {"type": "input_value", "name": "PATTERNS"},
            ],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"CLS": self.cls},
            "statements": {"PATTERNS": self.patterns},
        }

    def __ast__(self):
        return ast.MatchClass(
            cls=self.cls,
            patterns=self.patterns,
            kwd_attrs=self.kwd_attrs,
            kwd_patterns=self.kwd_patterns,
        )


@dataclass
class MatchStar(BlocklyNode):
    """Match star pattern (*rest)"""

    name: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match star * %1",
            "args0": [{"type": "field_input", "name": "NAME", "text": ""}],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"NAME": self.name or ""},
        }

    def __ast__(self):
        return ast.MatchStar(name=self.name)


@dataclass
class MatchAs(BlocklyNode):
    """Match as pattern (pattern as name)"""

    pattern: Optional[ast.pattern] = None
    name: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match %1 as %2",
            "args0": [
                {"type": "input_value", "name": "PATTERN"},
                {"type": "field_input", "name": "NAME", "text": ""},
            ],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"PATTERN": self.pattern},
            "fields": {"NAME": self.name or ""},
        }

    def __ast__(self):
        return ast.MatchAs(pattern=self.pattern, name=self.name)


@dataclass
class MatchOr(BlocklyNode):
    """Match or pattern (pattern1 | pattern2)"""

    patterns: list[ast.pattern] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Match or %1",
            "args0": [{"type": "input_value", "name": "PATTERNS"}],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {"PATTERNS": self.patterns},
        }

    def __ast__(self):
        return ast.MatchOr(patterns=self.patterns)


# ==================== Special/Type Nodes ====================


@dataclass
class IfExp(BlocklyNode):
    """Conditional expression (x if test else y)"""

    test: ast.expr = None
    body: ast.expr = None
    orelse: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 if %2 else %3",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "BODY"},
                {"type": "input_value", "name": "TEST"},
                {"type": "input_value", "name": "ORELSE"},
            ],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TEST": self.test, "BODY": self.body, "ORELSE": self.orelse},
        }

    def __ast__(self):
        return ast.IfExp(test=self.test, body=self.body, orelse=self.orelse)


@dataclass
class NamedExpr(BlocklyNode):
    """Named expression (walrus operator :=)"""

    target: ast.expr = None
    value: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 := %2",
            "inputsInline": True,
            "args0": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "VALUE"},
            ],
            "output": None,
            "colour": 330,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TARGET": self.target, "VALUE": self.value},
        }

    def __ast__(self):
        return ast.NamedExpr(target=self.target, value=self.value)


# ==================== Auxiliary/Helper Nodes ====================


@dataclass
class Arguments(BlocklyNode):
    """Function arguments"""

    posonlyargs: list[ast.arg] = field(default_factory=list)
    args: list[ast.arg] = field(default_factory=list)
    vararg: Optional[ast.arg] = None
    kwonlyargs: list[ast.arg] = field(default_factory=list)
    kw_defaults: list[Optional[ast.expr]] = field(default_factory=list)
    kwarg: Optional[ast.arg] = None
    defaults: list[ast.expr] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Arguments args %1 vararg %2 kwonlyargs %3 kwarg %4",
            "args0": [
                {"type": "input_statement", "name": "ARGS"},
                {"type": "input_value", "name": "VARARG"},
                {"type": "input_statement", "name": "KWONLYARGS"},
                {"type": "input_value", "name": "KWARG"},
            ],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "statements": {
                "ARGS": self.args,
                "KWONLYARGS": self.kwonlyargs,
            },
            "inputs": {
                "VARARG": self.vararg,
                "KWARG": self.kwarg,
            },
        }

    def __ast__(self):
        return ast.arguments(
            posonlyargs=self.posonlyargs,
            args=self.args,
            vararg=self.vararg,
            kwonlyargs=self.kwonlyargs,
            kw_defaults=self.kw_defaults,
            kwarg=self.kwarg,
            defaults=self.defaults,
        )


@dataclass
class Arg(BlocklyNode):
    """Function argument"""

    arg: str = ""
    annotation: Optional[ast.expr] = None
    type_comment: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 : %2",
            "args0": [
                {"type": "field_input", "name": "ARG", "text": "arg"},
                {"type": "input_value", "name": "ANNOTATION"},
            ],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"ARG": self.arg},
            "inputs": {"ANNOTATION": self.annotation},
        }

    def __ast__(self):
        return ast.arg(
            arg=self.arg, annotation=self.annotation, type_comment=self.type_comment
        )


@dataclass
class Keyword(BlocklyNode):
    """Keyword argument in function call"""

    arg: Optional[str] = None
    value: ast.expr = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Keyword %1 = %2",
            "args0": [
                {"type": "field_input", "name": "ARG", "text": ""},
                {"type": "input_value", "name": "VALUE"},
            ],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"ARG": self.arg or ""},
            "inputs": {"VALUE": self.value},
        }

    def __ast__(self):
        return ast.keyword(arg=self.arg, value=self.value)


@dataclass
class Alias(BlocklyNode):
    """Import alias"""

    name: str = ""
    asname: Optional[str] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "%1 as %2",
            "args0": [
                {"type": "field_input", "name": "NAME", "text": "module"},
                {"type": "field_input", "name": "ASNAME", "text": ""},
            ],
            "output": None,
            "colour": 160,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"NAME": self.name, "ASNAME": self.asname or ""},
        }

    def __ast__(self):
        return ast.alias(name=self.name, asname=self.asname)


@dataclass
class WithItem(BlocklyNode):
    """With statement item"""

    context_expr: ast.expr = None
    optional_vars: Optional[ast.expr] = None

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "With %1 as %2",
            "args0": [
                {"type": "input_value", "name": "CONTEXT_EXPR"},
                {"type": "input_value", "name": "OPTIONAL_VARS"},
            ],
            "output": None,
            "colour": 290,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {
                "CONTEXT_EXPR": self.context_expr,
                "OPTIONAL_VARS": self.optional_vars,
            },
        }

    def __ast__(self):
        return ast.withitem(
            context_expr=self.context_expr, optional_vars=self.optional_vars
        )


@dataclass
class ExceptHandler(BlocklyNode):
    """Exception handler"""

    type: Optional[ast.expr] = None
    name: Optional[str] = None
    body: list[ast.stmt] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "except %1 as %2:",
            "args0": [
                {"type": "input_value", "name": "TYPE"},
                {"type": "field_input", "name": "NAME", "text": ""},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "output": None,
            "colour": 0,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TYPE": self.type},
            "fields": {"NAME": self.name or ""},
            "statements": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.ExceptHandler(type=self.type, name=self.name, body=self.body)


@dataclass
class Comprehension(BlocklyNode):
    """Comprehension generator"""

    target: ast.expr = None
    iter: ast.expr = None
    ifs: list[ast.expr] = field(default_factory=list)
    is_async: int = 0

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "for %1 in %2 if %3:",
            "args0": [
                {"type": "input_value", "name": "TARGET"},
                {"type": "input_value", "name": "ITER"},
                {"type": "input_value", "name": "IFS"},
            ],
            "message1": "%1",
            "args0": [
                {"type": "input_value", "name": "EXPR"},
            ],
            "output": None,
            "colour": 120,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"TARGET": self.target, "ITER": self.iter},
            "statements": {"IFS": self.ifs},
        }

    def __ast__(self):
        return ast.comprehension(
            target=self.target, iter=self.iter, ifs=self.ifs, is_async=self.is_async
        )


@dataclass
class MatchCase(BlocklyNode):
    """Match case"""

    pattern: ast.pattern = None
    guard: Optional[ast.expr] = None
    body: list[ast.stmt] = field(default_factory=list)

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "case %1 if %2:",
            "args0": [
                {"type": "input_value", "name": "PATTERN"},
                {"type": "input_value", "name": "GUARD"},
            ],
            "message1": "%1",
            "args1": [
                {"type": "input_statement", "name": "BODY"},
            ],
            "output": None,
            "colour": 210,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "inputs": {"PATTERN": self.pattern, "GUARD": self.guard},
            "statements": {"BODY": self.body},
        }

    def __ast__(self):
        return ast.match_case(pattern=self.pattern, guard=self.guard, body=self.body)


@dataclass
class TypeIgnore(BlocklyNode):
    """Type ignore comment"""

    lineno: int = 0
    tag: str = ""

    @classmethod
    def __def_blockly__(cls):
        return {
            "type": cls.__typename__(),
            "message0": "Type ignore line %1 tag %2",
            "args0": [
                {"type": "field_number", "name": "LINENO", "value": 0},
                {"type": "field_input", "name": "TAG", "text": ""},
            ],
            "output": None,
            "colour": 160,
        }

    def __json__(self):
        return {
            "type": self.__typename__(),
            "fields": {"LINENO": self.lineno, "TAG": self.tag},
        }

    def __ast__(self):
        return ast.TypeIgnore(lineno=self.lineno, tag=self.tag)


def _category(name, contents):
    return {
        "kind": "category",
        "name": name,
        "contents": [obj.__toolbox__() for obj in contents],
    }


STATEMENTS = set(
    [
        If,
        For,
        While,
        With,
        Match,
        Try,
        Raise,
        Assert,
        Return,
        Assign,
        AnnAssign,
        AugAssign,
        Delete,
        Pass,
        Break,
        Continue,
        Global,
        Nonlocal,
        Expr,
        FunctionDef,
        ClassDef,
        Import,
        ImportFrom,

        # AsyncFunctionDef,
        # AsyncFor,
        # AsyncWith,
    ]
)

PATTERN = set(
    [
        MatchValue,
        # MatchSingleton,
        # MatchSequence,
        # MatchMapping,
        # MatchClass,
        # # MatchStar,
        # MatchAs,
        # # MatchOr,
    ]
)

CONTROL_FLOW = set(
    [
        If,
        For,
        While,
        With,
        Match,
        Try,
        Raise,
        Assert,
        Return,
        AsyncFor,
        AsyncWith,
        Break,
        Continue,
    ]
)

EXPRESSIONS = set(
    [
        BoolOp,
        BinOp,
        UnaryOp,
        NamedExpr,
        Compare,
        Call,
        Attribute,
        Subscript,
        Slice,
        ListComp,
        SetComp,
        DictComp,
        GeneratorExp,
        Lambda,
        IfExp,
        Await,
        Yield,
        YieldFrom,
        Constant,
        FormattedValue,
        JoinedStr,
        List,
        Tuple,
        Set,
        Dict,
        Name,
        Starred,
    ]
)

OPERATORS = set(
    [
        BoolOp,
        BinOp,
        UnaryOp,
        Compare,
    ]
)

LITTERAL_NODES = set(
    [
        Constant,
        FormattedValue,
        JoinedStr,
        List,
        Tuple,
        Set,
        Dict,
    ]
)

COMPREHENSION = set(
    [
        ListComp,
        SetComp,
        DictComp,
        GeneratorExp,
        Comprehension,
    ]
)

IMPORT = set(
    [
        Import,
        ImportFrom,
        Alias,
    ]
)


TOOLBOX = {
    "kind": "categoryToolbox",
    "contents": [
        _category("Statements", STATEMENTS),
        _category("Expressions", EXPRESSIONS),
        _category("Patterns", PATTERN),
        # _category("Comprehension", COMPREHENSION),
        # _category("Literals", LITTERAL_NODES),
        # _category("Operators", OPERATORS),
        # _category("Patterns", PATTERN)
    ],
}


DEFINITIONS = [obj.__def_blockly__() for obj in (STATEMENTS.union(EXPRESSIONS))]
