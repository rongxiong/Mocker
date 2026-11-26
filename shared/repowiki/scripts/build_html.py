#!/usr/bin/env python3
"""Bundle a wiki directory into one self-contained, browsable HTML file.

Usage:
    python build_html.py <wiki_dir> --out repowiki.html [--title "My Project Wiki"]

The page has a sidebar, in-wiki link navigation, light/dark theme and Mermaid
diagrams. It loads marked and mermaid from cdnjs; offline, pages still show as
readable raw markdown. All wiki content is embedded in the file.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wikilib as wl  # noqa: E402

ORDER = ["index", "overview", "architecture", "getting-started"]

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>__TITLE__</title>
<style>
:root{--bg:#ffffff;--fg:#1f2328;--muted:#656d76;--line:#d8dee4;--side:#f6f8fa;--accent:#0969da;--code:#f0f2f5;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--line:#30363d;--side:#161b22;--accent:#58a6ff;--code:#1c2128;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--line:#30363d;--side:#161b22;--accent:#58a6ff;--code:#1c2128;color-scheme:dark}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
nav{width:290px;flex:none;background:var(--side);border-right:1px solid var(--line);overflow-y:auto;padding:16px 12px}
nav h1{font-size:15px;margin:0 8px 12px}
nav .group{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 8px 4px}
nav a{display:block;padding:5px 8px;border-radius:6px;color:var(--fg);text-decoration:none;font-size:14px}
nav a:hover{background:var(--line)}
nav a.on{background:var(--accent);color:#fff}
main{flex:1;min-width:0;overflow-y:auto;padding:32px 40px 80px}
article{max-width:860px;margin:0 auto}
article h1{border-bottom:1px solid var(--line);padding-bottom:.3em}
article h2{border-bottom:1px solid var(--line);padding-bottom:.25em;margin-top:2em}
article a{color:var(--accent)}
article code{background:var(--code);padding:.15em .35em;border-radius:5px;font-size:.88em}
article pre{background:var(--code);padding:14px;border-radius:8px;overflow-x:auto}
article pre code{background:none;padding:0}
article table{border-collapse:collapse;display:block;overflow-x:auto}
article th,article td{border:1px solid var(--line);padding:6px 12px}
article th{background:var(--side)}
article blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid var(--line);color:var(--muted)}
.mermaid{background:var(--side);border-radius:8px;padding:12px;overflow-x:auto;text-align:center;margin:1em 0}
.fm{color:var(--muted);font-size:13px;margin-bottom:8px}
#tog{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:5;border:1px solid var(--line);background:var(--side);color:var(--fg);border-radius:20px;padding:6px 12px;cursor:pointer}
#menu{display:none}
@media (max-width:760px){nav{position:fixed;inset:0 25% 0 0;z-index:4;transform:translateX(-100%);transition:transform .2s;width:auto;padding-top:calc(16px + env(safe-area-inset-top,0px))}body.open nav{transform:none}nav h1{margin-top:38px}main{padding:56px 18px 80px}#menu{display:block;position:fixed;left:10px;top:calc(10px + env(safe-area-inset-top,0px));z-index:5;border:1px solid var(--line);background:var(--side);color:var(--fg);border-radius:8px;padding:4px 10px}}
</style>
</head>
<body>
<button id="menu" aria-label="Toggle navigation">Menu</button>
<nav id="nav"></nav>
<main id="main"><article id="doc"></article></main>
<button id="tog" aria-label="Toggle theme">Theme</button>
<script type="application/json" id="wiki-data">__DATA__</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script>
<script>
(function(){
  var DATA = JSON.parse(document.getElementById('wiki-data').textContent);
  var pages = DATA.pages, byPath = {}, byId = {};
  pages.forEach(function(p){ byPath[p.path] = p; byId[p.id] = p; });
  var nav = document.getElementById('nav'), doc = document.getElementById('doc'), main = document.getElementById('main');
  var htmlRoot = document.documentElement;

  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function slug(t){ return t.toLowerCase().replace(/[`*_~]/g,'').replace(/[^\w\- ]/g,'').trim().replace(/ /g,'-'); }

  // Sidebar
  var h = '<h1>' + esc(DATA.title) + '</h1>', lastGroup = null;
  pages.forEach(function(p){
    var g = p.group;
    if (g !== lastGroup) { if (g) h += '<div class="group">' + esc(g) + '</div>'; lastGroup = g; }
    h += '<a href="#' + p.id + '" data-id="' + p.id + '">' + esc(p.title) + '</a>';
  });
  nav.innerHTML = h;

  function resolve(from, href){
    var parts = from.split('/'); parts.pop();
    href.split('/').forEach(function(seg){
      if (seg === '..') parts.pop(); else if (seg !== '.' && seg !== '') parts.push(seg);
    });
    return parts.join('/');
  }

  function render(p, anchor){
    var html;
    if (window.marked) {
      html = marked.parse(p.body, {gfm:true});
    } else {
      html = '<pre>' + esc(p.body) + '</pre>';
    }
    doc.innerHTML = html;
    // headings get ids; mermaid fences become diagram containers
    doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function(el){ el.id = slug(el.textContent); });
    doc.querySelectorAll('pre > code.language-mermaid').forEach(function(code){
      var div = document.createElement('div'); div.className = 'mermaid'; div.textContent = code.textContent;
      code.parentNode.replaceWith(div);
    });
    // internal links
    doc.querySelectorAll('a[href]').forEach(function(a){
      var href = a.getAttribute('href');
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; return; }
      if (href.charAt(0) === '#') { a.addEventListener('click', function(e){ e.preventDefault(); var t = document.getElementById(href.slice(1)); if (t) t.scrollIntoView(); }); return; }
      var bits = href.split('#'), target = byPath[resolve(p.path, decodeURIComponent(bits[0]))];
      if (target) { a.href = '#' + target.id; a.addEventListener('click', function(){ pendingAnchor = bits[1] || null; }); }
    });
    if (window.mermaid) { try { mermaid.run({nodes: doc.querySelectorAll('.mermaid')}); } catch(e) {} }
    nav.querySelectorAll('a').forEach(function(a){ a.classList.toggle('on', a.dataset.id === p.id); });
    document.title = p.title + ' \u2013 ' + DATA.title;
    document.body.classList.remove('open');
    if (anchor && document.getElementById(anchor)) document.getElementById(anchor).scrollIntoView(); else main.scrollTop = 0;
  }

  var pendingAnchor = null;
  function route(){
    var id = decodeURIComponent(location.hash.slice(1)), p = byId[id] || pages[0];
    var a = pendingAnchor; pendingAnchor = null;
    render(p, a);
  }

  function initMermaid(){
    if (!window.mermaid) return;
    var dark = htmlRoot.dataset.theme ? htmlRoot.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    mermaid.initialize({startOnLoad:false, theme: dark ? 'dark' : 'default', securityLevel:'strict'});
  }
  document.getElementById('tog').onclick = function(){
    var dark = htmlRoot.dataset.theme ? htmlRoot.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    htmlRoot.dataset.theme = dark ? 'light' : 'dark'; initMermaid(); route();
  };
  document.getElementById('menu').onclick = function(){ document.body.classList.toggle('open'); };
  window.addEventListener('hashchange', route);
  initMermaid(); route();
})();
</script>
</body>
</html>
"""


