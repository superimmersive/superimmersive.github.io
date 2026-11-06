# Studio model intake

Unlisted page: [https://superimmersive.io/tools/intake/](https://superimmersive.io/tools/intake/)

Devon uses it to put a product on the Superimmersive AR app without a manual commit. The page is static. The browser talks to the GitHub Git Data API and creates **one commit on the live branch** (`main`). There is no server, and the token is not stored in this repository.

`/tools/` is already disallowed in `robots.txt`. The page also sends `noindex`.

## Passphrase

Initial passphrase: `george-studio-intake`

It is a speed bump for someone who stumbles on the URL. This repo is public, so do not treat the phrase as a secret. The GitHub token is what stops a publish.

The page keeps the unlock in `sessionStorage` for the tab. To rotate the phrase:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('NEW PHRASE').digest('hex'))"
```

Put that hex in `GATE_SHA256` in `tools/intake/intake.js`, replace the phrase on the page and in this file, and ship the change. Do not commit the token.

## GitHub token

1. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
2. Resource owner: `superimmersive`. Repository access: only `superimmersive.github.io`.
3. Permissions: **Contents → Read and write**. Leave the rest at No access.
4. On the intake page, paste the token and choose **Save for this tab**.

The token lives in `sessionStorage` under `si-intake-pat`. Closing the tab clears it. The page sends it only to `https://api.github.com` and then clears the field. A classic token with the `repo` scope also works; it can see every repo that account can, so prefer the fine-grained one.

The commit is authored as the GitHub user who owns the token. It lands on the repository default branch, which GitHub Pages serves at superimmersive.io. It does not open a pull request. If a ruleset blocks that push, GitHub returns the error on the page and nothing is half-published.

## What a publish writes

| Path | Role |
| --- | --- |
| `models/<id>.usdz` | File the app downloads. Public URL `https://superimmersive.io/models/<id>.usdz`. |
| `models/catalog.json` | Examples list. Updated only when the tick changes membership. Other entries are kept. |
| `ar/models/<id>.json` | Deep-link / Ask sidecar the app already fetches for `?model=<id>`. |
| `models/thumbs/<id>.jpg` | Optional studio image. Not a catalog field. The app does not read it. |

The share URL is exactly `https://superimmersive.io/ar?model=<id>`. The QR code on the page encodes that URL and can be downloaded as a PNG before or after publish. The link 404s until Pages has deployed the commit.

Fields match the live catalog:

- `placement`: `floor` or `wall`
- `animated`: yes/no
- `animationMode`: written only when it is `scrub`. Loop is the default and the key is omitted, same as Biplane and Robot. Axel Flux Motor is the scrub example.
- Examples list: there is no hidden flag. Ticked means the object is in `catalog.json`. Unticked means it is removed from that list if it was there. The USDZ and sidecar still publish, so the share link can open it.
- Ask: `name`, `dimensions`, `specText`, and `faq` (`question` / `answer`) go on the catalog entry when it is listed, and always on the sidecar. `details` is sidecar-only, matching the current `ar/models/*.json` files.
- The sidecar also carries `url`, `sizeBytes`, `placement`, and `animated`, so a deep link still has the download URL and surface when the product is not in the examples list.

`test-box`, `biplane`, `robot`, and `axel-flux-motor` are refused. `test-box` is bundled in the app. Leave those files alone.

Leave the USDZ field empty to update text for an id that already has a file on the site. **Load this id from the site** fills the form from `catalog.json` and `ar/models/<id>.json`.

The `/ar` fallback page now points Quick Look at `/models/<id>.usdz`. `test-box` still uses `/ar/models/test-box.usdz`. The App Clip association file is unchanged.

## Test with Local Experience

1. Publish, then wait until `https://superimmersive.io/models/<id>.usdz` downloads in Safari. Pages often takes one to two minutes, sometimes longer. A hard refresh avoids a cached catalog.
2. On the iPhone, enable Developer Mode. Then Settings → Developer → Local Experiences → Register Local Experience.
3. URL prefix: `https://superimmersive.io/ar`
4. Bundle ID: `io.superimmersive.ar.Clip` (the site association lists `U5DGDWXQCP.io.superimmersive.ar.Clip`).
5. Open `https://superimmersive.io/ar?model=<id>` in Safari.
6. Check the surface (floor or wall), the animation (tap-to-loop, or the scrub slider), the Examples list, and an Ask question from the FAQ.

If that App Clip build is already invoked from App Store Connect for this domain, the same share link is enough and Local Experience is only for a build that is not associated yet.

## Caveats

- **File size.** GitHub blocks files over 100 MB and warns over 50 MB. This page refuses a USDZ over 70 MB because the Git Data API upload is base64, about a third larger than the file, and the request has to stay under GitHub’s limit. It warns from 8 MB (slow App Clip) and again from 50 MB. Prefer a few MB. The browser holds the file and the base64 copy in memory while uploading.
- **Repo size.** GitHub Pages is happiest when the whole repository stays small. Large models add up. This path does not use Git LFS, and Pages would not serve LFS pointers as USDZ files anyway.
- **Direct to live.** A publish updates `main` immediately. There is no review commit on a branch. The four example models cannot be replaced from the page.
- **Deploy lag and cache.** The commit can exist on GitHub before superimmersive.io serves the new file. `catalog.json` can stay cached for a short time.
- **One commit, then a retry.** The USDZ, thumbnail, sidecar, and catalog change are one commit, so the catalog does not point at a missing file. If `main` moves during the upload, the page retries once and will not force-push.
- **Token scope.** The token can write every file in this repository, not only `models/`. Keep it fine-grained, on this repo only, and clear it on a shared machine.
- **Thumbnail.** Saved for the studio at `models/thumbs/<id>.jpg`. It is intentionally absent from `catalog.json`.
- **Quick Look MIME.** GitHub Pages does not let us set `model/vnd.usdz+zip`. The app already downloads the example USDZ files from these URLs. The `/ar` button is only the browser fallback when the clip does not open.
- **Authoring.** Spec text is plain text. FAQ rows need both a question and an answer. Empty rows are dropped.
