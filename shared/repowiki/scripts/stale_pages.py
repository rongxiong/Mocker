#!/usr/bin/env python3
"""Find wiki pages whose source files changed since the page was generated.

Usage:
    python stale_pages.py <wiki_dir> --repo <repo_dir> [--json]

Each page's frontmatter lists `sources` (files, directories or globs) and the
`commit` it was written against. For every page this script diffs that commit
against the working tree and reports:
  * stale pages and the changed files that made them stale
  * changed or new source files that no page claims (candidates for new pages)
Without git, it falls back to comparing file modification times.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wikilib as wl  # noqa: E402


def changed_since(repo: Path, commit: str, cache: dict) -> dict[str, str] | None:
    """{path: status} between `commit` and the working tree (incl. untracked). None if commit is unknown."""
    if commit in cache:
        return cache[commit]
    out = wl.git(repo, "diff", "--name-status", "--no-renames", commit)
    if out is None:
        cache[commit] = None
        return None
    changes = {}
    for line in out.splitlines():
        status, _, path = line.partition("\t")
        if path:
            changes[path] = status[0]
    untracked = wl.git(repo, "ls-files", "--others", "--exclude-standard") or ""
    for path in untracked.splitlines():
        changes.setdefault(path, "A")
    cache[commit] = changes
    return changes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wiki")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    wiki, repo = Path(args.wiki).resolve(), Path(args.repo).resolve()
    pages = wl.wiki_pages(wiki)
    if not pages:
        print(f"error: no pages in {wiki}", file=sys.stderr)
        return 2

    use_git = wl.is_git_repo(repo)
    head = wl.head_commit(repo) if use_git else None
    all_files = wl.list_repo_files(repo)
    cache: dict = {}
    stale, fresh, unknown = [], [], []
    claimed: set[str] = set()
    all_changed: set[str] = set()

    for p in pages:
        rel = p.relative_to(wiki).as_posix()
        meta, _, _ = wl.parse_frontmatter(p.read_text(encoding="utf-8", errors="replace"))
        sources = wl.as_list(meta.get("sources"))
        for f in all_files:
            if any(wl.source_matches(s, f) for s in sources):
                claimed.add(f)
        if not sources:
            if Path(rel).stem not in {"index", "glossary"}:  # these are reviewed by hand when pages come or go
                unknown.append({"page": rel, "reason": "no `sources` in frontmatter"})
            continue

        reasons: list[str] = []
        if use_git:
            commit = meta.get("commit")
            changes = changed_since(repo, commit, cache) if commit else None
            if changes is None:
                unknown.append({"page": rel, "reason": f"commit '{commit}' missing or not in this repo's history" if commit else "no `commit` in frontmatter"})
                continue
            all_changed.update(changes)
            for path, status in sorted(changes.items()):
                if any(wl.source_matches(s, path) for s in sources):
                    reasons.append(f"{path} ({ {'M': 'modified', 'A': 'added', 'D': 'deleted'}.get(status, status) })")
        else:
            page_mtime = p.stat().st_mtime
            for f in all_files:
                if any(wl.source_matches(s, f) for s in sources) and (repo / f).stat().st_mtime > page_mtime:
                    reasons.append(f"{f} (newer than page)")
            # Deleted sources: listed file entries that no longer exist
            for s in sources:
                if not any(ch in s for ch in "*?[") and not (repo / s.rstrip("/")).exists():
                    reasons.append(f"{s} (deleted)")
        (stale if reasons else fresh).append({"page": rel, "changes": reasons})

    unclaimed_changes = sorted(f for f in all_changed if f in set(all_files) and wl.is_source(f) and f not in claimed) if use_git else \
        sorted(f for f in all_files if wl.is_source(f) and f not in claimed)
    new_dirs: dict[str, int] = {}
    for f in unclaimed_changes:
        parts = Path(f).parts
        key = "/".join(parts[:2]) if len(parts) > 2 else "/".join(parts[:-1]) or "."
        new_dirs[key] = new_dirs.get(key, 0) + 1

    result = {"head": head, "stale": stale, "fresh": [f["page"] for f in fresh], "unknown": unknown,
              "unclaimed_source_files": unclaimed_changes, "unclaimed_by_dir": new_dirs}
    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print(f"HEAD: {head or '(no git)'}   pages: {len(pages)}   stale: {len(stale)}   unknown: {len(unknown)}   fresh: {len(fresh)}\n")
    if stale:
        print("STALE (regenerate these):")
        for s in stale:
            print(f"  - {s['page']}")
            for c in s["changes"][:8]:
                print(f"      {c}")
            if len(s["changes"]) > 8:
                print(f"      … {len(s['changes']) - 8} more")
    if unknown:
        print("\nCANNOT TELL (review manually, treat as stale if in doubt):")
        for u in unknown:
            print(f"  - {u['page']}: {u['reason']}")
    if new_dirs:
        print("\nSOURCE FILES NO PAGE CLAIMS (consider new pages or widening `sources`):")
        for k, n in sorted(new_dirs.items(), key=lambda kv: -kv[1])[:15]:
            print(f"  - {k}  ({n} files)")
        if len(unclaimed_changes) <= 10:
            print("    files: " + ", ".join(unclaimed_changes))
    structural = bool(new_dirs) or any(c.endswith("(deleted)") or c.endswith("(added)") for s_ in stale for c in s_["changes"])
    if structural:
        print("\nStructure changed (files added, deleted or unclaimed): also review index.md, overview.md and architecture.md;"
              "\nsynthesis pages go stale through the modules they summarize even when their own `sources` are unchanged.")
    if not stale and not unknown and not new_dirs:
        print("Wiki is up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
