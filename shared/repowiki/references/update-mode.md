# Update mode

Use this when the wiki directory already contains pages with `commit:` frontmatter and the user wants it refreshed — after a feature merge, a release, or "the docs are out of date". Regenerating everything wastes effort and churns pages that are still correct; the goal is to touch only what changed and leave the rest byte-for-byte alone, so diffs in the wiki mirror diffs in the code.

## Procedure

1. **Find what's stale.**
   ```bash
   python <skill-dir>/scripts/stale_pages.py <wiki> --repo <repo>
   ```
   It diffs each page's `commit` against the working tree and maps changed files to pages through their `sources`. Output has three groups:
   - **STALE** — pages with changed, added or deleted source files, with the file list.
   - **CANNOT TELL** — pages with no `sources`, no `commit`, or a commit that's not in this clone's history (shallow clone, rewritten history). Treat as stale unless a quick look shows nothing relevant changed. For a shallow clone, `git fetch --unshallow` (or `--deepen`) often resolves it.
   - **SOURCE FILES NO PAGE CLAIMS** — new or changed code outside every page's `sources`: candidates for new pages, or for widening an existing page's `sources`.

   Run `lint_wiki.py` at this point too. After code changes it works as a drift detector: errors name citations to deleted files or lines past the new end of a file, and "starts/ends on a blank line" warnings usually mean a block moved a few lines.

2. **Re-read before rewriting.** For each stale page, run `git diff <page-commit>..HEAD -- <sources>` (plus `git log --oneline` on the same paths) to see *what* changed, then reopen the changed files. Update the affected sections; don't rewrite sections the diff doesn't touch. Re-verify the line numbers of **every** citation on the page — line shifts are the most common reason a page goes wrong without its meaning changing.

3. **Handle structural change.**
   - *New module or package* → add a page from the template, link it from `index.md` (and `architecture.md` if it's a component).
   - *Deleted or merged module* → remove or merge the page, remove it from `index.md`, and fix every link to it (grep the wiki for the filename).
   - *Moved files* → update `sources` and citations; the page's content may be unchanged.
   - *Changes in how components relate* → refresh `architecture.md` and its diagrams even if its own `sources` didn't change; synthesis pages go stale through their dependencies.

4. **Re-stamp.** Set `commit:` to the current `git rev-parse --short HEAD` on every page you reviewed and confirmed or updated — including stale pages that needed no content change, so they stop reappearing. Leave untouched pages' stamps alone.

5. **Validate.** Run `lint_wiki.py` (see step 7 of [SKILL.md](../SKILL.md)) and `stale_pages.py` again; the second run should report only pages you deliberately left alone.

6. **Report briefly.** List pages updated, added, removed; anything you left stale and why.

## Judgment calls

- **Whitespace/comment-only or test-only changes:** if the diff doesn't change what the page claims, re-stamp without editing.
- **Mass change (rename refactor, formatter run, dependency bump across the repo):** nearly everything will show as stale. Check whether the changes alter behavior; if not, re-verify citations and re-stamp rather than rewriting. If the restructure is deep, say so and offer to regenerate from scratch.
- **Uncommitted changes:** the working tree is compared, so edits in progress make pages stale. That's usually what the user wants (document what's on disk), but mention it, and stamp HEAD only — `commit` records the base the page was written against.
- **No git:** the script falls back to file mtimes (page older than a source file → stale). It can't see deletions of globbed sources, so also compare the listed sources against the repo manually.
- **User asks to update just one area:** run the script, but only touch pages in that area; say which stale pages you skipped.
