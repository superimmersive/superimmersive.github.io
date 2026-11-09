# Studio model intake

Unlisted page: [https://superimmersive.io/tools/intake/](https://superimmersive.io/tools/intake/)

A name and a USDZ. Publish commits them to `main`:

| Path | Role |
| --- | --- |
| `models/<id>.usdz` | The file. Public URL `https://superimmersive.io/models/<id>.usdz`. |
| `models/catalog.json` | One new examples-list row. Other entries stay. |
| `ar/models/<id>.json` | The name only, so the app can label the product. |

The id is the name, lowercased, with spaces turned into hyphens. `test-box`, `biplane`, `robot`, and `axel-flux-motor` are refused. A file over 70 MB is refused. The row is always `placement: floor` and `animated: false`.

`/tools/` is disallowed in `robots.txt`. The page sends `noindex`. There is no server. A publish updates `main` immediately.
