# Marketing materials — mincut-context v1.7.0

Ready-to-paste copy for launch.

| File | What it is |
|---|---|
| [`social-posts.md`](./social-posts.md) | LinkedIn (EN), X (EN long-form), Facebook (BN) + Show HN + awesome-mcp-servers PR copy |
| [`devto-article.md`](./devto-article.md) | Dev.to long-form. Front-matter ready. `published: false` → flip to `true` when you actually publish. |
| [`medium-article.md`](./medium-article.md) | Medium long-form, narrative-leaning. Paste body into Medium's editor; it'll auto-format. |

## Visuals (referenced from each article via absolute GitHub raw URLs)

| File in `docs/` | Use it for |
|---|---|
| `demo.gif` (206 KB) | Headline animated demo — works in LinkedIn, X, Facebook, Dev.to |
| `hero.png` (116 KB) | Cover image for Medium / Dev.to / X preview |
| `doctor.gif` (57 KB) | `mcx doctor` demo for the articles |
| `doctor.png` (116 KB) | Static `mcx doctor` screenshot for Medium |

All absolute URLs in the articles point at `https://raw.githubusercontent.com/dhrupo/mincut-context/main/docs/...` so they render correctly when pasted into Dev.to or Medium.

## Posting playbook

See [`social-posts.md`](./social-posts.md) for the 90-minute launch window and the engagement rules.

The order I'd actually use:

1. **Dev.to** — publish the article first (it's the most-substantial piece; everything else can link to it)
2. **Medium** — same article, slightly narrative-leaning version, cross-posted as canonical-tag → Dev.to URL
3. **LinkedIn** — short version with `docs/demo.gif`, link to Dev.to article
4. **X** — long-form post (or 7-tweet thread variant), link to Dev.to article
5. **Facebook** — Bengali version, link to GitHub
6. **Show HN** — submit GitHub URL, post the prepared first comment immediately
7. **awesome-mcp-servers** — PR to the registry, body ready in social-posts.md

If you want a single repeating tagline across every platform:

> **"83% recall vs grep's 42% — graph theory beats keyword search at picking AI agent context."**

It's terse, has a number, names the comparison, and tells you what mincut-context *is* in one sentence.
