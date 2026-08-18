(function () {
  "use strict";

  var chrome = document.querySelector(".chrome");

  function onScroll() {
    if (chrome) chrome.classList.toggle("is-on", window.scrollY > 24);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  document.querySelectorAll(".panel--gallery").forEach(function (panel) {
    var stage = panel.querySelector(".print-stage");
    if (!stage) return;
    panel.querySelectorAll(".print-thumb").forEach(function (thumb) {
      thumb.addEventListener("click", function (event) {
        event.preventDefault();
        var img = thumb.querySelector("img");
        var src = thumb.getAttribute("href") || (img && img.getAttribute("src"));
        if (!src || !img) return;
        stage.src = src;
        stage.alt = img.alt;
        panel.querySelectorAll(".print-thumb").forEach(function (other) {
          other.classList.toggle("is-on", other === thumb);
        });
      });
    });
  });

  var zoomButtons = document.querySelectorAll(".panel__frame--zoom");
  if (!zoomButtons.length) return;

  var lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML =
    '<figure class="lightbox__figure">' +
    '<button type="button" class="lightbox__close">Close</button>' +
    '<img class="lightbox__img" alt="">' +
    '<figcaption class="lightbox__caption"></figcaption>' +
    "</figure>";
  document.body.appendChild(lightbox);

  var lightboxImg = lightbox.querySelector(".lightbox__img");
  var lightboxCaption = lightbox.querySelector(".lightbox__caption");
  var closeBtn = lightbox.querySelector(".lightbox__close");
  var lastFocus = null;

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove("is-lightbox-open");
    if (lastFocus) lastFocus.focus();
  }

  function openLightbox(img, label) {
    lastFocus = document.activeElement;
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightboxCaption.textContent = label || img.alt;
    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
    closeBtn.focus();
  }

  zoomButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var img = btn.querySelector("img");
      if (!img) return;
      var label = btn.getAttribute("aria-label") || img.alt;
      openLightbox(img, label.replace(/^View larger:\s*/i, ""));
    });
  });

  closeBtn.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.hidden) return;
    if (event.key === "Escape") closeLightbox();
  });
})();
