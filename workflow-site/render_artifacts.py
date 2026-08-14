#!/usr/bin/env python3
"""Render workflow artifact Markdown files to static HTML pages.

This is intentionally small and dependency-free so the workflow site can be
rebuilt from a local file checkout without a package install or dev server.
It supports the Markdown shapes used by the workflow artifacts, not all
CommonMark edge cases.
"""

from __future__ import annotations

import html
import re
import shutil
import subprocess
from pathlib import Path


SITE_DIR = Path(__file__).resolve().parent
ARTIFACT_DIR = SITE_DIR / "artifacts"
DIAGRAM_DIR = ARTIFACT_DIR / "diagrams"
SKILL_COPY_DIR = SITE_DIR / "skills-copy"
WORKFLOW_MERMAID = (
    SITE_DIR.parent
    / "plugin-src"
    / "shared"
    / "resources"
    / "policy"
    / "WORKFLOW.mermaid"
)


def main() -> int:
    DIAGRAM_DIR.mkdir(exist_ok=True)
    for path in sorted(ARTIFACT_DIR.glob("*.md")):
        render_artifact(path)
    if WORKFLOW_MERMAID.exists():
        render_mermaid_artifact(
            WORKFLOW_MERMAID,
            ARTIFACT_DIR / "workflow-overview.html",
            "Workflow Overview",
        )
    for path in sorted(SKILL_COPY_DIR.glob("*/SKILL.md")):
        render_skill(path)
    return 0


def render_artifact(path: Path) -> None:
    markdown = path.read_text()
    title = first_heading(markdown) or path.stem
    body = render_markdown(markdown, skill_prefix="../skills-copy", artifact_stem=path.stem)
    pdf_link = ""
    if path.stem == "grillme-explainer" and (ARTIFACT_DIR / "grillme-explainer.pdf").exists():
        pdf_link = '<a class="button" href="grillme-explainer.pdf">Open PDF version</a>'
    target = path.with_suffix(".html")
    target.write_text(
        page(
            title,
            body,
            css_href="../site.css",
            action_link=pdf_link,
        )
    )


def render_mermaid_artifact(source: Path, target: Path, title: str) -> None:
    source_text = source.read_text()
    svg = render_mermaid_svg(source_text, "workflow-overview")
    body = mermaid_figure(svg, source_text, "Workflow overview diagram")
    target.write_text(
        page(
            title,
            f"<h1>{html.escape(title)}</h1>\n{body}",
            css_href="../site.css",
        )
    )


def render_skill(path: Path) -> None:
    markdown = path.read_text()
    skill_name = path.parent.name
    metadata, content = split_frontmatter(markdown)
    title = first_heading(content) or humanize_skill_name(metadata.get("name") or skill_name)
    description = metadata.get("description", "")
    content = strip_first_heading(content)
    content = inline_workflow_references(content)
    body = skill_intro(title, skill_name, description) + render_markdown(content, skill_prefix="..")
    target = path.with_name("SKILL.html")
    target.write_text(
        page(
            title,
            body,
            css_href="../../site.css",
        )
    )


def first_heading(markdown: str) -> str | None:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return None


def strip_first_heading(markdown: str) -> str:
    lines = markdown.splitlines()
    for index, line in enumerate(lines):
        if line.startswith("# "):
            return "\n".join(lines[:index] + lines[index + 1 :]).lstrip()
    return markdown


def split_frontmatter(markdown: str) -> tuple[dict[str, str], str]:
    lines = markdown.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, markdown

    end = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end = index
            break
    if end is None:
        return {}, markdown

    metadata: dict[str, str] = {}
    for line in lines[1:end]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip().strip('"').strip("'")
    return metadata, "\n".join(lines[end + 1 :]).lstrip()


def skill_intro(title: str, skill_name: str, description: str) -> str:
    skill_name_html = f'<p class="note">Skill name: <code>{html.escape(skill_name)}</code></p>'
    description_html = f"\n<p class=\"note\">{inline(description, skill_prefix='..')}</p>" if description else ""
    return f"<h1>{html.escape(title)}</h1>\n{skill_name_html}{description_html}\n<hr>\n"


def humanize_skill_name(name: str) -> str:
    return " ".join(part.capitalize() for part in name.split("-"))


def inline_workflow_references(markdown: str) -> str:
    lines = markdown.splitlines()
    output: list[str] = []
    references: list[Path] = []
    index = 0

    while index < len(lines):
        stripped = lines[index].strip()
        if stripped == "Read:":
            index += 1
            while index < len(lines):
                ref = workflow_markdown_reference(lines[index])
                if ref is not None:
                    references.append(ref)
                    index += 1
                    continue
                if not lines[index].strip():
                    index += 1
                    continue
                break
            continue

        if stripped == "Load and follow":
            index += 1
            while index < len(lines):
                ref = workflow_markdown_reference(lines[index])
                if ref is not None:
                    references.append(ref)
                    index += 1
                    continue
                if not lines[index].strip():
                    index += 1
                    continue
                break
            continue

        ref = workflow_markdown_reference(lines[index])
        if ref is not None and len(stripped) == len(lines[index].strip()):
            references.append(ref)
            index += 1
            continue

        output.append(lines[index])
        index += 1

    if references:
        output.append("")
        output.append("## Embedded Instructions")
        seen: set[Path] = set()
        for ref in references:
            if ref in seen or not ref.exists():
                continue
            seen.add(ref)
            embedded = ref.read_text()
            title = first_heading(embedded) or humanize_skill_name(ref.stem)
            output.append("")
            output.append(f"### {title}")
            body = strip_first_heading(embedded).strip()
            if body:
                output.append("")
                output.append(body)

    return "\n".join(output).strip()


