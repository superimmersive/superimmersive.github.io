/* Measurement placeholder.
   TODO: set GA_MEASUREMENT_ID to the GA4 ID (starts with G-) to load Google Analytics.
   Leave it empty and this file does nothing — no request is sent.
   Plausible, Search Console, and Formspree steps are in docs/measurement.md. */
(function () {
  "use strict";

  var GA_MEASUREMENT_ID = ""; // TODO: e.g. "G-XXXXXXXXXX"

  if (!GA_MEASUREMENT_ID || !/^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID)) return;

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_MEASUREMENT_ID);
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);
})();
