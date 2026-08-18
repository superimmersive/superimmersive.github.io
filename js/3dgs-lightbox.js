(function () {
  "use strict";

  var LIB_URL = "https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.module.js";
  var libPromise = null;

  var SCENES = {
    bonsai: {
      url: "../assets/products/3dgs-demos/bonsai-7k-mini.splat",
      cameraUp: [0, -1, -0.6],
      cameraPosition: [-1, -4, 6],
      cameraLookAt: [0, 4, 0],
      sphericalHarmonicsDegree: 0,
    },
    room: {
      url: "../assets/products/3dgs-demos/room.splat",
      cameraUp: [0, -1, 0],
      cameraPosition: [0, 2, 6],
      cameraLookAt: [0, 0, 0],
      sphericalHarmonicsDegree: 0,
    },
    train: {
      url: "../assets/products/3dgs-demos/train.splat",
      cameraUp: [0, -1, 0.16],
      cameraPosition: [-3.01, -0.11, -3.75],
      cameraLookAt: [0, 0.2, 0],
      sphericalHarmonicsDegree: 0,
    },
  };

  function loadLibrary() {
    if (!libPromise) {
      libPromise = import(LIB_URL);
    }
    return libPromise;
  }

  function formatFromUrl(url, GS) {
    var lower = (url || "").toLowerCase();
    if (lower.endsWith(".ply")) return GS.SceneFormat.Ply;
    if (lower.endsWith(".ksplat")) return GS.SceneFormat.KSplat;
    return GS.SceneFormat.Splat;
  }

  function bufferToSplat(buffer, url, shDegree, GS) {
    var format = formatFromUrl(url, GS);
    if (format === GS.SceneFormat.Ply) {
      return GS.PlyLoader.loadFromFileData(buffer, 5, 0, false, shDegree || 0);
    }
    if (format === GS.SceneFormat.KSplat) {
      return GS.KSplatLoader.loadFromFileData(buffer);
    }
    return GS.SplatLoader.loadFromFileData(buffer, 5, 0, false);
  }

  function fetchSplatBuffer(url, signal, onProgress) {
    return fetch(url, { signal: signal }).then(function (response) {
      if (!response.ok) {
        throw new Error("Could not download scene (" + response.status + ")");
      }

      var total = Number(response.headers.get("content-length")) || 0;
      if (!response.body || !total) {
        return response.arrayBuffer();
      }

      var reader = response.body.getReader();
      var chunks = [];
      var received = 0;

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            var out = new Uint8Array(received);
            var offset = 0;
            for (var i = 0; i < chunks.length; i++) {
              out.set(chunks[i], offset);
              offset += chunks[i].byteLength;
            }
            return out.buffer;
          }

          chunks.push(result.value);
          received += result.value.byteLength;
          if (onProgress) {
            onProgress(Math.min(99, Math.round((received / total) * 100)));
          }
          return pump();
        });
      }

      return pump();
    });
  }

  var panels = document.querySelectorAll(".panel--3dgs");
  if (!panels.length) return;

  var activePanel = null;
  var viewer = null;
  var abort = null;

  function getParts(panel) {
    return {
      poster: panel.querySelector(".panel__poster"),
      viewport: panel.querySelector(".panel__viewport"),
      host: panel.querySelector(".panel__splat-host"),
      loading: panel.querySelector(".panel__loading"),
      loadingText: panel.querySelector(".panel__loading-text"),
      fullscreen: panel.querySelector(".panel__fullscreen"),
    };
  }

  function setLoading(panel, active, message, isError) {
    var parts = getParts(panel);
    if (!parts.loading) return;

    panel.classList.toggle("is-loading", active);
    parts.loading.hidden = !active;

    if (parts.loadingText && message) {
      parts.loadingText.textContent = message;
    }

    parts.loading.classList.toggle("panel__loading--error", !!isError);
  }

  function setFullscreenLabel(button, isFullscreen) {
    if (!button) return;
    button.classList.toggle("is-fullscreen", isFullscreen);
    button.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "View fullscreen");
  }

  function toggleFullscreen(parts) {
    if (!parts.viewport) return;

    if (document.fullscreenElement === parts.viewport) {
      document.exitFullscreen().catch(function () {});
      return;
    }

    parts.viewport.requestFullscreen().catch(function (err) {
      console.error(err);
    });
  }

  function disposeViewer() {
    if (abort) {
      abort.abort();
      abort = null;
    }
    if (viewer) {
      if (viewer.stop) viewer.stop();
      if (viewer.dispose) viewer.dispose().catch(function () {});
      viewer = null;
    }
    if (activePanel) {
      getParts(activePanel).host.innerHTML = "";
    }
  }

  function closePanel(panel) {
    if (!panel) return;

    var parts = getParts(panel);

    if (document.fullscreenElement === parts.viewport) {
      document.exitFullscreen().catch(function () {});
    }

    panel.classList.remove("is-viewing");
    parts.poster.hidden = false;
    parts.viewport.hidden = true;
    setLoading(panel, false);

    if (activePanel === panel) {
      disposeViewer();
      activePanel = null;
    }
  }

  function openPanel(panel) {
    var sceneId = panel.getAttribute("data-scene");
    var scene = SCENES[sceneId];
    if (!scene) return;

    if (activePanel === panel && panel.classList.contains("is-viewing")) {
      return;
    }

    if (activePanel && activePanel !== panel) {
      closePanel(activePanel);
    }

    activePanel = panel;
    var parts = getParts(panel);

    panel.classList.add("is-viewing");
    parts.poster.hidden = true;
    parts.viewport.hidden = false;
    parts.host.innerHTML = "";
    setLoading(panel, true, "Opening viewer…");

    disposeViewer();
    abort = new AbortController();

    loadLibrary()
      .then(function (mod) {
        setLoading(panel, true, "Loading splats…");
        return fetchSplatBuffer(scene.url, abort.signal, function (pct) {
          setLoading(panel, true, "Loading splats… " + pct + "%");
        }).then(function (buffer) {
          return { GS: mod, buffer: buffer };
        });
      })
      .then(function (payload) {
        if (abort.signal.aborted || activePanel !== panel) return;

        setLoading(panel, true, "Preparing scene…");

        viewer = new payload.GS.Viewer({
          rootElement: parts.host,
          cameraUp: scene.cameraUp,
          initialCameraPosition: scene.cameraPosition,
          initialCameraLookAt: scene.cameraLookAt,
          sharedMemoryForWorkers: false,
          gpuAcceleratedSort: false,
          sphericalHarmonicsDegree: scene.sphericalHarmonicsDegree || 0,
          antialiased: true,
        });

        return bufferToSplat(
          payload.buffer,
          scene.url,
          scene.sphericalHarmonicsDegree,
          payload.GS
        ).then(function (splatBuffer) {
          return viewer.addSplatBuffers(
            [splatBuffer],
            [{ splatAlphaRemovalThreshold: 5 }],
            true,
            false,
            false
          );
        });
      })
      .then(function () {
        if (abort && abort.signal.aborted) return;
        if (activePanel !== panel) return;
        if (viewer) viewer.start();
        setLoading(panel, false);
      })
      .catch(function (err) {
        if (abort && abort.signal.aborted) return;
        if (activePanel !== panel) return;
        console.error(err);
        setLoading(
          panel,
          true,
          err && err.message ? err.message : "Could not load this scene.",
          true
        );
      });
  }

  panels.forEach(function (panel) {
    var parts = getParts(panel);

    parts.poster.addEventListener("click", function () {
      openPanel(panel);
    });

    if (parts.fullscreen) {
      parts.fullscreen.addEventListener("click", function (event) {
        event.stopPropagation();
        toggleFullscreen(parts);
      });
    }
  });

  document.addEventListener("fullscreenchange", function () {
    panels.forEach(function (panel) {
      var parts = getParts(panel);
      setFullscreenLabel(parts.fullscreen, document.fullscreenElement === parts.viewport);
    });
  });
})();
