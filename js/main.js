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

  var coarsePointer = window.matchMedia("(hover: none)");
  var lastFocus = null;
  var lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML =
    '<figure class="lightbox__figure">' +
    '<button type="button" class="lightbox__close">Close</button>' +
    '<div class="lightbox__stage">' +
    '<button type="button" class="lightbox__nav lightbox__nav--prev" aria-label="Previous still">‹</button>' +
    '<img class="lightbox__img" alt="">' +
    '<video class="lightbox__video" controls playsinline hidden></video>' +
    '<button type="button" class="lightbox__nav lightbox__nav--next" aria-label="Next still">›</button>' +
    "</div>" +
    '<figcaption class="lightbox__caption"></figcaption>' +
    "</figure>";
  document.body.appendChild(lightbox);

  var lightboxImg = lightbox.querySelector(".lightbox__img");
  var lightboxVideo = lightbox.querySelector(".lightbox__video");
  var lightboxCaption = lightbox.querySelector(".lightbox__caption");
  var closeBtn = lightbox.querySelector(".lightbox__close");
  var prevBtn = lightbox.querySelector(".lightbox__nav--prev");
  var nextBtn = lightbox.querySelector(".lightbox__nav--next");
  var activeTile = null;
  var shotManifest = fetch("assets/clients/manifest.json", { cache: "no-store" })
    .then(function (res) { return res.ok ? res.json() : {}; })
    .catch(function () { return {}; });

  function stopLightboxVideo() {
    if (!lightboxVideo) return;
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    lightboxVideo.load();
  }

  function closeLightbox() {
    stopLightboxVideo();
    lightboxVideo.hidden = true;
    lightboxImg.hidden = false;
    lightbox.hidden = true;
    activeTile = null;
    lightbox.classList.remove("lightbox--float", "has-nav");
    document.body.classList.remove("is-lightbox-open");
    if (lastFocus) lastFocus.focus();
  }

  function shotList(tile) {
    var track = tile && tile.parentElement;
    if (!track) return [];
    return Array.prototype.filter.call(track.children, function (el) {
      return el.classList.contains("client__tile") && el.getAttribute("data-src");
    });
  }

  function showTile(tile) {
    if (!tile) return;
    stopLightboxVideo();
    activeTile = tile;
    var src = tile.getAttribute("data-src");
    var kind = tile.getAttribute("data-kind") || "image";
    var label = tile.getAttribute("data-caption") || tile.getAttribute("aria-label") || "";
    lightboxCaption.textContent = label;
    if (kind === "video") {
      lightboxImg.hidden = true;
      lightboxVideo.hidden = false;
      lightboxVideo.src = src;
      lightboxVideo.play().catch(function () {});
    } else {
      lightboxVideo.hidden = true;
      lightboxImg.hidden = false;
      lightboxImg.src = src;
      lightboxImg.alt = label;
    }
    lightbox.classList.toggle("has-nav", shotList(tile).length > 1);
  }

  function stepShot(dir) {
    var shots = shotList(activeTile);
    if (shots.length < 2) return;
    var index = shots.indexOf(activeTile);
    showTile(shots[(index + dir + shots.length) % shots.length]);
  }

  function openLightbox(img, label, asPanel, tile) {
    lastFocus = document.activeElement;
    lightbox.classList.toggle("lightbox--float", !!asPanel);
    if (asPanel && tile) {
      showTile(tile);
    } else {
      activeTile = null;
      lightbox.classList.remove("has-nav");
      stopLightboxVideo();
      lightboxVideo.hidden = true;
      lightboxImg.hidden = false;
      lightboxImg.src = img.currentSrc || img.src;
      lightboxImg.alt = img.alt;
      lightboxCaption.textContent = label || img.alt;
    }
    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
    closeBtn.focus();
  }

  function mediaUrl(slug, file) {
    return "assets/clients/" + slug + "/" + encodeURIComponent(file);
  }

  function captionFor(name, file, kind) {
    var base = file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    if (/^\d+$/.test(base)) {
      return name + " — " + (kind === "video" ? "video " : "still ") + base;
    }
    return name + " — " + base;
  }

  function bindTileOpen(tile, film) {
    tile.addEventListener("click", function (event) {
      if (film.classList.contains("is-drag-suppress") || film.classList.contains("is-dragging")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!tile.classList.contains("is-shot")) return;
      event.preventDefault();
      event.stopPropagation();
      openLightbox(null, null, true, tile);
    });
    tile.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!tile.classList.contains("is-shot")) return;
      event.preventDefault();
      event.stopPropagation();
      tile.click();
    });
  }

  function makeMediaTile(slug, name, item, index, film) {
    var tile = document.createElement("figure");
    var label = captionFor(name, item.file, item.kind);
    var src = mediaUrl(slug, item.file);
    tile.className = "client__tile is-shot" + (item.kind === "video" ? " is-video" : "");
    tile.setAttribute("data-kind", item.kind);
    tile.setAttribute("data-src", src);
    tile.setAttribute("data-caption", label);
    tile.setAttribute("data-label", String(index + 1).padStart(2, "0"));
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.setAttribute("aria-label", "View " + label);
    if (item.kind === "video") {
      var video = document.createElement("video");
      video.src = src;
      video.muted = true;
      video.preload = "metadata";
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.addEventListener("loadedmetadata", function () {
        try { if (video.currentTime < 0.05) video.currentTime = 0.1; } catch (err) {}
      });
      var badge = document.createElement("span");
      badge.className = "client__play";
      badge.setAttribute("aria-hidden", "true");
      tile.appendChild(video);
      tile.appendChild(badge);
    } else {
      var img = document.createElement("img");
      img.alt = label;
      img.src = src;
      tile.appendChild(img);
    }
    bindTileOpen(tile, film);
    return tile;
  }

  function setPlaceholder(tile, name, n) {
    var img = new Image();
    img.alt = name + " — still " + n;
    img.onload = function () {
      tile.classList.remove("is-empty");
      tile.classList.add("is-shot", "is-placeholder");
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", "View " + img.alt);
      tile.setAttribute("data-kind", "image");
      tile.setAttribute("data-src", img.src);
      tile.setAttribute("data-caption", img.alt);
      tile.replaceChildren(img);
    };
    img.src = "assets/clients/placeholder.jpg";
  }

  function bindFilmDrag(film) {
    var track = film && film.querySelector(".client__film-track");
    if (!track) return;

    var x = 0;
    var v = 0;
    var dragging = false;
    var moved = false;
    var lastPX = 0;
    var lastT = 0;
    var startPX = 0;
    var startPY = 0;
    var raf = 0;
    var lastFrame = 0;
    var maxSpeed = 2800;
    var suppressTimer = 0;
    var dragSlop = 10;
    var pressTile = null;

    function minX() {
      return Math.min(0, film.clientWidth - track.scrollWidth);
    }

    function clamp(n, lo, hi) {
      return Math.max(lo, Math.min(hi, n));
    }

    function rubber(n, lo, hi) {
      if (n > hi) {
        var over = n - hi;
        return hi + (over * 0.45) / (1 + over / 150);
      }
      if (n < lo) {
        over = lo - n;
        return lo - (over * 0.45) / (1 + over / 150);
      }
      return n;
    }

    function render() {
      var vis = dragging ? rubber(x, minX(), 0) : x;
      track.style.transform = "translate3d(" + vis + "px,0,0)";
    }

    function settle() {
      x = clamp(x, minX(), 0);
      v = 0;
      lastFrame = 0;
      render();
    }

    function tick(now) {
      raf = 0;
      if (dragging) return;
      var dt = lastFrame ? Math.min(32, now - lastFrame) : 16.67;
      lastFrame = now;
      var seconds = dt / 1000;
      var lo = minX();
      var dest = clamp(x, lo, 0);
      var over = x !== dest;

      if (over) {
        var omega = 17;
        var zeta = 0.62;
        v += (-omega * omega * (x - dest) - 2 * zeta * omega * v) * seconds;
        x += v * seconds;
        if (Math.abs(x - dest) < 0.35 && Math.abs(v) < 18) {
          settle();
          return;
        }
      } else {
        x += v * seconds;
        v *= Math.pow(0.91, dt / 16.67);
        if (Math.abs(v) < 16) {
          settle();
          return;
        }
      }

      v = clamp(v, -maxSpeed, maxSpeed);
      render();
      raf = requestAnimationFrame(tick);
    }

    function kick() {
      if (raf || dragging) return;
      lastFrame = 0;
      raf = requestAnimationFrame(tick);
    }

    function suppressClicks() {
      film.classList.add("is-drag-suppress");
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(function () {
        film.classList.remove("is-drag-suppress");
      }, 450);
    }

    function wasDrag(event) {
      return moved || film.classList.contains("is-drag-suppress") || film.classList.contains("is-dragging");
    }

    film.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      dragging = true;
      moved = false;
      v = 0;
      pressTile = event.target.closest(".client__tile");
      lastPX = event.clientX;
      startPX = event.clientX;
      startPY = event.clientY;
      lastT = performance.now();
      try { film.setPointerCapture(event.pointerId); } catch (err) {}
    });

    film.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      var now = performance.now();
      var dx = event.clientX - lastPX;
      var dt = Math.max(8, now - lastT);
      lastPX = event.clientX;
      lastT = now;
      if (!moved) {
        if (Math.hypot(event.clientX - startPX, event.clientY - startPY) <= dragSlop) return;
        moved = true;
        film.classList.add("is-dragging");
        x += event.clientX - startPX;
        render();
        return;
      }
      x += dx;
      if (Math.abs(dx) > 0.1) {
        v = clamp(v * 0.4 + (dx / dt) * 1000 * 0.6, -maxSpeed, maxSpeed);
      }
      render();
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      film.classList.remove("is-dragging");
      var tile = pressTile;
      pressTile = null;
      var openShot = !moved && event && event.type === "pointerup" && tile;
      if (moved) suppressClicks();
      var lo = minX();
      if (x > 0 || x < lo) v *= 0.38;
      x = rubber(x, lo, 0);
      if (performance.now() - lastT > 48) v = 0;
      kick();
      if (!openShot) return;
      if (!tile.classList.contains("is-shot")) return;
      suppressClicks();
      openLightbox(null, null, true, tile);
    }

    film.addEventListener("pointerup", endDrag);
    film.addEventListener("pointercancel", endDrag);
    film.addEventListener("lostpointercapture", function () {
      if (!dragging) return;
      endDrag({ type: "lostpointercapture" });
    });
    film.addEventListener("click", function (event) {
      if (!wasDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    film.addEventListener("wheel", function (event) {
      if (track.scrollWidth <= film.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      v -= event.deltaY * 18;
      kick();
    }, { passive: false });
  }

  function loadClientShots(client) {
    if (client.dataset.shotsReady) return;
    client.dataset.shotsReady = "1";
    var slug = client.getAttribute("data-shots");
    var name = ((client.querySelector("dt") || {}).textContent || "Client").trim();
    var film = client.querySelector(".client__film");
    var track = client.querySelector(".client__film-track");
    shotManifest.then(function (manifest) {
      var items = (manifest && manifest[slug]) || [];
      if (!items.length || !track) return;
      track.innerHTML = "";
      items.forEach(function (item, index) {
        track.appendChild(makeMediaTile(slug, name, item, index, film));
      });
    });
  }

  document.querySelectorAll(".client[data-shots]").forEach(function (client) {
    var shots = document.createElement("div");
    shots.className = "client__shots";
    var tiles = "";
    for (var n = 1; n <= 5; n++) {
      tiles += '<figure class="client__tile is-empty" data-label="0' + n + '"></figure>';
    }
    shots.innerHTML =
      '<div class="client__shots-inner"><div class="client__film"><div class="client__film-track">' + tiles + "</div></div></div>";
    client.appendChild(shots);
    var film = shots.querySelector(".client__film");
    var name = (client.querySelector("dt") || {}).textContent || "Client";
    bindFilmDrag(film);
    shots.querySelectorAll(".client__tile").forEach(function (tile, index) {
      setPlaceholder(tile, name.trim(), String(index + 1).padStart(2, "0"));
      bindTileOpen(tile, film);
    });
    client.setAttribute("tabindex", "0");
    client.setAttribute("aria-expanded", "false");

    client.addEventListener("mouseenter", function () {
      loadClientShots(client);
    });
    client.addEventListener("focus", function () {
      loadClientShots(client);
    });
    client.addEventListener("click", function () {
      if (!coarsePointer.matches) return;
      var open = !client.classList.contains("is-open");
      document.querySelectorAll(".client.is-open").forEach(function (other) {
        if (other !== client) {
          other.classList.remove("is-open");
          other.setAttribute("aria-expanded", "false");
        }
      });
      client.classList.toggle("is-open", open);
      client.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) loadClientShots(client);
    });
    client.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      var open = !client.classList.contains("is-open");
      client.classList.toggle("is-open", open);
      client.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) loadClientShots(client);
    });
  });

  document.querySelectorAll(".panel__frame--zoom").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var img = btn.querySelector("img");
      if (!img) return;
      var label = btn.getAttribute("aria-label") || img.alt;
      openLightbox(img, label.replace(/^View larger:\s*/i, ""), false);
    });
  });

  closeBtn.addEventListener("click", closeLightbox);
  prevBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    stepShot(-1);
  });
  nextBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    stepShot(1);
  });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (event) {
    if (lightbox.hidden) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepShot(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepShot(1);
    }
  });

  (function initPlaylists() {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll("video[data-playlist]").forEach(function (video) {
      var clips = (video.getAttribute("data-playlist") || "")
        .split("|")
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
      if (!clips.length) return;

      var index = 0;
      video.muted = true;
      video.playsInline = true;
      video.loop = clips.length === 1;

      function show(i) {
        video.src = clips[i];
        video.load();
        if (!reduced) {
          video.play().catch(function () {});
        }
      }

      video.addEventListener("ended", function () {
        if (clips.length < 2) return;
        index = (index + 1) % clips.length;
        show(index);
      });

      show(0);
    });
  })();
})();
