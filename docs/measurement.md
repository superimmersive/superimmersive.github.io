# Measurement and the contact form

Nothing in this file is wired to a live account. The public site does not send analytics until the placeholders below are filled in.

## Google Analytics 4

1. Create a GA4 property for `superimmersive.io`.
2. Copy the measurement ID (`G-XXXXXXXXXX`).
3. Set `GA_MEASUREMENT_ID` in `js/measure.js`.
4. Marketing pages already load that file. Until the ID matches `G-…`, the script returns immediately and does not request Google.

`privacy/`, `ar/`, and `tools/` do not load it.

## Plausible instead of GA4

Leave `GA_MEASUREMENT_ID` empty and add this to the `<head>` of each marketing page:

```html
<script defer data-domain="superimmersive.io" src="https://plausible.io/js/script.js"></script>
```

Use the domain exactly as it is configured in Plausible.

## Google Search Console

1. Add the property `https://superimmersive.io/`.
2. Choose the HTML tag method.
3. On the homepage (`index.html`), uncomment the `google-site-verification` meta and replace the token. One tag on the homepage is enough for the domain property.
4. Submit `https://superimmersive.io/sitemap.xml`.

`robots.txt` allows marketing pages, including `/work/` and `/services/`, and points at the sitemap. `/ar/`, `/tools/`, and `/privacy/` stay disallowed. Files under `/models/` stay allowed for the AR app and App Clip.

## Contact form (Formspree)

Every marketing page ends with one form. It currently opens a prefilled email to `devon@superimmersive.io` via `mailto`. GitHub Pages has no server to receive a post, and Formspree needs an ID that only the inbox owner can create.

To switch the form to Formspree:

1. Create a form at [formspree.io](https://formspree.io) that delivers to `devon@superimmersive.io`.
2. Copy the endpoint, shaped like `https://formspree.io/f/xxxxxxxx`.
3. On each `<form class="ask__form">`, set `action` to that endpoint. Leave `method="post"`.
4. `js/main.js` lets the browser submit when the action host is `formspree.io`. Any other action, including `mailto:`, builds the email instead.

Fields already posted: `name`, `email`, `message`, and a hidden `_subject`. Formspree reads those names as-is.
