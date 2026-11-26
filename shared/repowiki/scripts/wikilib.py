"""Shared helpers for the repowiki scripts. Standard library only."""
from __future__ import annotations

import fnmatch
import os
import re
import signal
import subprocess
import sys
from pathlib import Path

# Legacy consoles (e.g. cp1252 on Windows) crash on non-ASCII source lines and paths; never let output fail.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

try:  # let `script | head` exit quietly instead of raising BrokenPipeError
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
except (AttributeError, ValueError):  # no SIGPIPE on Windows / not in main thread
    pass

IGNORE_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "bower_components", "vendor", "venv", ".venv",
    "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", ".nox",
    "dist", "build", "target", "out", ".next", ".nuxt", ".svelte-kit", ".gradle", ".idea",
    ".vscode", ".terraform", "coverage", ".cache", ".parcel-cache", "Pods", "DerivedData",
    "site-packages", ".eggs", "htmlcov",
}

# Agent/IDE customization folders are tooling about the repo, not part of the code being documented
# (a skill installed at .github/skills/repowiki must not count its own scripts as project source).
AGENT_PREFIXES = (
    ".github/skills/", ".github/agents/", ".github/prompts/", ".github/instructions/",
    ".claude/", ".agents/", ".copilot/", ".cursor/", ".vscode/",
)

LANG_BY_EXT = {
    ".py": "Python", ".pyi": "Python", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
    ".cjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript", ".go": "Go", ".rs": "Rust",
    ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin", ".scala": "Scala", ".rb": "Ruby",
    ".php": "PHP", ".cs": "C#", ".fs": "F#", ".swift": "Swift", ".m": "Objective-C",
    ".c": "C", ".h": "C/C++ header", ".cc": "C++", ".cpp": "C++", ".cxx": "C++", ".hpp": "C++",
    ".dart": "Dart", ".lua": "Lua", ".r": "R", ".jl": "Julia", ".ex": "Elixir", ".exs": "Elixir",
    ".erl": "Erlang", ".hs": "Haskell", ".clj": "Clojure", ".sh": "Shell", ".bash": "Shell",
    ".zsh": "Shell", ".ps1": "PowerShell", ".sql": "SQL", ".proto": "Protobuf", ".graphql": "GraphQL",
    ".sol": "Solidity", ".vue": "Vue", ".svelte": "Svelte", ".tf": "Terraform",
    ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".less": "Less",
}
# Languages that do not count as "source code" for coverage purposes.
NON_SOURCE_LANGS = {"HTML", "CSS", "SCSS", "Less"}

BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svgz", ".pdf", ".zip", ".gz", ".tar",
    ".tgz", ".bz2", ".xz", ".7z", ".jar", ".war", ".class", ".so", ".dll", ".dylib", ".exe", ".bin",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".mov", ".avi", ".wav", ".pyc",
    ".o", ".a", ".wasm", ".parquet", ".sqlite", ".db", ".lock",
}

GENERATED_PATTERNS = [
    "*.min.js", "*.min.css", "*.map", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "Cargo.lock", "Gemfile.lock", "go.sum", "composer.lock", "*_pb2.py", "*_pb2_grpc.py", "*.pb.go",
    "*.generated.*", "*.gen.go", "*.g.dart", "*.designer.cs", "*.snap",
]
GENERATED_DIR_HINTS = {"generated", "__generated__", "gen", "migrations_auto", "_build"}

TEST_DIR_NAMES = {"test", "tests", "__tests__", "spec", "specs", "e2e", "testing"}
TEST_FILE_PATTERNS = ["test_*.py", "*_test.py", "*_test.go", "*.test.*", "*.spec.*", "*Test.java", "*Tests.cs", "*_spec.rb"]


def git(repo: Path, *args: str) -> str | None:
    """Run a git command in repo; return stdout, or None on any failure."""
    try:
        r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def is_git_repo(repo: Path) -> bool:
    return git(repo, "rev-parse", "--is-inside-work-tree") is not None


def head_commit(repo: Path) -> str | None:
    out = git(repo, "rev-parse", "--short", "HEAD")
    return out.strip() if out else None


def list_repo_files(repo: Path) -> list[str]:
    """Repo-relative POSIX paths of tracked + untracked-but-not-ignored files (minus agent config dirs)."""
    return [f for f in _list_all_files(Path(repo)) if not f.startswith(AGENT_PREFIXES)]


