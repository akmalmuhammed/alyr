"""A small JSON Schema checker for tool arguments (spec 067).

Only what ALYR's own tool schemas use: type, properties, required, additionalProperties, enum,
minLength, maxLength, minimum, maximum, items, minItems, maxItems, pattern. No `$ref` is ever
followed (the specification forbids fetching one). No new dependency: our schemas are small and
written by us, and an unknown keyword is an error here so a schema cannot silently stop checking.
"""

import re

KNOWN = {
    "type", "properties", "required", "additionalProperties", "enum", "minLength", "maxLength",
    "minimum", "maximum", "items", "minItems", "maxItems", "pattern", "description", "title",
    "default", "$schema",
}
_TYPES = {
    "object": dict, "array": list, "string": str, "boolean": bool,
}


def check_schema(schema: dict, where: str = "schema") -> None:
    """Raise ValueError when a tool's own schema uses something this checker does not know."""
    unknown = set(schema) - KNOWN
    if unknown:
        raise ValueError(f"{where}: unsupported keyword {sorted(unknown)}")
    for name, sub in (schema.get("properties") or {}).items():
        check_schema(sub, f"{where}.{name}")
    if isinstance(schema.get("items"), dict):
        check_schema(schema["items"], f"{where}[]")


def problems(value, schema: dict, path: str = "arguments") -> list[str]:
    """Every way `value` does not fit `schema`, as short sentences naming where."""
    kind = schema.get("type")
    if kind == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            return [f"{path} must be a whole number"]
    elif kind == "number":
        if isinstance(value, bool) or not isinstance(value, int | float):
            return [f"{path} must be a number"]
    elif kind in _TYPES and (
        not isinstance(value, _TYPES[kind]) or (kind != "boolean" and isinstance(value, bool))
    ):
        return [f"{path} must be {'an' if kind in ('object', 'array') else 'a'} {kind}"]
    found: list[str] = []
    if "enum" in schema and value not in schema["enum"]:
        found.append(f"{path} must be one of {', '.join(map(str, schema['enum']))}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            found.append(f"{path} is too short")
        if len(value) > schema.get("maxLength", 10**9):
            found.append(f"{path} is too long")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            found.append(f"{path} is not in the expected form")
    if isinstance(value, int | float) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            found.append(f"{path} must be at least {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            found.append(f"{path} must be at most {schema['maximum']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            found.append(f"{path} has too few items")
        if len(value) > schema.get("maxItems", 10**9):
            found.append(f"{path} has too many items")
        if isinstance(schema.get("items"), dict):
            for i, item in enumerate(value):
                found += problems(item, schema["items"], f"{path}[{i}]")
    if isinstance(value, dict):
        props = schema.get("properties") or {}
        for name in schema.get("required") or []:
            if name not in value:
                found.append(f"{path}.{name} is required")
        for name, item in value.items():
            if name in props:
                found += problems(item, props[name], f"{path}.{name}")
            elif schema.get("additionalProperties") is False:
                found.append(f"{path}.{name} is not a known argument")
    return found
