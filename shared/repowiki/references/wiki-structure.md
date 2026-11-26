# Wiki structure and page templates

Contents: [Standard tree](#standard-tree) · [Emphasis by repo type](#emphasis-by-repo-type) · [Templates](#templates) (index, overview, architecture, getting-started, module, API, CLI, config, data model, testing, deployment, contributing, glossary)

## Standard tree

Include only pages the repo gives you something real to say about. An empty "Deployment" page is worse than none.

```
repowiki/
├── index.md              # home + table of contents (always)
├── overview.md           # what it is, stack, layout (always)
├── architecture.md       # components, flows, diagrams (always, except trivial repos)
├── getting-started.md    # install, run, first change (when runnable)
├── modules/
│   └── <subsystem>.md    # one per cohesive subsystem (the bulk of the wiki)
├── reference/
│   ├── api.md            # HTTP/RPC/library public API
│   ├── cli.md            # commands and flags
│   ├── config.md         # env vars, config files, feature flags
│   └── data-model.md     # schemas, entities, migrations
├── guides/
│   ├── testing.md
│   ├── deployment.md     # CI/CD, containers, infra
│   └── contributing.md   # conventions, how to add X
├── glossary.md           # domain terms the code uses (when there are several)
└── _plan.md              # planning notes; ignored by tools
```

Monorepo: keep `index.md`, `overview.md`, `architecture.md` at the root for the cross-package picture, then nest `packages/<name>/index.md` + `packages/<name>/modules/*.md`. Link each package index from the root index.

## Emphasis by repo type

| Repo type | Spend the most words on |
|---|---|
| Library / SDK | Public API, usage examples taken from tests/README, extension points, versioning/compat |
| Web service / API | Request lifecycle, routing, auth, data model, external integrations, config, deployment |
| CLI tool | Command tree, argument parsing, core pipeline, config files, exit codes |
| Frontend app | Routing/state management, component hierarchy, data fetching, build tooling |
| Data / ML | Pipelines and stages, data schemas, model/training code paths, reproducibility |
| Infra / IaC | Resource topology, environments, modules, secrets handling (names only), apply workflow |
| Monorepo | How packages depend on each other, shared tooling, release process |

## Templates

Each template shows the headings to use. Drop a heading when the repo has nothing true to put under it.

### index.md

```markdown
---
title: <Project> Wiki
commit: <short sha>
---
# <Project> Wiki

One paragraph: what the project is and who this wiki is for. State scope if partial
("Covers the `server/` and `shared/` packages; `legacy/` is not documented.").

## Start here
- [Overview](overview.md) — what it is and how the repo is laid out
- [Architecture](architecture.md) — components and main flows
- [Getting started](getting-started.md) — install, run, test

## Modules
- [Auth](modules/auth.md) — one-line description
- …

## Reference
- [Configuration](reference/config.md) — …

## Guides
- …
```

Every page in the wiki must be linked from here, directly or via a package index.

### overview.md

Frontmatter `sources`: README, manifests and the entry points — not whole directories (see SKILL.md, Page format).

Headings: **What it is** (purpose in 2–4 sentences, who uses it) · **Tech stack** (languages, frameworks, key dependencies with what each is used for — from manifests) · **Repository layout** (annotated tree of top-level directories, each linked to the module page that covers it) · **Key concepts** (3–6 terms a newcomer must know) · **How to read this wiki**.

### architecture.md

Frontmatter `sources`: the entry points, package root (`__init__`, `main`, router/composition root) and whatever config wires components together. Detail belongs on the module pages and is covered by their `sources`.

Headings: **System context** (what it talks to: databases, queues, third-party APIs, clients) · **Component diagram** (Mermaid flowchart; nodes are real modules, edges are real dependencies or calls) · **Responsibilities** (table: component → what it owns → link to its page) · **Key flows** (one subsection per major flow: numbered steps with citations, plus a sequence diagram when more than three actors are involved) · **Cross-cutting concerns** (auth, logging, error handling, config, concurrency — whichever the code actually has) · **Design decisions** (only those evidenced by code, comments, ADRs, or commit history; otherwise omit).

### getting-started.md

Headings: **Prerequisites** (runtime versions from manifests/CI) · **Install** · **Run** · **Test** · **Common tasks** (build, lint, migrate, regenerate code — from Makefile/scripts/CI) · **Troubleshooting** (only issues evidenced in README/issues/code). Commands come from the repo's own files; cite where each came from, e.g. "(from `Makefile:12-20`)". Say which commands you executed, if any.

### modules/<name>.md

```markdown
---
title: <Subsystem>
sources:
  - src/<subsystem>/
commit: <short sha>
---
# <Subsystem>

**Purpose.** 2–3 sentences: what it owns and why it exists.

## Responsibilities
Bullets of what this module does and, just as important, what it deliberately doesn't.

## Structure
| File | Role |
|---|---|
| `src/x/service.ts` | … |

## Public interface
The functions/classes/endpoints other modules call, with signatures and citations.

## How it works
Numbered main flow with citations; sequence diagram if multiple collaborators.

## Dependencies
- Uses: [Database layer](db.md), external libs (what for)
- Used by: [API routes](api-routes.md)

## Configuration
Env vars / settings this module reads (names, defaults, effect).

## Gotchas
Non-obvious behavior, ordering requirements, concurrency, known TODOs found in code.

## Sources
`src/x/service.ts:10-120`, `src/x/types.ts:1-45`
```

### reference/api.md

One section per endpoint or public symbol: method + path (or signature), purpose, parameters/body, response/return, errors, auth requirement, citation to the handler. Group by resource. For libraries, group by module and show one minimal usage example from tests or README. If an OpenAPI/proto/GraphQL schema exists, cite it and summarize rather than duplicating it.

### reference/cli.md

Command tree, then per command: synopsis, flags (name, type, default, effect), examples, exit codes, citation to where it is defined.

### reference/config.md

Table: name · where read (cite) · type/default · effect. Group by env vars, config files, feature flags. Names and defaults only — never real secret values.

### reference/data-model.md

Entities with fields and relationships (Mermaid `erDiagram` when more than three), where each is defined (cite), how the schema changes (migrations tool and directory), invariants enforced in code vs. in the database.

### guides/testing.md

Test layout, frameworks, how to run all/one test, fixtures and mocks conventions, what CI runs (cite workflow file), coverage tooling if configured.

### guides/deployment.md

Build artifacts, Dockerfile walk-through, CI/CD stages (cite workflow files), environments, required secrets (names only), migration/rollout steps, observability hooks found in code.

### guides/contributing.md

Branch/PR conventions (from CONTRIBUTING or repo history), code style tooling, how to add a typical thing ("add an endpoint", "add a command") derived by following an existing example through the code.

### glossary.md

Alphabetical table: term · meaning in this codebase · where it appears (cite). Include only domain or project-specific terms, not general programming vocabulary.
