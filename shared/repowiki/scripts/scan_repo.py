#!/usr/bin/env python3
"""Inventory a repository so the wiki can be planned from facts, not guesses.

Usage:
    python scan_repo.py <repo> [--json out.json] [--depth 2]

Prints a compact markdown summary to stdout. With --json, also writes the full
machine-readable inventory. Respects .gitignore when the repo is a git checkout.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wikilib as wl  # noqa: E402

MANIFESTS = {
    "package.json": "Node/JS", "pyproject.toml": "Python", "setup.py": "Python", "setup.cfg": "Python",
    "requirements.txt": "Python", "Pipfile": "Python", "go.mod": "Go", "Cargo.toml": "Rust",
    "pom.xml": "Java/Maven", "build.gradle": "Gradle", "build.gradle.kts": "Gradle",
    "Gemfile": "Ruby", "composer.json": "PHP", "mix.exs": "Elixir", "pubspec.yaml": "Dart/Flutter",
    "Package.swift": "Swift", "CMakeLists.txt": "CMake", "Makefile": "Make", "deno.json": "Deno",
    "tsconfig.json": "TypeScript", "turbo.json": "Turborepo", "nx.json": "Nx", "pnpm-workspace.yaml": "pnpm workspaces",
    "lerna.json": "Lerna", "go.work": "Go workspace",
}
ENTRY_NAMES = {
    "main.py", "__main__.py", "app.py", "wsgi.py", "asgi.py", "manage.py", "cli.py", "server.py", "run.py",
    "index.js", "index.ts", "main.js", "main.ts", "server.js", "server.ts", "app.js", "app.ts", "cli.js", "cli.ts",
    "main.go", "main.rs", "lib.rs", "Main.java", "Application.java", "Program.cs", "main.c", "main.cpp",
    "main.rb", "config.ru", "main.dart", "main.swift",
}
CI_PATTERNS = [".github/workflows/*", ".gitlab-ci.yml", "Jenkinsfile", ".circleci/*", "azure-pipelines.yml", ".travis.yml", "bitbucket-pipelines.yml"]
DOC_EXTS = {".md", ".rst", ".txt", ".adoc", ".mdx"}
DOC_DIRS = {"docs", "doc", "documentation", "wiki"}
SOFT_MANIFESTS = {"Makefile", "CMakeLists.txt", "tsconfig.json"}  # only meaningful at the repo root
INFRA_PATTERNS = ["Dockerfile*", "docker-compose*", "*.tf", "k8s/*", "kubernetes/*", "helm/*", "charts/*", ".env.example", ".env.sample", "Procfile", "serverless.yml", "fly.toml", "vercel.json", "netlify.toml"]
WORKSPACE_DIRS = {"packages", "apps", "services", "libs", "crates", "modules", "plugins", "projects", "cmd", "internal", "pkg"}


def count_lines(path: Path) -> int:
    try:
        if path.stat().st_size > 2_000_000:
            return 0
        data = path.read_bytes()
    except OSError:
        return 0
    if b"\0" in data[:1024]:
        return 0
    return data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0)


def match_any(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(path, p) or fnmatch.fnmatch(Path(path).name, p) for p in patterns)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repo")
    ap.add_argument("--json", help="write full inventory to this path")
    ap.add_argument("--depth", type=int, default=2, help="directory depth for the module table (default 2)")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 2

    files = wl.list_repo_files(repo)
    lang_files: Counter = Counter()
    lang_loc: Counter = Counter()
    file_loc: dict[str, int] = {}
    dir_stats: dict[str, dict] = defaultdict(lambda: {"files": 0, "loc": 0, "langs": Counter()})
    manifests, entries, tests, ci, docs, infra, generated = [], [], [], [], [], [], []

    for f in files:
        p = Path(f)
        if p.suffix.lower() in wl.BINARY_EXT:
            continue
        if p.name in MANIFESTS and (p.name not in SOFT_MANIFESTS or len(p.parts) == 1):
            manifests.append({"path": f, "kind": MANIFESTS[p.name]})
        if p.name in ENTRY_NAMES:
            entries.append(f)
        if match_any(f, CI_PATTERNS):
            ci.append(f)
        if match_any(f, INFRA_PATTERNS):
            infra.append(f)
        if p.suffix.lower() in DOC_EXTS and p.parts[0] != ".github" and (len(p.parts) == 1 or p.parts[0].lower() in DOC_DIRS):
            docs.append(f)
        if wl.is_generated(f):
            generated.append(f)
            continue
        lang = wl.language_of(f)
        if not lang:
            continue
        if wl.is_test(f):
            tests.append(f)
        loc = count_lines(repo / f)
        file_loc[f] = loc
        lang_files[lang] += 1
        lang_loc[lang] += loc
        parts = p.parts[:-1]
        for d in range(1, min(args.depth, len(parts)) + 1):
            key = "/".join(parts[:d])
            s = dir_stats[key]
            s["files"] += 1
            s["loc"] += loc
            s["langs"][lang] += 1
        if not parts:
            s = dir_stats["."]
            s["files"] += 1
            s["loc"] += loc
            s["langs"][lang] += 1

    source_files = [f for f in files if wl.is_source(f)]
    n_src = len(source_files)
    size_class = "small" if n_src < 50 else "medium" if n_src <= 500 else "large"

    top_dirs = sorted(dir_stats.items(), key=lambda kv: (-kv[1]["loc"], kv[0]))
    workspace_roots = sorted({p.parts[0] for m in manifests if (p := Path(m["path"])) and len(p.parts) > 2 and p.parts[0] in WORKSPACE_DIRS})
    nested_manifests = [m for m in manifests if len(Path(m["path"]).parts) > 1 and Path(m["path"]).name not in {"tsconfig.json", "Makefile", "CMakeLists.txt"}]
    monorepo = bool(workspace_roots) or len(nested_manifests) >= 3 or any(
        Path(m["path"]).name in {"pnpm-workspace.yaml", "lerna.json", "turbo.json", "nx.json", "go.work"} for m in manifests
    )

    git_info = {}
    if wl.is_git_repo(repo):
        git_info = {
            "head": wl.head_commit(repo),
            "branch": (wl.git(repo, "rev-parse", "--abbrev-ref", "HEAD") or "").strip(),
            "remote": (wl.git(repo, "config", "--get", "remote.origin.url") or "").strip(),
            "last_commit_date": (wl.git(repo, "log", "-1", "--format=%cI") or "").strip(),
            "dirty": bool((wl.git(repo, "status", "--porcelain") or "").strip()),
        }

    largest = sorted(((f, n) for f, n in file_loc.items() if wl.is_source(f)), key=lambda kv: -kv[1])[:15]
    inventory = {
        "repo": str(repo), "name": repo.name, "git": git_info, "size_class": size_class,
        "source_files": n_src, "total_files": len(files), "monorepo": monorepo,
        "workspace_roots": workspace_roots,
        "languages": {l: {"files": lang_files[l], "loc": lang_loc[l]} for l, _ in lang_loc.most_common()},
        "manifests": manifests, "entry_point_candidates": entries,
        "ci": ci, "infra": infra, "docs": docs[:40], "test_files": len(tests), "generated_or_lock_files": len(generated),
        "directories": {k: {"files": v["files"], "loc": v["loc"], "langs": dict(v["langs"].most_common(3))} for k, v in top_dirs},
        "largest_files": [{"path": p, "loc": n} for p, n in largest],
    }
    if args.json:
        Path(args.json).write_text(json.dumps(inventory, indent=2))

    out = [f"# Scan: {repo.name}", ""]
    if git_info:
        out.append(f"- Git: HEAD `{git_info['head']}` on `{git_info['branch']}`" + (" (uncommitted changes present)" if git_info["dirty"] else "")
                   + (f", remote {git_info['remote']}" if git_info["remote"] else ""))
    else:
        out.append("- Git: not a git checkout (update mode will fall back to file mtimes)")
    out.append(f"- Size: **{size_class}** ({n_src} source files, {len(files)} files total, {len(tests)} test files, {len(generated)} generated/lock files skipped)")
    out.append(f"- Monorepo signals: {'yes' if monorepo else 'no'}" + (f" (workspace roots: {', '.join(workspace_roots)})" if workspace_roots else ""))
    out += ["", "## Languages", "", "| Language | Files | LOC |", "|---|---:|---:|"]
    out += [f"| {l} | {v['files']} | {v['loc']:,} |" for l, v in list(inventory["languages"].items())[:10]]
    out += ["", f"## Directories (depth {args.depth}, by LOC)", "", "| Path | Files | LOC | Main languages |", "|---|---:|---:|---|"]
    out += [f"| `{k}` | {v['files']} | {v['loc']:,} | {', '.join(v['langs'])} |" for k, v in list(inventory["directories"].items())[:30]]
    if len(top_dirs) > 30:
        out.append(f"| … | | | {len(top_dirs) - 30} more directories in the JSON output |")

    def section(title: str, items: list, limit: int = 15, fmt=lambda x: f"`{x}`"):
        if items:
            out.extend(["", f"## {title}", ""] + [f"- {fmt(i)}" for i in items[:limit]])
            if len(items) > limit:
                out.append(f"- … and {len(items) - limit} more")

    section("Manifests", manifests, 25, lambda m: f"`{m['path']}` ({m['kind']})")
    section("Entry-point candidates", entries)
    section("CI", ci, 10)
    section("Infra / deployment", infra, 10)
    section("Existing docs", docs, 15)
    section("Largest source files", largest, 10, lambda kv: f"`{kv[0]}` ({kv[1]:,} lines)")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
