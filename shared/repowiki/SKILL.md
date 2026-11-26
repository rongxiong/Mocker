---
name: repowiki
description: Generate a structured, navigable wiki for a code repository — architecture overview, module-by-module pages, API/CLI/config reference, Mermaid diagrams, and verifiable file:line source citations — and keep it current as the code changes. Use this whenever the user asks for a repo wiki, repowiki, codebase documentation, an architecture overview or onboarding guide for a project, a DeepWiki-style site, "document this repo/codebase", "explain how this repo works end to end", or to refresh or update existing repo docs after code changes. Also use it when the user hands over a GitHub URL, a zip, a local project, or a workspace of several related repositories and wants the whole thing understood and written up (not a single bug fixed), even if they never say the word "wiki".
compatibility: Works in any agent that supports Agent Skills (GitHub Copilot in VS Code, Copilot CLI, Claude Code, claude.ai). The bundled scripts need Python 3.9+ and use git when available; without them, write the wiki by hand and skip the automated checks.
---

# repowiki

Turn a repository into a wiki a new engineer could use on day one: what the project is, how it is put together, how the main flows work, where to make changes. Every statement is grounded in code you actually read, with `path:line` citations that a script can verify.

## Principles

When a situation isn't covered below, reason from these.

1. **Grounded or absent.** Describe only what you read. A wiki that sounds right but is wrong is worse than a missing page, because readers trust it. When intent isn't evident from the code, write "Unclear from source: …" instead of inventing a rationale.
2. **Explain what `ls` can't.** Readers can list files. The value is in how parts connect, the main flows, conventions, and gotchas. A page that only enumerates files or restates signatures has failed.
3. **Plan before writing; scale to the repo.** Scan, decide the page tree, then write. A 20-file CLI needs about 8 pages; a monorepo needs a navigable hierarchy and deliberate prioritization.
4. **Verifiable and maintainable.** Citations, `sources` frontmatter and a commit stamp let a linter catch hallucinated references and let later runs update only what changed. That is what stops a wiki from rotting.

## Running the bundled scripts

The scripts live in [scripts/](./scripts/) next to this file. Wherever a command below says `<skill-dir>`, substitute the folder that contains this `SKILL.md` — for example `.github/skills/repowiki`, `.claude/skills/repowiki` or `~/.copilot/skills/repowiki`. Use whichever Python launcher exists (`python3`, `python`, or `py -3` on Windows). The scripts only read the repository and write where you tell them; in an IDE agent each command may need the user's approval. Forward slashes work on every platform.

## Workflow

### 1. Establish context

- **Repo location.** The open workspace, a local path, an uploaded archive (unpack it into a writable working dir), or a GitHub URL (`git clone --depth 50 <url>` if the network allows, otherwise ask for an upload).
- **Which folder is the root?** Choose one folder and use it for everything: the `<repo>` argument of every script, the base of every citation and `sources` path, and the home of the wiki (`<root>/repowiki/`). If the user points at a subfolder — a package in a monorepo, or one project inside a larger workspace — *that subfolder is the root*. It need not be a git root: the scripts run git relative to it, so parent `.gitignore` rules apply and changes elsewhere in the repo never make its pages stale. If the workspace holds several projects and the request doesn't say which, ask once (offer the candidates you found from manifests) before scanning. On the index page, say which folder the root is when it isn't the git root ("Paths are relative to `packages/api/`"). You may cite a sibling package with a `../` path when an explanation needs it (the linter checks it), but don't document it. If the folder holds *several related repositories* (a workspace folder, or a parent of sibling repos) and the user wants one wiki for them, that folder is the root and you are in **workspace mode** — see [Workspace of related repos](#workspace-of-related-repos). Agent files at the root (`.github/skills/`, `.github/copilot-instructions.md`, `.claude/`) are ignored by the scripts automatically.
- **Mode.** If the target wiki dir already has pages with `commit:` frontmatter, this is an **update**: follow [references/update-mode.md](./references/update-mode.md) instead of rewriting from scratch.
- **Scope and audience.** Whole repo by default. If the user names a package, sub-path or audience ("for new contributors", "for API consumers"), honor it and say so on the index page.
- **Output dir.** `repowiki/` inside the root folder by default. Use an existing convention (`docs/`, `wiki/`) or the user's choice if given. In a chat sandbox that has a designated outputs folder (claude.ai: `/mnt/user-data/outputs/`), write there instead.
- **Language.** Write in the user's language, or the README's if the user didn't specify.