def workflow_markdown_reference(line: str) -> Path | None:
    match = re.search(r"`(/Users/trent\.brown/agentic-development-workflow/[^`]+\.md)`", line)
    if not match:
        return None
    path = Path(match.group(1))
    try:
        relative = path.relative_to(SITE_DIR.parent)
    except ValueError:
        return None
    if path.exists():
        return path

    compatibility_roots = {
        "WORKFLOW.md": Path("plugin-src/shared/resources/policy/WORKFLOW.md"),
        "STANDARDS.md": Path("plugin-src/shared/resources/policy/STANDARDS.md"),
    }
    if str(relative) in compatibility_roots:
        return SITE_DIR.parent / compatibility_roots[str(relative)]
    if relative.parts and relative.parts[0] == "commands":
        return SITE_DIR.parent / "plugin-src/shared/resources" / relative
    return path


def render_markdown(
    markdown: str,
    skill_prefix: str = "../skills-copy",
    artifact_stem: str | None = None,
) -> str:
    lines = markdown.splitlines()
    blocks: list[str] = []
    paragraph: list[str] = []
    list_items: list[str] = []
    code_lines: list[str] = []
    in_code = False
    code_language = ""
    diagram_index = 0
    index = 0

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            text = " ".join(item.strip() for item in paragraph)
            blocks.append(f"<p>{inline(text, skill_prefix=skill_prefix)}</p>")
            paragraph = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            blocks.append(
                "<ul>\n"
                + "\n".join(f"<li>{inline(item, skill_prefix=skill_prefix)}</li>" for item in list_items)
                + "\n</ul>"
            )
            list_items = []

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if in_code:
            if stripped.startswith("```"):
                code_text = "\n".join(code_lines)
                if code_language == "mermaid" and artifact_stem:
                    diagram_index += 1
                    blocks.append(
                        mermaid_block(
                            code_text,
                            f"{artifact_stem}-{diagram_index}",
                            f"{artifact_stem} diagram {diagram_index}",
                        )
                    )
                else:
                    blocks.append("<pre><code>" + html.escape(code_text) + "</code></pre>")
                code_lines = []
                code_language = ""
                in_code = False
            else:
                code_lines.append(line)
            index += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            flush_list()
            in_code = True
            code_info = stripped[3:].strip().split(maxsplit=1)
            code_language = code_info[0].lower() if code_info else ""
            code_lines = []
            index += 1
            continue

        if not stripped:
            flush_paragraph()
            flush_list()
            index += 1
            continue

        if re.match(r"^[-*_]{3,}$", stripped):
            flush_paragraph()
            flush_list()
            blocks.append("<hr>")
            index += 1
            continue

        table_block = maybe_table(lines, index, skill_prefix)
        if table_block:
            flush_paragraph()
            flush_list()
            html_table, next_index = table_block
            blocks.append(html_table)
            index = next_index
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            flush_list()
            level = len(heading.group(1))
            blocks.append(f"<h{level}>{inline(heading.group(2), skill_prefix=skill_prefix)}</h{level}>")
            index += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            flush_list()
            blocks.append(f"<blockquote>{inline(stripped.lstrip('> ').strip(), skill_prefix=skill_prefix)}</blockquote>")
            index += 1
            continue

        bullet = re.match(r"^[-*]\s+(.+)$", stripped)
        if bullet:
            flush_paragraph()
            list_items.append(bullet.group(1))
            index += 1
            continue

        numbered = re.match(r"^\d+\.\s+(.+)$", stripped)
        if numbered:
            flush_paragraph()
            list_items.append(numbered.group(1))
            index += 1
            continue

        if list_items and (line.startswith(" ") or line.startswith("\t")):
            list_items[-1] = list_items[-1] + " " + stripped
            index += 1
            continue

        paragraph.append(line)
        index += 1

    flush_paragraph()
    flush_list()
    if in_code:
        code_text = "\n".join(code_lines)
        if code_language == "mermaid" and artifact_stem:
            diagram_index += 1
            blocks.append(
                mermaid_block(
                    code_text,
                    f"{artifact_stem}-{diagram_index}",
                    f"{artifact_stem} diagram {diagram_index}",
                )
            )
        else:
            blocks.append("<pre><code>" + html.escape(code_text) + "</code></pre>")
    return "\n".join(blocks)


