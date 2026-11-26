#!/usr/bin/env python3
"""Find wiki pages whose source files changed since the page was generated.

Usage:
    python stale_pages.py <wiki_dir> --repo <repo_dir> [--json]

Each page's frontmatter lists `sources` (files, directories or globs) and the
`commit` it was written against (or, in a workspace of several repos, `commits:` entries of the form
`path@sha`, one per repository). For every page this script diffs that commit
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


def changed_since(root: Path, sub: str, commit: str, cache: dict) -> dict[str, str] | None:
    """{workspace-relative path: status} between `commit` and the working tree of the repo at root/sub
    (sub == "" means root itself), including untracked files. None if the commit is unknown there."""
    key = (sub, commit)
    if key in cache:
        return cache[key]
    repo = root / sub if sub else root
    # --relative: report paths relative to `repo` (and only inside it), so they match each page's `sources`
    # even when `repo` is a subfolder of a larger git repository.
    out = wl.git(repo, "diff", "--name-status", "--no-renames", "--relative", commit)
    if out is None:
        cache[key] = None
        return None
    prefix = sub + "/" if sub else ""
    changes = {}
    for line in out.splitlines():
        status, _, path = line.partition("\t")
        if path:
            changes[prefix + path] = status[0]
    for path in (wl.git(repo, "ls-files", "--others", "--exclude-standard") or "").splitlines():
        changes.setdefault(prefix + path, "A")
    cache[key] = changes
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
    nested = wl.find_nested_repos(repo)
    head = wl.head_commit(repo) if use_git else (f"{len(nested)} nested repos" if nested else None)
    tracked = False
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
            if rel not in {"index.md", "glossary.md"}:  # root pages are reviewed by hand when pages come or go
                unknown.append({"page": rel, "reason": "no `sources` in frontmatter"})
            continue

        reasons: list[str] = []
        commits = wl.as_list(meta.get("commits"))  # workspace pages: one `path@sha` per repository
        commit = meta.get("commit")                # single-repo pages: one sha for the root
        entries = commits or ([commit] if commit and use_git else [])
        if entries:
            changes: dict[str, str] = {}
            problem = None
            for ent in entries:
                sub, sha = wl.split_commit_entry(ent)
                ch = changed_since(repo, sub, sha, cache)
                if ch is None:
                    problem = f"commit '{ent}' missing or not in that repository's history"
                    break
                changes.update(ch)
            if problem:
                unknown.append({"page": rel, "reason": problem})
                continue
            tracked = True
            all_changed.update(changes)
            for path, status in sorted(changes.items()):
                if any(wl.source_matches(s, path) for s in sources):
                    reasons.append(f"{path} ({ {'M': 'modified', 'A': 'added', 'D': 'deleted'}.get(status, status) })")
        elif use_git:
            unknown.append({"page": rel, "reason": "no `commit` in frontmatter"})
            continue
        elif nested:
            unknown.append({"page": rel, "reason": "no `commits` in frontmatter (the root is not a git repo; stamp each repository as path@sha)"})
            continue
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

    unclaimed_changes = sorted(f for f in all_changed if f in set(all_files) and wl.is_source(f) and f not in claimed) if (use_git or tracked) else \
        sorted(f for f in all_files if wl.is_source(f) and f not in claimed)
    repos_without_pages = [r for r in nested if not any(f.startswith(r + "/") for f in claimed)]
    new_dirs: dict[str, int] = {}
    for f in unclaimed_changes:
        parts = Path(f).parts
        key = "/".join(parts[:2]) if len(parts) > 2 else "/".join(parts[:-1]) or "."
        new_dirs[key] = new_dirs.get(key, 0) + 1

    result = {"head": head, "stale": stale, "fresh": [f["page"] for f in fresh], "unknown": unknown,
              "repos_without_pages": repos_without_pages, "unclaimed_source_files": unclaimed_changes, "unclaimed_by_dir": new_dirs}
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
    if repos_without_pages:
        print("\nREPOSITORIES NO PAGE CLAIMS (add a section for each, or note them as out of scope on the index):")
        for r in repos_without_pages:
            print(f"  - {r}")
    structural = bool(new_dirs) or bool(repos_without_pages) or any(c.endswith("(deleted)") or c.endswith("(added)") for s_ in stale for c in s_["changes"])
    if structural:
        print("\nStructure changed (files added, deleted or unclaimed): also review index.md, overview.md and architecture.md;"
              "\nsynthesis pages go stale through the modules they summarize even when their own `sources` are unchanged.")
    if not stale and not unknown and not new_dirs and not repos_without_pages:
        print("Wiki is up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