### 2. Scan

```bash
python <skill-dir>/scripts/scan_repo.py <repo>
```

This prints size class, language mix, LOC per directory, manifests, entry-point candidates, CI/infra files, existing docs, the largest files and the git HEAD. Use it to plan; it replaces dozens of exploratory `find`/`wc` calls. Add `--json <file>` if you want the full inventory saved. If Python is unavailable, approximate with `git ls-files` and a line count.

### 3. Orient

Read in this order and stop once you can say in three sentences what the project does and how it runs: README and existing docs (ARCHITECTURE, CONTRIBUTING) → manifests (dependencies, scripts, entry points, workspaces) → entry-point files → top-level config → CI workflows (they reveal the real build/test/deploy commands) → a couple of tests (they show intended behavior). Treat existing docs as leads, not truth; verify against code and note discrepancies.

### 4. Plan the page tree

Decide every page before writing any. Use the standard tree and templates in [references/wiki-structure.md](./references/wiki-structure.md) — open it now. Save the plan as `_plan.md` in the wiki dir (underscore-prefixed files are ignored by the linter and HTML builder): for each page, its path, title, one-line purpose, and `sources`.

- One page per cohesive subsystem a contributor would work in — not per file or per directory. Merge small related directories; split a module that exceeds ~2,000 lines or has several responsibilities.
- Page budget by scan size class: **small** (<50 source files) 6–10 pages · **medium** (50–500) 12–30 · **large / monorepo** (>500, or workspace signals) an index, a cross-cutting overview and architecture, then one section per package. For large repos, pick the most important packages and say which were left out; don't pretend to cover everything.
- Every significant source directory should land in some page's `sources`; the linter reports coverage.
- If the plan exceeds ~30 pages, or the request was ambiguous or scoped, show the page list in a few lines and let the user adjust. Otherwise proceed without blocking.

### 5. Research and write module pages first

For each page:

1. Read the files in its `sources` — fully for core code, skimming for peripheral. Search for callers and usages. Read tests for behavioral contracts.
2. Note responsibility, public interface, key types, the main flow, dependencies in and out, config/env, error handling, and gotchas — with line ranges as you go.
3. Write from the template, **citing while you write**. Line numbers recalled afterwards drift and fail lint.
   Open every symbol you mention before describing it: names mislead, and docstrings often say something narrower or different than you'd guess. If you haven't read it, leave it out or flag it as unread.
4. Add a diagram only where it clarifies; open [references/diagrams.md](./references/diagrams.md) before the first one.

Module pages come first because the overview and architecture pages synthesize them; writing those last keeps them accurate. If your environment can delegate to sub-agents and the repo is large, give one sub-agent per module its sources, the template, and the citation rules, and keep synthesis and linting for yourself. Otherwise work through pages in plan order — you don't need to read everything, only what each page needs.

### 6. Synthesize