def mermaid_block(source: str, name: str, alt: str) -> str:
    svg = render_mermaid_svg(source, name)
    return mermaid_figure(svg, source, alt)


def render_mermaid_svg(source: str, name: str) -> str:
    source_path = DIAGRAM_DIR / f"{name}.mmd"
    svg_path = DIAGRAM_DIR / f"{name}.svg"
    source_path.write_text(source)
    mmdc = mermaid_cli()
    subprocess.run(
        [
            mmdc,
            "--input",
            str(source_path),
            "--output",
            str(svg_path),
            "--backgroundColor",
            "transparent",
        ],
        cwd=SITE_DIR,
        check=True,
    )
    return f"diagrams/{svg_path.name}"


def mermaid_cli() -> str:
    local = SITE_DIR / "node_modules" / ".bin" / "mmdc"
    if local.exists():
        return str(local)
    found = shutil.which("mmdc")
    if found:
        return found
    raise RuntimeError(
        "Mermaid CLI not found. Run `npm install` in workflow-site before rendering artifacts."
    )


def mermaid_figure(svg_href: str, source: str, alt: str) -> str:
    return (
        '<figure class="mermaid-figure">'
        f'<img src="{html.escape(svg_href, quote=True)}" alt="{html.escape(alt, quote=True)}">'
        '<details class="mermaid-source">'
        "<summary>Mermaid source</summary>"
        "<pre><code>"
        + html.escape(source)
        + "</code></pre>"
        "</details>"
        "</figure>"
    )


def maybe_table(lines: list[str], index: int, skill_prefix: str) -> tuple[str, int] | None:
    if index + 1 >= len(lines):
        return None
    header = lines[index].strip()
    separator = lines[index + 1].strip()
    if "|" not in header or not re.match(r"^\|?[\s:-]+\|[\s|:-]+$", separator):
        return None

    headers = split_table_row(header)
    rows: list[list[str]] = []
    cursor = index + 2
    while cursor < len(lines) and "|" in lines[cursor].strip() and lines[cursor].strip():
        rows.append(split_table_row(lines[cursor].strip()))
        cursor += 1

    thead = (
        "<thead><tr>"
        + "".join(f"<th>{inline(cell, skill_prefix=skill_prefix)}</th>" for cell in headers)
        + "</tr></thead>"
    )
    tbody_rows = []
    for row in rows:
        padded = row + [""] * (len(headers) - len(row))
        tbody_rows.append(
            "<tr>"
            + "".join(f"<td>{inline(cell, skill_prefix=skill_prefix)}</td>" for cell in padded[: len(headers)])
            + "</tr>"
        )
    tbody = "<tbody>\n" + "\n".join(tbody_rows) + "\n</tbody>"
    return "<table>\n" + thead + "\n" + tbody + "\n</table>", cursor


def split_table_row(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def inline(text: str, skill_prefix: str = "../skills-copy") -> str:
    code_segments: list[str] = []

    def stash_code(match: re.Match[str]) -> str:
        code_segments.append(code_html(match.group(1), skill_prefix))
        return f"__CODE_PLACEHOLDER_{len(code_segments) - 1}__"

    protected = re.sub(r"`([^`]+)`", stash_code, text)
    escaped = html.escape(protected)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", escaped)
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: link_replacement(match, skill_prefix),
        escaped,
    )
    for index, code in enumerate(code_segments):
        escaped = escaped.replace(f"__CODE_PLACEHOLDER_{index}__", code)
    return escaped


def code_html(value: str, skill_prefix: str) -> str:
    if skill_exists(value):
        href = f"{skill_prefix}/{value}/SKILL.html"
        return f'<a href="{html.escape(href, quote=True)}"><code>{html.escape(value)}</code></a>'
    return f"<code>{html.escape(value)}</code>"


def skill_exists(name: str) -> bool:
    return bool(re.match(r"^[a-z0-9-]+$", name)) and (SKILL_COPY_DIR / name / "SKILL.md").exists()


def link_replacement(match: re.Match[str], skill_prefix: str) -> str:
    label = match.group(1)
    href = html.unescape(match.group(2))
    if href == "WORKFLOW.mermaid":
        href = "../../artifacts/workflow-overview.html" if skill_prefix == ".." else "workflow-overview.html"
    if href.endswith(".md") and "/" not in href:
        href = href[:-3] + ".html"
    return f'<a href="{html.escape(href, quote=True)}">{label}</a>'


def page(
    title: str,
    body: str,
    css_href: str,
    action_link: str = "",
) -> str:
    actions = ""
    if action_link:
        actions = f"""  <nav class="artifact-actions" aria-label="Artifact actions">
    {action_link}
  </nav>
"""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <link rel="stylesheet" href="{html.escape(css_href, quote=True)}">
</head>
<body>
<main class="artifact-page">
{actions}  <article class="markdown-body">
{body}
  </article>
</main>
</body>
</html>
"""


if __name__ == "__main__":
    raise SystemExit(main())
