"""Deterministic YAML-subset reader and writer for pattern-review files.

Supports the structured pattern-review files: dictionaries, lists, nested
blocks, strings, booleans, nulls, numbers, and inline string lists. PyYAML may
parse inputs outside that subset, but canonical output never depends on whether
the optional package happens to be installed.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def load_yaml(path: str | Path) -> Any:
    text = Path(path).read_text()
    if not text.strip():
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        try:
            lines = _clean_lines(text)
            if not lines:
                return {}
            value, index = _parse_block(lines, 0, lines[0][0])
            if index != len(lines):
                raise ValueError(f"Could not parse YAML near line {index + 1}")
            return value
        except (ValueError, IndexError):
            try:
                import yaml  # type: ignore

                loaded = yaml.safe_load(text)
                return {} if loaded is None else loaded
            except ImportError:
                raise


def dump_yaml(value: Any) -> str:
    return _dump_value(value, 0).rstrip() + "\n"


def write_yaml(path: str | Path, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(dump_yaml(value))
    tmp.replace(target)


def _clean_lines(text: str) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        line = _strip_comment(raw.rstrip())
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        result.append((indent, line.strip()))
    return result


def _strip_comment(line: str) -> str:
    quote: str | None = None
    escaped = False
    for index, char in enumerate(line):
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char in ("'", '"'):
            quote = None if quote == char else char if quote is None else quote
            continue
        if char == "#" and quote is None and (index == 0 or line[index - 1].isspace()):
            return line[:index].rstrip()
    return line


def _parse_block(lines: list[tuple[int, str]], index: int, indent: int) -> tuple[Any, int]:
    if index >= len(lines):
        return {}, index
    current_indent, content = lines[index]
    if current_indent < indent:
        return {}, index
    if content.startswith("- "):
        return _parse_list(lines, index, current_indent)
    return _parse_map(lines, index, current_indent)


def _parse_list(lines: list[tuple[int, str]], index: int, indent: int) -> tuple[list[Any], int]:
    items: list[Any] = []
    while index < len(lines):
        current_indent, content = lines[index]
        if current_indent != indent or not content.startswith("- "):
            break
        item = content[2:].strip()
        index += 1
        if not item:
            value, index = _parse_block(lines, index, indent + 2)
            items.append(value)
            continue
        if _looks_like_pair(item):
            key, raw_value = _split_pair(item)
            obj: dict[str, Any] = {key: _parse_scalar(raw_value)}
            if raw_value == "" and index < len(lines) and lines[index][0] > indent:
                obj[key], index = _parse_block(lines, index, indent + 2)
            if index < len(lines) and lines[index][0] > indent:
                extra, index = _parse_map(lines, index, indent + 2)
                obj.update(extra)
            items.append(obj)
            continue
        items.append(_parse_scalar(item))
    return items, index


def _parse_map(lines: list[tuple[int, str]], index: int, indent: int) -> tuple[dict[str, Any], int]:
    result: dict[str, Any] = {}
    while index < len(lines):
        current_indent, content = lines[index]
        if current_indent < indent or content.startswith("- "):
            break
        if current_indent != indent:
            break
        if not _looks_like_pair(content):
            raise ValueError(f"Expected key/value pair: {content}")
        key, raw_value = _split_pair(content)
        index += 1
        if raw_value == "":
            if index < len(lines) and lines[index][0] > indent:
                value, index = _parse_block(lines, index, lines[index][0])
            else:
                value = {}
        else:
            value = _parse_scalar(raw_value)
        result[key] = value
    return result, index


def _looks_like_pair(text: str) -> bool:
    return bool(re.match(r"^[A-Za-z0-9_.-]+:\s*", text))


def _split_pair(text: str) -> tuple[str, str]:
    key, value = text.split(":", 1)
    return key.strip(), value.strip()


def _parse_scalar(raw: str) -> Any:
    if raw == "":
        return ""
    if raw in ("null", "Null", "NULL", "~"):
        return None
    if raw in ("true", "True", "TRUE"):
        return True
    if raw in ("false", "False", "FALSE"):
        return False
    if raw.startswith('"') and raw.endswith('"'):
        return json.loads(raw)
    if raw.startswith("'") and raw.endswith("'"):
        return raw[1:-1]
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        if not inner:
            return []
        return [_parse_scalar(part.strip()) for part in inner.split(",")]
    if re.match(r"^-?\d+$", raw):
        return int(raw)
    return raw


def _dump_value(value: Any, indent: int) -> str:
    prefix = " " * indent
    if isinstance(value, dict):
        if not value:
            return f"{prefix}{{}}"
        lines = []
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}{key}:")
                lines.append(_dump_value(item, indent + 2))
            else:
                lines.append(f"{prefix}{key}: {_format_scalar(item)}")
        return "\n".join(lines)
    if isinstance(value, list):
        if not value:
            return f"{prefix}[]"
        lines = []
        for item in value:
            if isinstance(item, dict):
                if not item:
                    lines.append(f"{prefix}- {{}}")
                    continue
                keys = list(item.keys())
                first = keys[0]
                first_value = item[first]
                if isinstance(first_value, (dict, list)):
                    lines.append(f"{prefix}- {first}:")
                    lines.append(_dump_value(first_value, indent + 4))
                else:
                    lines.append(f"{prefix}- {first}: {_format_scalar(first_value)}")
                for key in keys[1:]:
                    val = item[key]
                    if isinstance(val, (dict, list)):
                        lines.append(f"{prefix}  {key}:")
                        lines.append(_dump_value(val, indent + 4))
                    else:
                        lines.append(f"{prefix}  {key}: {_format_scalar(val)}")
            elif isinstance(item, list):
                lines.append(f"{prefix}-")
                lines.append(_dump_value(item, indent + 2))
            else:
                lines.append(f"{prefix}- {_format_scalar(item)}")
        return "\n".join(lines)
    return f"{prefix}{_format_scalar(value)}"


def _format_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(str(value))
