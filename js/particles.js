/**
 * Screen-space particle overlays for model-viewer (or any two DOM anchors).
 *
 * Jet exhaust lives in SIParticles.presets.jetExhaust — idle haze + start-up embers.
 * Drop a canvas over the viewer, pin two hotspots (origin + direction), then:
 *
 *   SIParticles.attach({
 *     canvas: document.getElementById("jet-particles"),
 *     origin: viewer.querySelector('[slot="hotspot-exhaust"]'),
 *     direction: viewer.querySelector('[slot="hotspot-exhaust-dir"]'),
 *     preset: "jetExhaust",
 *     mode: function () { return viewer.animationName === "start_up_down" ? "start" : "idle"; }
 *   });
 *
 * Other presets: heatHaze, printSparks, scanDust.
 */
(function (global) {
  "use strict";

  var presets = {
    jetExhaust: {
      step: 2.4,
      emberChance: 0.45,
      modes: {
        idle: {
          rate: 0.22,
          jitter: 0.22,
          speed: 1.15,
          spreadX: 8,
          spreadY: 6,
          decayMin: 0.018,
          decaySpan: 0.02,
          emberSize: [1.2, 2.2],
          smokeSize: [5, 10],
          lift: -0.12,
          glowRadius: 22,
          glow: [125, 211, 252, 0.1],
          ember: [255, 154, 72, 0.7],
          smoke: [148, 197, 214, 0.1]
        },
        start: {
          rate: 1.15,
          jitter: 0.38,
          speed: 3.4,
          spreadX: 14,
          spreadY: 12,
          decayMin: 0.012,
          decaySpan: 0.016,
          emberSize: [1.2, 2.2],
          smokeSize: [5, 10],
          lift: -0.12,
          glowRadius: 46,
          glow: [255, 168, 88, 0.28],
          ember: [255, 154, 72, 0.7],
          smoke: [248, 180, 110, 0.12]
        }
      }
    },
    heatHaze: {
      step: 1.8,
      emberChance: 0,
      modes: {
        idle: {
          rate: 0.35,
          jitter: 0.28,
          speed: 0.7,
          spreadX: 10,
          spreadY: 8,
          decayMin: 0.014,
          decaySpan: 0.018,
          emberSize: [1, 1],
          smokeSize: [8, 14],
          lift: -0.35,
          glowRadius: 28,
          glow: [125, 211, 252, 0.12],
          ember: [125, 211, 252, 0.2],
          smoke: [148, 197, 214, 0.11]
        }
      }
    },
    printSparks: {
      step: 3.1,
      emberChance: 0.82,
      modes: {
        idle: {
          rate: 0.55,
          jitter: 0.85,
          speed: 2.2,
          spreadX: 6,
          spreadY: 6,
          decayMin: 0.02,
          decaySpan: 0.03,
          emberSize: [0.8, 1.8],
          smokeSize: [3, 6],
          lift: -0.55,
          glowRadius: 16,
          glow: [255, 196, 92, 0.22],
          ember: [255, 214, 120, 0.85],
          smoke: [248, 180, 110, 0.08]
        }
      }
    },
    scanDust: {
      step: 0.7,
      emberChance: 0.15,
      modes: {
        idle: {
          rate: 0.12,
          jitter: 0.45,
          speed: 0.25,
          spreadX: 120,
          spreadY: 80,
          decayMin: 0.004,
          decaySpan: 0.006,
          emberSize: [0.8, 1.4],
          smokeSize: [2, 4],
          lift: -0.08,
          glowRadius: 0,
          glow: [0, 0, 0, 0],
          ember: [226, 232, 240, 0.55],
          smoke: [148, 163, 184, 0.18]
        }
      }
    }
  };

  function rgba(c, lifeScale) {
    var a = c[3] * (lifeScale == null ? 1 : lifeScale);
    return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + a.toFixed(3) + ")";
  }

  function range(pair) {
    return pair[0] + Math.random() * pair[1];
  }

  function hotspotXY(el, view) {
    var spot = el.getBoundingClientRect();
    return {
      x: spot.left + spot.width / 2 - view.left,
      y: spot.top + spot.height / 2 - view.top
    };
  }

  function attach(opts) {
    var canvas = opts.canvas;
    var originEl = opts.origin;
    var dirEl = opts.direction || opts.origin;
    var presetName = opts.preset || "jetExhaust";
    var getMode = typeof opts.mode === "function" ? opts.mode : function () { return opts.mode || "idle"; };
    if (!canvas || !canvas.getContext || !originEl) return null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;

    var ctx = canvas.getContext("2d");
    var particles = [];
    var spawnCarry = 0;
    var running = true;
    var currentPreset = presets[presetName] || presets.jetExhaust;

    function resize() {
      var box = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(box.width * dpr));
      canvas.height = Math.max(1, Math.floor(box.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function look() {
      var mode = getMode();
      return currentPreset.modes[mode] || currentPreset.modes.idle || currentPreset.modes.start;
    }

    function spawn(origin, dirX, dirY, style) {
      var kind = Math.random();
      var ember = kind < currentPreset.emberChance;
      var speed = style.speed * (0.7 + Math.random() * 0.7);
      particles.push({
        x: origin.x + (Math.random() - 0.5) * style.spreadX,
        y: origin.y + (Math.random() - 0.5) * style.spreadY,
        vx: dirX * speed + (Math.random() - 0.5) * style.jitter,
        vy: dirY * speed + (Math.random() - 0.5) * style.jitter + style.lift,
        life: 1,
        decay: style.decayMin + Math.random() * style.decaySpan,
        size: ember ? range(style.emberSize) : range(style.smokeSize),
        ember: ember
      });
    }

    function tick() {
      if (!running) return;
      var box = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(box.width * dpr)) resize();
      var origin = hotspotXY(originEl, box);
      var ahead = hotspotXY(dirEl, box);
      var dx = ahead.x - origin.x;
      var dy = ahead.y - origin.y;
      var len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      var style = look();
      spawnCarry += style.rate;
      while (spawnCarry >= 1) {
        spawn(origin, dx, dy, style);
        spawnCarry -= 1;
      }
      ctx.clearRect(0, 0, box.width, box.height);
      ctx.globalCompositeOperation = "lighter";
      if (style.glowRadius > 0) {
        var glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, style.glowRadius);
        glow.addColorStop(0, rgba(style.glow));
        glow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, style.glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * currentPreset.step;
        p.y += p.vy * currentPreset.step;
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.fillStyle = rgba(p.ember ? style.ember : style.smoke, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(tick);

    return {
      preset: function (name) {
        if (presets[name]) currentPreset = presets[name];
      },
      stop: function () {
        running = false;
        window.removeEventListener("resize", resize);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }

  global.SIParticles = {
    presets: presets,
    attach: attach
  };
})(window);