Write `architecture.md` (component diagram, responsibilities, key flows), `overview.md` (what/why/tech stack/repo layout), `getting-started.md` (commands taken from README, Makefile, CI, or manifests — never invented; say which you actually ran, if any), and finally `index.md` linking every page with a one-line description. Stamp every page with the commit from `git rev-parse --short HEAD` (omit `commit` only when the repo isn't git). In workspace mode stamp with `commits:` instead — see below.

### 7. Validate

```bash
python <skill-dir>/scripts/lint_wiki.py <wiki> --repo <repo>
```

Fix every error. A bad citation means a typo or a hallucination: reopen the file and correct the *page*, don't just nudge numbers until lint passes. Then read the warnings (a citation that starts or ends on a blank line almost always means the line numbers are off) and the coverage summary — either add pages for important uncovered areas or accept the gap knowingly (small scripts, examples). For a scoped wiki, low overall coverage is expected; judge coverage only inside the requested scope.

**Lint proves a citation points at something real, not that the claim is true.** So audit the claims too:

```bash
python <skill-dir>/scripts/lint_wiki.py <wiki> --repo <repo> --show-cited --pages architecture
```

This prints the first and last cited line beside every citation. Scan each page's output for ranges that start or stop mid-statement (a function that ends on `except …:`), and for excerpts that don't match what the sentence claims. Prioritize `architecture.md` and any page describing security, data flow or error handling. Fix, re-run until there are no errors, and use `--strict` once to clear warnings.

If scripts can't run at all, do the same audit by hand: reopen each cited range and confirm it says what the sentence claims.

### 8. Deliver

Pick the branch that matches where you are running.

**IDE or CLI agent with a workspace (VS Code Copilot, Copilot CLI, Claude Code):**
- The wiki is already on disk in the workspace; don't commit or push unless asked.
- Tell the user where it is, the page list, and the stamped commit, and that it can be refreshed later by asking for an update.
- Diagrams are Mermaid, which GitHub and Mermaid-capable markdown previews render. If the user's editor preview shows them as plain code, offer a browsable single file: `python <skill-dir>/scripts/build_html.py <wiki> --out repowiki.html` (loads two libraries from cdnjs, so it needs a connection to draw diagrams).

**Chat sandbox without a workspace (claude.ai):** build a browsable single file and a zip, then present them. Skip the HTML if the user asked for Markdown only.
```bash
python <skill-dir>/scripts/build_html.py <wiki> --out <outputs>/repowiki.html
cd <outputs> && zip -rq repowiki.zip repowiki
```
Present `repowiki.html` first, then the zip.

**Closing message, either way:** short. What was produced, the structure in one line, anything unclear or skipped, and any security concern you noticed (e.g. a committed secret — mention it here, never in the wiki).

## Page format

Every page starts with frontmatter, then a short summary paragraph:

```markdown
---
title: Authentication
sources:
  - src/auth/
  - src/middleware/session.ts
commit: a1b2c3d          # workspace mode: use `commits:` instead (see below)
---
# Authentication

Two or three sentences: what this component is for and where it sits in the system.
```

- `sources`: files, directories or globs this page's claims depend on. Update mode uses them to decide staleness, and lint uses them for coverage. For module pages list the subsystem's directory. For synthesis pages (`overview`, `architecture`) list only the files that define structure — manifests, entry points, package `__init__`, key config — never the whole source tree: a page claiming everything goes stale on every change, and it also hides new, undocumented code from the "unclaimed files" report.
- **Citations:** a backticked path relative to the root chosen in step 1, with lines: `` `src/auth/session.ts:42-87` ``. Cite after the claim or in a closing "Sources" line per section. Only cite lines you read at this commit; lint verifies file existence and line bounds.
- **Links between pages:** relative markdown links (`[Auth](../modules/auth.md)`), with every page reachable from `index.md`.
- **Length:** ~300–1,200 words per page; split before going longer. Tables for reference material, numbered steps for flows.

## Workspace of related repos

Use this when the scan prints **Workspace mode: yes**: the root holds several git repositories and the user wants one wiki for all of them, written at the root (for example a VS Code workspace whose subfolders are the repos, with the Copilot files at its top). The root itself may or may not be a git repository; the scripts handle both, apply each repo's own `.gitignore`, and report every repo's branch, HEAD and dirty state.

1. **Work out the roles before planning.** Read the scan's repository table and *Cross-repo hints* (path dependencies, package names, Compose build contexts, submodules), then confirm by reading the files — the hints are heuristics. Decide which repo is the main app or entry point and which are libraries, services, SDKs, infrastructure or tooling. Look for the links the hints can't see: API base URLs and env vars, shared schemas (OpenAPI, protobuf, GraphQL), message topics, CI that checks out several repos, READMEs that name sibling repos. A relationship claim needs evidence; cite **both sides** (caller and callee), and if you only see one side, say so.
2. **Plan one wiki for the system, with a section per repo.** Root pages: `index`, `overview` (a table of repos and their roles), `architecture` (a diagram with repos as nodes and labeled edges, plus a sequence diagram for each flow that crosses repos), `getting-started` (how to bring the whole system up: order, env, ports, commands from each repo's own README, Makefile or Compose file), and `reference/integration.md` (every contract between repos). Then `repos/<name>/index.md` and `repos/<name>/modules/*.md` for each repo. See [references/wiki-structure.md](./references/wiki-structure.md#workspace-of-related-repos).
3. **Budget by importance, not evenly.** The main app gets the most depth; each supporting repo gets pages sized by its own size class. With more than ~8 repos, document the main repo and its direct dependencies fully, give the rest one index page each, and say so on the index.
4. **Paths are workspace-relative.** `core/src/index.ts:12`, `sources: - core/src/`. A path always starts with the repo folder.
5. **Stamp with `commits:`**, one `repo@sha` for every repository the page's `sources` touch — the scan prints them ready to paste:
   ```yaml
   commits:
     - app@f364c52
     - core@2a4cfde
   ```
   Cross-repo pages (architecture, integration) list each repo they cite. Update mode diffs each repo against its own stamp, so a change in `core` only makes the pages that depend on `core` stale.
6. **Write per-repo pages first** (these can be delegated one repo each), then integration, architecture, overview and index. Don't modify any repo; the wiki lives only in `<root>/repowiki/`.
7. **Dirty repos.** The scan flags repos with uncommitted changes. The wiki documents the working tree while the stamp records HEAD; mention this in your closing message.

## Writing guidance

- Be concrete: name the function or class and cite it, instead of "the system handles requests".
- Present tense, active voice, no marketing adjectives.
- Quote real code sparingly (≤15 lines), copied exactly with a citation. Never present pseudo-code as repo code.
- Config and env vars: document names, purpose and defaults. Never copy real secrets, tokens or credentials from `.env`, config or code.
- Don't document vendored, generated or lock files; a one-line mention in the overview is enough.
- Mark uncertainty explicitly. Where behavior depends on something you couldn't see (external service, runtime config), say so.

## Diagrams

Use Mermaid; recipes and pitfalls are in [references/diagrams.md](./references/diagrams.md). Minimum: a component diagram in `architecture.md`, a sequence diagram for each major flow, and an ER or class diagram when there are more than three core entities. Diagram nodes must correspond to real components you've read; keep each under ~12 nodes and quote labels.

## Edge cases

- **Tiny or non-code repo** (docs, data, config only): produce a short wiki (overview + structure + how to use); don't force module pages.
- **Monorepo (one repo, many packages) vs. workspace (many repos):** a monorepo is a single repo with one `commit`; a workspace uses `commits:`.
- **Monorepo:** top-level `overview.md` and `architecture.md` describe how packages relate; each package gets its own section with an overview and module pages, listed in the index.
- **Private repo / no access:** say what you can't reach; document only what you can read.
- **Huge files or minified code:** read the head and the exported surface; cite what you read.
- **Existing wiki from another tool:** treat as input, verify, and write in this format if the user wants it replaced.

## Reference files

Open these when the step says to; they aren't loaded automatically.

- [references/wiki-structure.md](./references/wiki-structure.md) — standard page tree, templates for every page type, emphasis by repo type. Read at planning time (step 4).
- [references/diagrams.md](./references/diagrams.md) — Mermaid recipes and syntax pitfalls. Read before adding the first diagram.
- [references/update-mode.md](./references/update-mode.md) — incremental refresh procedure using `stale_pages.py`. Read whenever a wiki already exists.
