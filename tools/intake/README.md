# Client model intake

Unlisted page: [https://superimmersive.io/tools/intake/](https://superimmersive.io/tools/intake/)

A name and a USDZ. Publish sends them to the private Cloudflare R2 bucket `superimmersive-client-models`. The page does not commit the file to this repository, and the bucket has no public URL.

| Object | Role |
| --- | --- |
| `models/<id>.usdz` | The file. |
| `models/<id>.json` | The product name. |

The id is the name, lowercased, with spaces turned into hyphens. Uploading the same name again replaces that model. `test-box`, `biplane`, `robot`, and `axel-flux-motor` are refused. A file over 70 MB is refused.

The browser posts the file to `https://superimmersive-intake.superimmersive.workers.dev`. That Worker holds the only permission to write the bucket. It accepts uploads from `superimmersive.io` and `superimmersive.github.io`.

`/tools/` is disallowed in `robots.txt`. The page sends `noindex`.