def _list_all_files(repo: Path) -> list[str]:
    repo = Path(repo)
    out = git(repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard") if (repo / ".git").exists() else None
    if out is not None:
        files = [f for f in out.split("\0") if f and (repo / f).is_file()]
        return sorted(f for f in files if not any(p in IGNORE_DIRS for p in Path(f).parts[:-1]))
    files = []
    for root, dirs, names in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for n in names:
            files.append(Path(root, n).relative_to(repo).as_posix())
    return sorted(files)


def is_generated(path: str) -> bool:
    p = Path(path)
    if any(part in GENERATED_DIR_HINTS for part in p.parts[:-1]):
        return True
    return any(fnmatch.fnmatch(p.name, pat) for pat in GENERATED_PATTERNS)


def is_test(path: str) -> bool:
    p = Path(path)
    if any(part.lower() in TEST_DIR_NAMES for part in p.parts[:-1]):
        return True
    return any(fnmatch.fnmatch(p.name, pat) for pat in TEST_FILE_PATTERNS)


def language_of(path: str) -> str | None:
    return LANG_BY_EXT.get(Path(path).suffix.lower())


DOC_BUILD_DIRS = {"docs", "doc", "documentation"}


def is_source(path: str) -> bool:
    """A file the wiki is expected to explain: real code, not generated/vendored, not a test, not doc-build config."""
    lang = language_of(path)
    if Path(path).parts[0] in DOC_BUILD_DIRS and len(Path(path).parts) > 1:
        return False
    return bool(lang) and lang not in NON_SOURCE_LANGS and not is_generated(path) and not is_test(path)


# ---------------------------------------------------------------- frontmatter

_FM = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|\Z)", re.S)


def _unquote(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def parse_frontmatter(text: str) -> tuple[dict, str, int]:
    """Parse the small YAML subset repowiki uses: scalars, `- item` lists, inline [a, b] lists.

    Returns (meta, body, line_offset) where line_offset is the number of lines the
    frontmatter consumed, so callers can report real line numbers for the body.
    """
    m = _FM.match(text)
    if not m:
        return {}, text, 0
    meta: dict = {}
    key = None
    for raw in m.group(1).splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s+(.*)$", raw)
        if item and key is not None:
            if not isinstance(meta.get(key), list):
                meta[key] = []
            meta[key].append(_unquote(item.group(1)))
            continue
        kv = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", raw)
        if not kv:
            continue
        key, val = kv.group(1), kv.group(2).strip()
        if val == "":
            meta[key] = []
        elif val.startswith("[") and val.endswith("]"):
            meta[key] = [_unquote(x) for x in val[1:-1].split(",") if x.strip()]
        else:
            meta[key] = _unquote(val)
    consumed = text[: m.end()].count("\n")
    return meta, text[m.end():], consumed


def as_list(v) -> list[str]:
    if v is None or v == "":
        return []
    return v if isinstance(v, list) else [v]


# ---------------------------------------------------------------- wiki pages

def wiki_pages(wiki: Path) -> list[Path]:
    """All markdown pages in the wiki. Files/dirs starting with '_' or '.' are internal notes."""
    pages = []
    for p in sorted(Path(wiki).rglob("*.md")):
        rel = p.relative_to(wiki)
        if any(part.startswith(("_", ".")) for part in rel.parts):
            continue
        pages.append(p)
    return pages


def source_matches(entry: str, path: str) -> bool:
    """Does a frontmatter `sources` entry (file, directory, or glob) cover this repo path?"""
    entry = entry.strip()
    while entry.startswith("./"):
        entry = entry[2:]
    if not entry:
        return False
    if any(ch in entry for ch in "*?["):
        return fnmatch.fnmatch(path, entry)
    entry = entry.rstrip("/")
    return path == entry or path.startswith(entry + "/")


# Citation: a backticked repo-relative path with a line or line range, e.g. `src/auth/session.ts:42-87`
CITATION_RE = re.compile(r"`([\w@+\-./]+\.\w+):(\d+)(?:-(\d+))?`")

# Extensions that make a missing `name.ext:123` token look like a (hallucinated) file citation rather than
# something like `example.com:443` or `127.0.0.1:8080`, which must not be reported as missing files.
KNOWN_EXTS = {e.lstrip(".").lower() for e in LANG_BY_EXT} | {
    "md", "mdx", "rst", "txt", "adoc", "json", "jsonc", "yaml", "yml", "toml", "ini", "cfg", "conf", "xml",
    "lock", "env", "gradle", "properties", "csv", "tsv", "mod", "sum", "mk", "cmake", "bat", "cmd", "ipynb",
    "tpl", "tmpl", "j2", "erb", "svg", "dockerfile", "makefile", "gemspec", "csproj", "sln",
}


def looks_like_file(path: str) -> bool:
    return Path(path).suffix.lstrip(".").lower() in KNOWN_EXTS


def slugify(heading: str) -> str:
    """GitHub-style heading slug."""
    s = re.sub(r"[`*_~]", "", heading.strip().lower())
    s = re.sub(r"[^\w\- ]", "", s, flags=re.UNICODE)
    return s.replace(" ", "-")
