# Superimmersive AR example models

Served at `https://superimmersive.io/models/` and listed in `catalog.json`, which the
Superimmersive AR app and App Clip read to fill the examples list on the model pill.

## catalog.json

An array of entries:

| field       | meaning                                                              |
|-------------|----------------------------------------------------------------------|
| `id`        | stable identifier (`test-box` is bundled in the app)                 |
| `name`      | label shown in the examples list                                     |
| `url`       | absolute https URL of the USDZ (omitted when `bundled` is true)      |
| `bundled`   | true when the model ships inside the app (no download)               |
| `sizeBytes` | file size, used for the download hint                                |
| `placement` | default surface, `floor` or `wall`                                   |
| `animated`  | true when the USDZ has a baked animation clip                        |
| `animationMode` | `loop` (default) or `scrub` for exploded-view slider              |
| `specText`  | optional plain-text product facts for the Ask chatbot                |
| `faq`        | optional `{question,answer}` array for Ask                           |

Per-model metadata for deep links (`?model=<id>`) also lives at
`https://superimmersive.io/ar/models/<id>.json` (same fields as above plus
`dimensions` / `details`). Mock specs there are for chatbot testing only.

Keep every file under GitHub's 100 MB limit (ideally a few MB for fast App Clip loads).

## Sources and terms

- `biplane.usdz` — "Toy Biplane" (`toy_biplane_realistic.usdz`) from Apple's AR Quick Look gallery,
  https://developer.apple.com/augmented-reality/quick-look/
- `robot.usdz` — "Vintage Robot" (`robot.usdz`) from the same gallery.

These are Apple sample assets. The gallery publishes them for viewing/downloading as examples but
does not state an open licence for redistribution; they remain Apple's property under the Apple
Developer site terms. They are hosted here only as temporary test/demo content for the AR viewer
and should be replaced with Superimmersive-owned or properly licensed models before any public or
commercial promotion.