def sort_key(rel: str):
    stem = Path(rel).stem
    depth = len(Path(rel).parts)
    if depth == 1 and stem in ORDER:
        return (0, ORDER.index(stem), rel)
    return (1 if depth == 1 else 2, 0, rel)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wiki")
    ap.add_argument("--out", default="repowiki.html")
    ap.add_argument("--title", default=None)
    args = ap.parse_args()

    wiki = Path(args.wiki).resolve()
    paths = wl.wiki_pages(wiki)
    if not paths:
        print(f"error: no pages in {wiki}", file=sys.stderr)
        return 2
    rels = sorted((p.relative_to(wiki).as_posix() for p in paths), key=sort_key)
    pages = []
    for rel in rels:
        text = (wiki / rel).read_text(encoding="utf-8", errors="replace")
        meta, body, _ = wl.parse_frontmatter(text)
        parts = Path(rel).parts
        group = parts[0].replace("-", " ").replace("_", " ").title() if len(parts) > 1 else ""
        title = meta.get("title") or Path(rel).stem.replace("-", " ").title()
        pages.append({"id": re.sub(r"[^A-Za-z0-9]+", "-", rel[:-3]).strip("-").lower(), "path": rel, "title": title, "group": group, "body": body})

    title = args.title
    if not title:
        idx = next((p for p in pages if p["path"] == "index.md"), None)
        title = idx["title"] if idx else wiki.parent.name + " wiki"
    payload = json.dumps({"title": title, "pages": pages}, ensure_ascii=False).replace("</", "<\\/")
    html = TEMPLATE.replace("__TITLE__", title.replace("<", "&lt;")).replace("__DATA__", payload)
    Path(args.out).write_text(html, encoding="utf-8")
    print(f"wrote {args.out} ({len(pages)} pages, {len(html) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
