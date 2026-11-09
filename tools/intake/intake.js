/* Studio intake for Superimmersive AR models.
   Publish path: the browser calls the GitHub Git Data API and makes one commit
   on the default branch. The page does not ask for a token. Catalog fields match
   models/catalog.json. Ask text is mirrored onto ar/models/<id>.json, which is
   the deep-link sidecar the app already fetches. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SIIntake = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var SITE = "https://superimmersive.io";
  var GITHUB = {
    owner: "superimmersive",
    repo: "superimmersive.github.io",
    api: "https://api.github.com"
  };
  var RESERVED_IDS = ["test-box", "biplane", "robot", "axel-flux-motor"];
  var WARN_BYTES = 8 * 1024 * 1024;
  var STRONG_WARN_BYTES = 50 * 1024 * 1024;
  var MAX_BYTES = 70 * 1024 * 1024;
  var MAX_THUMB_BYTES = 5 * 1024 * 1024;

  function IntakeError(message, status) {
    this.name = "IntakeError";
    this.message = message;
    this.status = status || 0;
  }
  IntakeError.prototype = Object.create(Error.prototype);

  function repoUrl(path) {
    return GITHUB.api + "/repos/" + GITHUB.owner + "/" + GITHUB.repo + path;
  }

  function modelUrl(id) {
    return SITE + "/models/" + id + ".usdz";
  }

  function shareUrl(id) {
    return SITE + "/ar?model=" + id;
  }

  function sidecarUrl(id) {
    return SITE + "/ar/models/" + id + ".json";
  }

  function thumbUrl(id) {
    return SITE + "/models/thumbs/" + id + ".jpg";
  }

  function slugify(name) {
    return String(name || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  function validateId(id) {
    if (!id) return "Enter an id.";
    if (id.length > 64) return "Keep the id to 64 characters.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      return "Use lowercase letters, numbers, and single hyphens.";
    }
    if (RESERVED_IDS.indexOf(id) !== -1) {
      return "“" + id + "” is an existing example (" + RESERVED_IDS.join(", ") + ") and stays as it is.";
    }
    return "";
  }

  function normalizeFaq(rows) {
    var out = [];
    (rows || []).forEach(function (row) {
      var question = String((row && row.question) || "").trim();
      var answer = String((row && row.answer) || "").trim();
      if (!question && !answer) return;
      if (!question || !answer) {
        throw new IntakeError("Each FAQ row needs both a question and an answer.");
      }
      out.push({ question: question, answer: answer });
    });
    return out;
  }

  function stringifyJson(value) {
    var json = JSON.stringify(value, null, 2);
    var escaped = json.replace(/[\u007f-\uffff]/g, function (ch) {
      return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    });
    return escaped + "\n";
  }

  function buildCatalogEntry(input) {
    var entry = {
      id: input.id,
      name: input.name,
      url: modelUrl(input.id),
      sizeBytes: input.sizeBytes,
      placement: input.placement,
      animated: input.animated
    };
    if (input.animated && input.animationMode === "scrub") entry.animationMode = "scrub";
    if (input.specText) entry.specText = input.specText;
    if (input.faq && input.faq.length) entry.faq = input.faq;
    if (input.dimensions) entry.dimensions = input.dimensions;
    return entry;
  }

  function buildSidecar(input) {
    var doc = {
      id: input.id,
      name: input.name,
      url: modelUrl(input.id),
      sizeBytes: input.sizeBytes,
      placement: input.placement,
      animated: input.animated
    };
    if (input.animated && input.animationMode === "scrub") doc.animationMode = "scrub";
    doc.dimensions = input.dimensions || "";
    doc.details = input.details || "";
    doc.specText = input.specText || "";
    doc.faq = input.faq || [];
    return doc;
  }

  function prepareModel(input) {
    var id = String(input.id || "").trim();
    var idError = validateId(id);
    if (idError) throw new IntakeError(idError);
    var name = String(input.name || "").trim();
    if (!name) throw new IntakeError("Enter a product name.");
    if (input.placement !== "floor" && input.placement !== "wall") {
      throw new IntakeError("Placement must be floor or wall.");
    }
    var animated = Boolean(input.animated);
    var animationMode = input.animationMode === "scrub" ? "scrub" : "loop";
    if (input.animationMode && input.animationMode !== "loop" && input.animationMode !== "scrub") {
      throw new IntakeError("Animation mode must be loop or scrub.");
    }
    var sizeBytes = Number(input.sizeBytes);
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
      throw new IntakeError("Model size is missing.");
    }
    var prepared = {
      id: id,
      name: name,
      sizeBytes: sizeBytes,
      placement: input.placement,
      animated: animated,
      animationMode: animationMode,
      specText: String(input.specText || "").trim(),
      dimensions: String(input.dimensions || "").trim(),
      details: String(input.details || "").trim(),
      faq: normalizeFaq(input.faq),
      listInExamples: input.listInExamples !== false
    };
    prepared.entry = buildCatalogEntry(prepared);
    prepared.sidecar = buildSidecar(prepared);
    prepared.shareUrl = shareUrl(id);
    prepared.modelUrl = modelUrl(id);
    prepared.sidecarUrl = sidecarUrl(id);
    prepared.thumbUrl = thumbUrl(id);
    return prepared;
  }

  function applyCatalog(catalogText, entry, listInExamples) {
    var catalog = JSON.parse(catalogText);
    if (!Array.isArray(catalog)) throw new IntakeError("catalog.json is not a list.");
    var matches = catalog.filter(function (item) { return item && item.id === entry.id; });
    if (matches.length > 1) {
      throw new IntakeError("catalog.json lists “" + entry.id + "” more than once. Fix that on GitHub before publishing.");
    }
    var index = catalog.findIndex(function (item) { return item && item.id === entry.id; });
    if (index !== -1 && catalog[index].bundled) {
      throw new IntakeError("That model is bundled in the app and cannot be changed from here.");
    }
    if (!listInExamples && index === -1) {
      return { text: catalogText, changed: false, action: "unchanged" };
    }
    var next;
    var action;
    if (listInExamples) {
      next = catalog.slice();
      if (index === -1) {
        next.push(entry);
        action = "add";
      } else {
        next[index] = entry;
        action = "update";
      }
    } else {
      next = catalog.filter(function (item) { return !item || item.id !== entry.id; });
      action = "remove";
    }
    var text = stringifyJson(next);
    var changed = text !== catalogText;
    return { text: text, changed: changed, action: changed ? action : "unchanged" };
  }

  function bytesToBase64(bytes) {
    var chunk = 0x8000;
    var binary = "";
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function decodeBase64ToString(b64) {
    var clean = String(b64 || "").replace(/\s/g, "");
    if (typeof Buffer !== "undefined" && Buffer.from) {
      return Buffer.from(clean, "base64").toString("utf8");
    }
    var binary = atob(clean);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function sizeWarning(bytes) {
    if (bytes > MAX_BYTES) {
      return "This USDZ is " + formatBytes(bytes) + ". The page stops at 70 MB so the GitHub request stays under the API limit. GitHub itself blocks files over 100 MB and warns over 50 MB. Aim for a few MB so the App Clip download stays quick.";
    }
    if (bytes >= STRONG_WARN_BYTES) {
      return "This USDZ is " + formatBytes(bytes) + ". GitHub warns on files over 50 MB, and an App Clip download this large will feel slow.";
    }
    if (bytes >= WARN_BYTES) {
      return "This USDZ is " + formatBytes(bytes) + ". The catalog note asks for a few MB so App Clip loads stay quick. Publishing still works.";
    }
    return "";
  }

  async function gh(fetchImpl, token, url, options) {
    if (url.indexOf(GITHUB.api + "/") !== 0) {
      throw new IntakeError("Refusing to send the token anywhere but api.github.com.");
    }
    var opts = options || {};
    var headers = {
      Accept: opts.accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (token) headers.Authorization = "Bearer " + token;
    if (opts.body) headers["Content-Type"] = "application/json";
    var res;
    try {
      res = await fetchImpl(url, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store"
      });
    } catch (error) {
      throw new IntakeError("Could not reach GitHub. Check the connection, then try again.");
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (ignore) { data = text; }
    }
    if (!res.ok) {
      var message = data && data.message ? data.message : (res.status + " " + res.statusText);
      throw new IntakeError("GitHub " + res.status + ": " + message, res.status);
    }
    return data;
  }

  async function verifyToken(token, fetchImpl) {
    var trimmed = String(token || "").trim();
    if (!trimmed) throw new IntakeError("Paste a GitHub token.");
    var caller = fetchImpl || fetch;
    var user = await gh(caller, trimmed, GITHUB.api + "/user");
    var repo = await gh(caller, trimmed, repoUrl(""));
    if (repo.permissions && repo.permissions.push === false) {
      throw new IntakeError("That token can see the repo but cannot push. Set Contents to Read and write.");
    }
    if (!repo.default_branch) throw new IntakeError("GitHub did not say which branch the site publishes from.");
    return { login: user.login, branch: repo.default_branch, token: trimmed };
  }

  function commitMessage(prepared, updating) {
    var verb = updating ? "Update" : "Publish";
    var list = prepared.listInExamples ? "Listed in the app Examples." : "Hidden from the Examples list.";
    return verb + " AR model " + prepared.id + "\n\n" + prepared.name + ". " + list;
  }

  async function publishModel(options) {
    var token = String(options.token || "").trim();
    var fetchImpl = options.fetch || fetch;
    var onStatus = options.onStatus || function () {};
    var modelBytes = options.modelBytes || null;
    var thumbBytes = options.thumbBytes || null;
    if (modelBytes && modelBytes.length > MAX_BYTES) throw new IntakeError(sizeWarning(modelBytes.length));
    if (thumbBytes && thumbBytes.length > MAX_THUMB_BYTES) {
      throw new IntakeError("The thumbnail is over 5 MB after conversion. Use a smaller image.");
    }

    onStatus("Checking the live site…");
    var auth;
    if (token) {
      auth = await verifyToken(token, fetchImpl);
      token = auth.token;
    } else {
      var repo = await gh(fetchImpl, "", repoUrl(""));
      if (!repo.default_branch) throw new IntakeError("GitHub did not say which branch the site publishes from.");
      var ownerLogin = repo.owner && repo.owner.login ? repo.owner.login : GITHUB.owner;
      auth = { login: ownerLogin, branch: repo.default_branch, token: "" };
    }
    var branch = auth.branch;

    for (var attempt = 0; attempt < 2; attempt++) {
      onStatus("Reading the live catalog…");
      var ref = await gh(fetchImpl, token, repoUrl("/git/ref/heads/" + branch));
      var parentSha = ref && ref.object && ref.object.sha;
      if (!parentSha) throw new IntakeError("GitHub did not return the current site commit.");
      var parent = await gh(fetchImpl, token, repoUrl("/git/commits/" + parentSha));
      var treeSha = parent && parent.tree && parent.tree.sha;
      if (!treeSha) throw new IntakeError("GitHub did not return the current file tree.");
      var rootTree = await gh(fetchImpl, token, repoUrl("/git/trees/" + treeSha));
      var modelsNode = (rootTree.tree || []).find(function (item) {
        return item.path === "models" && item.type === "tree";
      });
      if (!modelsNode) throw new IntakeError("The models folder is missing in the repository.");
      var modelsTree = await gh(fetchImpl, token, repoUrl("/git/trees/" + modelsNode.sha));
      var catalogNode = (modelsTree.tree || []).find(function (item) {
        return item.path === "catalog.json" && item.type === "blob";
      });
      if (!catalogNode) throw new IntakeError("models/catalog.json is missing in the repository.");
      var catalogBlob = await gh(fetchImpl, token, repoUrl("/git/blobs/" + catalogNode.sha));
      var catalogText = decodeBase64ToString(catalogBlob.content);
      var draft = prepareModel(options.prepared || options);
      var existingUsdz = (modelsTree.tree || []).find(function (item) {
        return item.path === draft.id + ".usdz" && item.type === "blob";
      });
      var sizeBytes;
      if (modelBytes) {
        if (!modelBytes.length) throw new IntakeError("The USDZ file is empty.");
        sizeBytes = modelBytes.length;
      } else if (existingUsdz && existingUsdz.size) {
        sizeBytes = existingUsdz.size;
      } else {
        throw new IntakeError("Choose a USDZ file. This id does not have one on the site yet.");
      }
      var prepared = prepareModel(Object.assign({}, draft, { sizeBytes: sizeBytes }));
      var catalogResult = applyCatalog(catalogText, prepared.entry, prepared.listInExamples);
      var updating = Boolean(existingUsdz) || catalogResult.action === "update" || catalogResult.action === "remove";

      var writes = [];
      if (modelBytes && modelBytes.length) {
        onStatus("Uploading the USDZ (" + formatBytes(modelBytes.length) + ")…");
        writes.push({ path: "models/" + prepared.id + ".usdz", bytes: modelBytes });
      }
      if (thumbBytes && thumbBytes.length) {
        onStatus("Uploading the thumbnail…");
        writes.push({ path: "models/thumbs/" + prepared.id + ".jpg", bytes: thumbBytes });
      }
      writes.push({ path: "ar/models/" + prepared.id + ".json", text: stringifyJson(prepared.sidecar) });
      if (catalogResult.changed) {
        onStatus(prepared.listInExamples ? "Updating the examples catalog…" : "Removing it from the examples catalog…");
        writes.push({ path: "models/catalog.json", text: catalogResult.text });
      }

      onStatus("Writing files…");
      var treeEntries = [];
      for (var i = 0; i < writes.length; i++) {
        var file = writes[i];
        var blob = await gh(fetchImpl, token, repoUrl("/git/blobs"), {
          method: "POST",
          body: file.bytes
            ? { content: bytesToBase64(file.bytes), encoding: "base64" }
            : { content: file.text, encoding: "utf-8" }
        });
        if (!blob.sha) throw new IntakeError("GitHub did not accept " + file.path + ".");
        treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
      }

      var tree = await gh(fetchImpl, token, repoUrl("/git/trees"), {
        method: "POST",
        body: { base_tree: treeSha, tree: treeEntries }
      });
      if (!tree.sha) throw new IntakeError("GitHub did not build the new file tree.");
      if (tree.sha === treeSha) {
        return {
          unchanged: true,
          branch: branch,
          login: auth.login,
          shareUrl: prepared.shareUrl,
          modelUrl: prepared.modelUrl,
          sidecarUrl: prepared.sidecarUrl,
          thumbUrl: thumbBytes ? prepared.thumbUrl : "",
          listed: prepared.listInExamples
        };
      }

      var commit = await gh(fetchImpl, token, repoUrl("/git/commits"), {
        method: "POST",
        body: {
          message: commitMessage(prepared, updating),
          tree: tree.sha,
          parents: [parentSha]
        }
      });
      if (!commit.sha) throw new IntakeError("GitHub did not create the commit.");

      try {
        onStatus("Publishing the commit…");
        await gh(fetchImpl, token, repoUrl("/git/refs/heads/" + branch), {
          method: "PATCH",
          body: { sha: commit.sha, force: false }
        });
      } catch (error) {
        if (attempt === 0 && (error.status === 409 || error.status === 422)) {
          onStatus("The site changed while uploading. Retrying once…");
          continue;
        }
        throw error;
      }

      return {
        unchanged: false,
        branch: branch,
        login: auth.login,
        commitSha: commit.sha,
        commitUrl: "https://github.com/" + GITHUB.owner + "/" + GITHUB.repo + "/commit/" + commit.sha,
        shareUrl: prepared.shareUrl,
        modelUrl: prepared.modelUrl,
        sidecarUrl: prepared.sidecarUrl,
        thumbUrl: thumbBytes ? prepared.thumbUrl : "",
        listed: prepared.listInExamples,
        catalogAction: catalogResult.action
      };
    }
    throw new IntakeError("The site changed while publishing. Nothing was overwritten. Try again.");
  }

  function friendly(error) {
    if (!error) return "Something went wrong.";
    if (error.status === 401 || error.status === 403) {
      return "GitHub did not accept the publish. Nothing was committed.";
    }
    return error.message || "Something went wrong.";
  }

  function mount() {
    var app = document.getElementById("app");
    if (!app) return;

    var usdzInput = document.getElementById("usdz");
    var usdzMeta = document.getElementById("usdz-meta");
    var thumbInput = document.getElementById("thumb");
    var thumbMeta = document.getElementById("thumb-meta");
    var thumbPreview = document.getElementById("thumb-preview");
    var nameInput = document.getElementById("name");
    var idInput = document.getElementById("model-id");
    var idError = document.getElementById("id-error");
    var placementWall = document.getElementById("placement-wall");
    var animatedInput = document.getElementById("animated");
    var animationFields = document.getElementById("animation-fields");
    var modeScrub = document.getElementById("mode-scrub");
    var examplesInput = document.getElementById("examples");
    var dimensionsInput = document.getElementById("dimensions");
    var detailsInput = document.getElementById("details");
    var specInput = document.getElementById("spec");
    var faqList = document.getElementById("faq-list");
    var previewCatalog = document.getElementById("preview-catalog");
    var previewSidecar = document.getElementById("preview-sidecar");
    var shareInput = document.getElementById("share-url");
    var qrImg = document.getElementById("qr");
    var qrDownload = document.getElementById("qr-download");
    var qrNote = document.getElementById("qr-note");
    var status = document.getElementById("status");
    var confirmBox = document.getElementById("confirm");
    var confirmText = document.getElementById("confirm-text");
    var result = document.getElementById("result");
    var resultBody = document.getElementById("result-body");
    var idDirty = false;
    var loaded = null;
    var booted = false;
    var qrToken = 0;
    var qrObjectUrl = "";

    function setStatus(message, isError) {
      status.textContent = message || "";
      status.classList.toggle("error", Boolean(isError));
    }

    function readFaq() {
      return Array.prototype.map.call(faqList.querySelectorAll(".faq-row"), function (row) {
        return {
          question: row.querySelector(".faq-q").value,
          answer: row.querySelector(".faq-a").value
        };
      });
    }

    function currentSize() {
      if (usdzInput.files && usdzInput.files[0]) return usdzInput.files[0].size;
      if (loaded && loaded.id === idInput.value.trim() && loaded.sizeBytes) return loaded.sizeBytes;
      return 0;
    }

    function readForm() {
      return {
        id: idInput.value,
        name: nameInput.value,
        placement: placementWall.checked ? "wall" : "floor",
        animated: animatedInput.checked,
        animationMode: modeScrub.checked ? "scrub" : "loop",
        listInExamples: examplesInput.checked,
        dimensions: dimensionsInput.value,
        details: detailsInput.value,
        specText: specInput.value,
        faq: readFaq(),
        sizeBytes: currentSize()
      };
    }

    function addFaqRow(question, answer) {
      var row = document.createElement("div");
      row.className = "faq-row";
      var q = document.createElement("input");
      q.className = "faq-q";
      q.type = "text";
      q.maxLength = 200;
      q.placeholder = "Question";
      q.value = question || "";
      q.setAttribute("aria-label", "FAQ question");
      var a = document.createElement("textarea");
      a.className = "faq-a";
      a.rows = 2;
      a.placeholder = "Answer";
      a.value = answer || "";
      a.setAttribute("aria-label", "FAQ answer");
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost btn--small";
      remove.textContent = "Remove";
      remove.addEventListener("click", function () {
        row.remove();
        refresh();
      });
      q.addEventListener("input", refresh);
      a.addEventListener("input", refresh);
      row.append(q, a, remove);
      faqList.append(row);
    }

    function qrDataUrl(url) {
      var QR = globalThis.QRCode;
      if (!QR || !QR.toDataURL) {
        return Promise.reject(new IntakeError("QR library missing."));
      }
      return new Promise(function (resolve, reject) {
        QR.toDataURL(url, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#020617", light: "#ffffff" }
        }, function (err, dataUrl) {
          if (err) reject(err);
          else resolve(dataUrl);
        });
      });
    }

    function showQr(id) {
      var url = shareUrl(id);
      var token = ++qrToken;
      shareInput.value = url;
      qrNote.textContent = "Points at the App Clip link. It starts working after GitHub Pages finishes the publish, usually within a couple of minutes.";
      var pending;
      try {
        pending = qrDataUrl(url);
      } catch (error) {
        pending = Promise.reject(error);
      }
      pending.then(function (dataUrl) {
        if (token !== qrToken) return;
        qrImg.src = dataUrl;
        qrImg.hidden = false;
        return fetch(dataUrl).then(function (res) { return res.blob(); });
      }).then(function (blob) {
        if (!blob || token !== qrToken) return;
        if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
        qrObjectUrl = URL.createObjectURL(blob);
        qrDownload.href = qrObjectUrl;
        qrDownload.download = "superimmersive-" + id + "-ar.png";
        qrDownload.hidden = false;
      }).catch(function () {
        if (token !== qrToken) return;
        qrImg.hidden = true;
        qrDownload.hidden = true;
        qrNote.textContent = "Could not build the QR code in this browser. Copy the link above.";
      });
    }

    function hideQr() {
      qrToken += 1;
      shareInput.value = "";
      qrImg.hidden = true;
      qrImg.removeAttribute("src");
      qrDownload.hidden = true;
      qrNote.textContent = "The QR code appears once the id is valid.";
    }

    function refresh() {
      if (!idDirty) idInput.value = slugify(nameInput.value);
      animationFields.hidden = !animatedInput.checked;
      var id = idInput.value.trim();
      var problem = id ? validateId(id) : "";
      idError.textContent = problem;
      idInput.setAttribute("aria-invalid", problem ? "true" : "false");
      if (id && !problem) showQr(id);
      else hideQr();
      try {
        var prepared = prepareModel(readForm());
        previewCatalog.textContent = prepared.listInExamples
          ? stringifyJson(prepared.entry)
          : "Left out of models/catalog.json, so it does not show in the app Examples list.\nThe share link still publishes the USDZ and ar/models/" + prepared.id + ".json.";
        previewSidecar.textContent = stringifyJson(prepared.sidecar);
      } catch (error) {
        previewCatalog.textContent = error.message;
        previewSidecar.textContent = "";
      }
      var file = usdzInput.files && usdzInput.files[0];
      if (file) {
        var warning = sizeWarning(file.size);
        usdzMeta.textContent = file.name + " · " + formatBytes(file.size) + (warning ? " " + warning : "");
      } else if (loaded && loaded.id === id && loaded.sizeBytes) {
        usdzMeta.textContent = "No new file. Publish keeps the USDZ already on the site (" + formatBytes(loaded.sizeBytes) + ").";
      } else {
        usdzMeta.textContent = "Required for a new id. Leave empty only when this id already has a USDZ on the site.";
      }
    }

    function openApp() {
      if (!booted) {
        booted = true;
        if (!faqList.children.length) addFaqRow("", "");
        refresh();
      }
    }

    async function imageFileToJpeg(file) {
      if (file.size > 15 * 1024 * 1024) throw new IntakeError("Choose a thumbnail under 15 MB.");
      if (typeof createImageBitmap !== "function") {
        throw new IntakeError("This browser cannot prepare the thumbnail. Use a current Safari or Chrome.");
      }
      var bitmap = await createImageBitmap(file);
      var maxEdge = 1400;
      var scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", 0.86); });
      if (!blob) throw new IntakeError("Could not convert the thumbnail to JPEG.");
      return new Uint8Array(await blob.arrayBuffer());
    }

    async function loadExisting() {
      var id = idInput.value.trim();
      var problem = validateId(id);
      if (problem) {
        setStatus(problem, true);
        return;
      }
      setStatus("Loading " + id + "…");
      result.hidden = true;
      try {
        var catalogRes = await fetch("/models/catalog.json", { cache: "no-store" });
        if (!catalogRes.ok) throw new IntakeError("Could not read the catalog.");
        var catalog = await catalogRes.json();
        if (!Array.isArray(catalog)) throw new IntakeError("catalog.json is not a list.");
        var entry = catalog.find(function (item) { return item && item.id === id; });
        var sidecar = null;
        var sideRes = await fetch("/ar/models/" + id + ".json", { cache: "no-store" });
        if (sideRes.ok) sidecar = await sideRes.json();
        if (!entry && !sidecar) {
          loaded = null;
          setStatus("No product with that id is on the site yet.");
          refresh();
          return;
        }
        if (entry && entry.bundled) {
          setStatus("That model is bundled in the app and is not edited here.");
          return;
        }
        nameInput.value = (entry && entry.name) || (sidecar && sidecar.name) || "";
        idDirty = true;
        idInput.value = id;
        var placement = (entry && entry.placement) || (sidecar && sidecar.placement);
        placementWall.checked = placement === "wall";
        document.getElementById("placement-floor").checked = placement !== "wall";
        var isAnimated = entry ? Boolean(entry.animated) : Boolean(sidecar && sidecar.animated);
        animatedInput.checked = isAnimated;
        var mode = (entry && entry.animationMode) || (sidecar && sidecar.animationMode);
        modeScrub.checked = mode === "scrub";
        document.getElementById("mode-loop").checked = mode !== "scrub";
        examplesInput.checked = Boolean(entry);
        dimensionsInput.value = (entry && entry.dimensions) || (sidecar && sidecar.dimensions) || "";
        detailsInput.value = (sidecar && sidecar.details) || "";
        specInput.value = (entry && entry.specText) || (sidecar && sidecar.specText) || "";
        faqList.replaceChildren();
        var faq = (entry && entry.faq) || (sidecar && sidecar.faq) || [];
        if (!faq.length) addFaqRow("", "");
        else faq.forEach(function (row) { addFaqRow(row.question, row.answer); });
        loaded = {
          id: id,
          sizeBytes: (entry && entry.sizeBytes) || (sidecar && sidecar.sizeBytes) || 0
        };
        setStatus(entry
          ? "Loaded from the catalog. Leave the USDZ empty to keep the current file."
          : "Loaded the product info. This id is not in the Examples list.");
        refresh();
      } catch (error) {
        setStatus(friendly(error), true);
      }
    }

    document.getElementById("faq-add").addEventListener("click", function () {
      addFaqRow("", "");
    });

    document.getElementById("load-existing").addEventListener("click", loadExisting);
    document.getElementById("copy-url").addEventListener("click", function () {
      if (!shareInput.value) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareInput.value).then(function () {
          qrNote.textContent = "Link copied.";
        }).catch(function () {
          shareInput.focus();
          shareInput.select();
        });
      } else {
        shareInput.focus();
        shareInput.select();
      }
    });

    nameInput.addEventListener("input", function () {
      refresh();
    });
    idInput.addEventListener("input", function () {
      idDirty = idInput.value.trim() !== "";
      if (!idDirty) idInput.value = slugify(nameInput.value);
      refresh();
    });
    ["placement-floor", "placement-wall", "animated", "mode-loop", "mode-scrub", "examples"].forEach(function (elementId) {
      document.getElementById(elementId).addEventListener("change", refresh);
    });
    [dimensionsInput, detailsInput, specInput].forEach(function (el) {
      el.addEventListener("input", refresh);
    });

    usdzInput.addEventListener("change", function () {
      var file = usdzInput.files && usdzInput.files[0];
      if (file && !/\.usdz$/i.test(file.name)) {
        usdzInput.value = "";
        setStatus("Choose a .usdz file.", true);
      }
      confirmBox.hidden = true;
      refresh();
    });

    thumbInput.addEventListener("change", function () {
      var file = thumbInput.files && thumbInput.files[0];
      thumbPreview.hidden = true;
      if (!file) {
        thumbMeta.textContent = "Optional. The app catalog has no thumbnail field, so this is stored beside the model for you and is not written into catalog.json.";
        return;
      }
      thumbMeta.textContent = file.name + " · " + formatBytes(file.size) + ". Saved as models/thumbs/<id>.jpg. The AR app does not read it.";
      thumbPreview.src = URL.createObjectURL(file);
      thumbPreview.hidden = false;
    });

    document.getElementById("publish").addEventListener("click", function () {
      result.hidden = true;
      try {
        var prepared = prepareModel(readForm());
        var file = usdzInput.files && usdzInput.files[0];
        if (file && file.size > MAX_BYTES) throw new IntakeError(sizeWarning(file.size));
        var lines = [
          "This commits directly to the live branch of superimmersive/superimmersive.github.io. It does not open a pull request.",
          "",
          "Product: " + prepared.name + " (" + prepared.id + ")",
          "Share: " + prepared.shareUrl,
          "Download: " + prepared.modelUrl,
          "Examples list: " + (prepared.listInExamples ? "yes" : "no"),
          "Placement: " + prepared.placement,
          "Animated: " + (prepared.animated ? (prepared.animationMode === "scrub" ? "scrub slider" : "loop") : "no"),
          file ? "USDZ: replace with " + file.name : "USDZ: keep the file already on the site, or stop if there is none"
        ];
        confirmText.textContent = lines.join("\n");
        confirmBox.hidden = false;
        confirmBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setStatus("");
      } catch (error) {
        confirmBox.hidden = true;
        setStatus(error.message, true);
      }
    });

    document.getElementById("confirm-cancel").addEventListener("click", function () {
      confirmBox.hidden = true;
    });

    document.getElementById("confirm-go").addEventListener("click", async function () {
      var button = document.getElementById("confirm-go");
      button.disabled = true;
      result.hidden = true;
      try {
        var prepared = prepareModel(readForm());
        var file = usdzInput.files && usdzInput.files[0];
        var modelBytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
        var thumbFile = thumbInput.files && thumbInput.files[0];
        var thumbBytes = thumbFile ? await imageFileToJpeg(thumbFile) : null;
        var published = await publishModel({
          prepared: prepared,
          modelBytes: modelBytes,
          thumbBytes: thumbBytes,
          onStatus: setStatus
        });
        confirmBox.hidden = true;
        result.hidden = false;
        if (published.unchanged) {
          resultBody.textContent = "Those files already match the live site. Nothing was committed.\n" + published.shareUrl;
        } else {
          resultBody.textContent = [
            "Published as " + published.login + " on " + published.branch + ".",
            "Commit: " + published.commitUrl,
            "Share: " + published.shareUrl,
            "USDZ: " + published.modelUrl,
            "Ask sidecar: " + published.sidecarUrl,
            published.thumbUrl ? "Thumbnail: " + published.thumbUrl : "No thumbnail in this commit.",
            published.listed ? "It is in the Examples list." : "It is not in the Examples list.",
            "",
            "GitHub Pages usually picks this up within a couple of minutes. Then open the share link, or register a Local Experience if the App Clip build is not on the App Store yet. Steps are in the help above."
          ].join("\n");
        }
        loaded = { id: prepared.id, sizeBytes: prepared.sizeBytes };
        setStatus(published.unchanged ? "Nothing to publish." : "Published.");
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) {
        setStatus(friendly(error), true);
      } finally {
        button.disabled = false;
      }
    });

    openApp();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }

  return {
    SITE: SITE,
    GITHUB: GITHUB,
    RESERVED_IDS: RESERVED_IDS,
    MAX_BYTES: MAX_BYTES,
    IntakeError: IntakeError,
    slugify: slugify,
    validateId: validateId,
    normalizeFaq: normalizeFaq,
    stringifyJson: stringifyJson,
    buildCatalogEntry: buildCatalogEntry,
    buildSidecar: buildSidecar,
    prepareModel: prepareModel,
    applyCatalog: applyCatalog,
    bytesToBase64: bytesToBase64,
    decodeBase64ToString: decodeBase64ToString,
    modelUrl: modelUrl,
    shareUrl: shareUrl,
    sidecarUrl: sidecarUrl,
    thumbUrl: thumbUrl,
    sizeWarning: sizeWarning,
    formatBytes: formatBytes,
    verifyToken: verifyToken,
    publishModel: publishModel,
    friendly: friendly,
    repoUrl: repoUrl
  };
});
