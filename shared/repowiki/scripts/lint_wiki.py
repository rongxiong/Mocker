#!/usr/bin/env python3
"""Validate a generated wiki against the repository it documents.

Usage:
    python lint_wiki.py <wiki_dir> --repo <repo_dir> [--strict] [--min-coverage 0.6] [--json]

Errors (exit 1): missing title/index, broken page links, citations to files or
lines that don't exist, `sources` entries that match nothing, unbalanced code
fences, unknown Mermaid diagram types.
Warnings: missing anchors, orphan pages, placeholders, suspicious Mermaid
labels, missing `sources`/`commit`, low source coverage. --strict makes warnings fail too.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wikilib as wl  # noqa: E402

MERMAID_TYPES = (
    "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2",
    "erDiagram", "journey", "gantt", "pie", "gitGraph", "mindmap", "timeline", "quadrantChart",
    "requirementDiagram", "C4Context", "C4Container", "C4Component", "sankey-beta", "xychart-beta",
    "block-beta", "architecture-beta", "packet-beta",
)
LINK_RE = re.compile(r"(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
FENCE_RE = re.compile(r"^(\s*)(```+|~~~+)\s*([\w+-]*)")
PLACEHOLDER_RE = re.compile(r"\b(TODO|TBD|FIXME|lorem ipsum|XXX)\b|\{\{[^}]*\}\}|\[(?:insert|describe|fill)[^\]]*\]", re.I)
NO_SOURCES_OK = {"index", "glossary", "overview"}  # pages that may legitimately synthesise rather than cite code


class Report:
    def __init__(self):
        self.items: list[dict] = []

    def add(self, level: str, page: str, line: int | None, msg: str):
        self.items.append({"level": level, "page": page, "line": line, "message": msg})

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i["level"] == level)


def headings_of(body: str) -> set[str]:
    slugs, seen = set(), {}
    in_fence = False
    for line in body.splitlines():
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        m = None if in_fence else re.match(r"^#{1,6}\s+(.*?)\s*#*\s*$", line)
        if m:
            s = wl.slugify(m.group(1))
            n = seen.get(s, 0)
            seen[s] = n + 1
            slugs.add(s if n == 0 else f"{s}-{n}")
    return slugs


def check_mermaid(block: list[str], start_line: int, page: str, rep: Report):
    lines = [l for l in block if l.strip() and not l.strip().startswith("%%")]
    if not lines:
        rep.add("error", page, start_line, "empty mermaid block")
        return
    first = lines[0].strip()
    kind = first.split()[0] if first else ""
    if not any(kind == t or kind.startswith(t) for t in MERMAID_TYPES):
        rep.add("error", page, start_line, f"unknown mermaid diagram type '{kind}'")
        return
    if kind in ("flowchart", "graph"):
        for off, l in enumerate(block, start=1):
            # Unquoted node labels containing ()/:/quotes break Mermaid's parser. Quote them: A["label (x)"]
            for m in re.finditer(r"\b[\w-]+\[([^\]\"]+)\]", l):
                if re.search(r"[(){}:;\"']", m.group(1)):
                    rep.add("warning", page, start_line + off, f"flowchart label '{m.group(1)}' has special characters; wrap it in double quotes")
                    break


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wiki")
    ap.add_argument("--repo", default=".", help="repository the wiki documents (default: .)")
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
    ap.add_argument("--min-coverage", type=float, default=None, help="fail if fraction of source files covered is below this (0-1)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    ap.add_argument("--pages", default=None, help="with --show-cited, only print pages whose path contains this text")
    ap.add_argument("--show-cited", action="store_true",
                    help="print the first and last cited line next to every citation, for verifying claims against code")
    args = ap.parse_args()

    wiki, repo = Path(args.wiki).resolve(), Path(args.repo).resolve()
    if not wiki.is_dir() or not repo.is_dir():
        print("error: wiki and repo must both be directories", file=sys.stderr)
        return 2

    rep = Report()
    pages = wl.wiki_pages(wiki)
    if not pages:
        print(f"error: no markdown pages found in {wiki}", file=sys.stderr)
        return 2
    rel = {p: p.relative_to(wiki).as_posix() for p in pages}
    by_rel = {r: p for p, r in rel.items()}
    repo_files = wl.list_repo_files(repo)
    repo_file_set = set(repo_files)

    def nlines(path: str) -> int:
        return len(lines_of(path))

    file_lines: dict[str, list[str]] = {}
    excerpts: list[tuple[str, int, str, str, str]] = []

    def lines_of(path: str) -> list[str]:
        if path not in file_lines:
            try:
                file_lines[path] = (repo / path).read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                file_lines[path] = []
        return file_lines[path]

    if "index.md" not in by_rel:
        rep.add("error", "(wiki)", None, "missing index.md at the wiki root")

    covered: set[str] = set()
    links_out: dict[str, set[str]] = {r: set() for r in by_rel}
    anchors = {}
    parsed = {}

    for p in pages:
        r = rel[p]
        text = p.read_text(encoding="utf-8", errors="replace")
        meta, body, off = wl.parse_frontmatter(text)
        parsed[r] = (meta, body, off)
        anchors[r] = headings_of(body)

        if not meta.get("title"):
            rep.add("error", r, 1, "frontmatter is missing `title`")
        stem = Path(r).stem
        sources = wl.as_list(meta.get("sources"))
        if not sources and stem not in NO_SOURCES_OK:
            rep.add("warning", r, 1, "frontmatter has no `sources`; update mode can't tell when this page goes stale")
        if not meta.get("commit") and wl.is_git_repo(repo):
            rep.add("warning", r, 1, "frontmatter has no `commit`; update mode will treat this page as always stale")
        for s in sources:
            hits = [f for f in repo_files if wl.source_matches(s, f)]
            if not hits and not (repo / s.rstrip("/")).exists():
                rep.add("error", r, 1, f"`sources` entry '{s}' matches nothing in the repo")
            covered.update(hits)

        in_fence, fence_marker, mer_start, mer_buf = False, "", 0, []
        for i, line in enumerate(body.splitlines(), start=1 + off):
            fm = FENCE_RE.match(line)
            if fm:
                if not in_fence:
                    in_fence, fence_marker = True, fm.group(2)[:3]
                    if fm.group(3) == "mermaid":
                        mer_start, mer_buf = i, []
                    else:
                        mer_start = 0
                elif line.strip().startswith(fence_marker):
                    if mer_start:
                        check_mermaid(mer_buf, mer_start, r, rep)
                    in_fence, mer_start = False, 0
                continue
            if in_fence:
                if mer_start:
                    mer_buf.append(line)
                continue

            for m in wl.CITATION_RE.finditer(line):
                path, a, b = m.group(1), int(m.group(2)), int(m.group(3) or m.group(2))
                if path not in repo_file_set and not (repo / path).is_file():
                    if not wl.looks_like_file(path):
                        continue  # e.g. `example.com:443` or `127.0.0.1:8080`, not a file citation
                    rep.add("error", r, i, f"citation {m.group(0)} points to a file that does not exist")
                    continue
                covered.add(path)
                if a > b:
                    rep.add("error", r, i, f"citation `{path}:{a}-{b}` has start after end")
                elif b > nlines(path):
                    rep.add("error", r, i, f"citation `{path}:{a}-{b}` is past the end of the file ({nlines(path)} lines)")
                else:
                    fl = lines_of(path)
                    first, last = (fl[a - 1] if a <= len(fl) else ""), (fl[b - 1] if b <= len(fl) else "")
                    if not first.strip() or not last.strip():
                        edge = "starts" if not first.strip() else "ends"
                        rep.add("warning", r, i, f"citation `{path}:{a}" + (f"-{b}" if b != a else "") + f"` {edge} on a blank line; line numbers are probably off")
                    excerpts.append((r, i, f"{path}:{a}" + (f"-{b}" if b != a else ""), first.strip(), last.strip()))

            for m in LINK_RE.finditer(line):
                target = m.group(1)
                if re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I) or target.startswith("//"):
                    continue  # external
                path_part, _, frag = target.partition("#")
                if not path_part:
                    if frag and wl.slugify(unquote(frag)) not in anchors[r] and unquote(frag) not in anchors[r]:
                        rep.add("warning", r, i, f"anchor '#{frag}' not found on this page")
                    continue
                dest = (p.parent / unquote(path_part)).resolve()
                try:
                    dest_rel = dest.relative_to(wiki).as_posix()
                except ValueError:
                    # A link out of the wiki into the repo is fine if the file exists.
                    if not dest.exists():
                        rep.add("error", r, i, f"link '{target}' points outside the wiki to something that does not exist")
                    continue
                if dest_rel in by_rel:
                    links_out[r].add(dest_rel)
                    if frag:
                        slugs = anchors.get(dest_rel) or (headings_of(by_rel[dest_rel].read_text(encoding="utf-8", errors="replace")))
                        if unquote(frag).lower() not in slugs:
                            rep.add("warning", r, i, f"anchor '#{frag}' not found in {dest_rel}")
                elif not dest.exists():
                    rep.add("error", r, i, f"broken link '{target}'")

            if PLACEHOLDER_RE.search(line):
                rep.add("warning", r, i, f"placeholder text: '{PLACEHOLDER_RE.search(line).group(0)}'")

        if in_fence:
            rep.add("error", r, None, "unclosed code fence")

    # Orphans: every page should be reachable from index.md
    if "index.md" in by_rel:
        seen, stack = {"index.md"}, ["index.md"]
        while stack:
            for nxt in links_out.get(stack.pop(), ()):
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        for r in by_rel:
            if r not in seen:
                rep.add("warning", r, None, "orphan page: not reachable from index.md")

    # Coverage
    src = [f for f in repo_files if wl.is_source(f)]
    uncovered = [f for f in src if f not in covered]
    cov = (len(src) - len(uncovered)) / len(src) if src else 1.0
    unc_dirs: dict[str, int] = {}
    for f in uncovered:
        parts = Path(f).parts
        key = "/".join(parts[:2]) if len(parts) > 2 else "/".join(parts[:-1]) or "."
        unc_dirs[key] = unc_dirs.get(key, 0) + 1
    if args.min_coverage is not None and cov < args.min_coverage:
        rep.add("error", "(wiki)", None, f"source coverage {cov:.0%} is below the required {args.min_coverage:.0%}")

    if args.json:
        print(json.dumps({"errors": rep.count("error"), "warnings": rep.count("warning"), "coverage": round(cov, 3),
                          "uncovered_dirs": unc_dirs, "items": rep.items}, indent=2))
    else:
        for it in sorted(rep.items, key=lambda x: (x["level"] != "error", x["page"], x["line"] or 0)):
            loc = f"{it['page']}:{it['line']}" if it["line"] else it["page"]
            print(f"{it['level'].upper():7} {loc}  {it['message']}")
        if args.show_cited:
            print("\nCITED LINES (verify each claim against the code it cites):")
            cur = None
            for pg, ln, cite, first, last in excerpts:
                if args.pages and args.pages not in pg:
                    continue
                if pg != cur:
                    print(f"\n[{pg}]")
                    cur = pg
                tail = f"  …  {last[:60]}" if last and last != first else ""
                print(f"  L{ln:<4} {cite:<46} | {first[:70]}{tail}")
        print(f"\n{len(pages)} pages checked: {rep.count('error')} errors, {rep.count('warning')} warnings. "
              f"Source coverage: {cov:.0%} ({len(src) - len(uncovered)}/{len(src)} files cited or listed in `sources`).")
        if unc_dirs:
            top = sorted(unc_dirs.items(), key=lambda kv: -kv[1])[:8]
            print("Largest uncovered areas: " + ", ".join(f"{k} ({n})" for k, n in top))

    failed = rep.count("error") > 0 or (args.strict and rep.count("warning") > 0)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
