/* Studio intake for Superimmersive AR models.
   The browser calls the GitHub Git Data API and makes one commit on the default
   branch: the USDZ, a catalog row, and a name-only sidecar. */
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
  var MAX_BYTES = 70 * 1024 * 1024;

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

  function stringifyJson(value) {
    var json = JSON.stringify(value, null, 2);
    var escaped = json.replace(/[\u007f-\uffff]/g, function (ch) {
      return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    });
    return escaped + "\n";
  }

  function prepareModel(input) {
    var name = String(input.name || "").trim();
    if (!name) throw new IntakeError("Enter a product name.");
    var id = String(input.id || "").trim() || slugify(name);
    var idError = validateId(id);
    if (idError) throw new IntakeError(idError === "Enter an id." ? "Enter a product name." : idError);
    var sizeBytes = input.sizeBytes == null || input.sizeBytes === "" ? 0 : Number(input.sizeBytes);
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
      throw new IntakeError("Model size is missing.");
    }
    var prepared = {
      id: id,
      name: name,
      sizeBytes: sizeBytes,
      listInExamples: true
    };
    prepared.entry = {
      id: id,
      name: name,
      url: modelUrl(id),
      sizeBytes: sizeBytes,
      placement: "floor",
      animated: false
    };
    prepared.sidecar = { name: name };
    prepared.shareUrl = shareUrl(id);
    prepared.modelUrl = modelUrl(id);
    prepared.sidecarUrl = sidecarUrl(id);
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
      return "This USDZ is " + formatBytes(bytes) + ". The page stops at 70 MB.";
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
    if (modelBytes && modelBytes.length > MAX_BYTES) throw new IntakeError(sizeWarning(modelBytes.length));

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
    var form = document.getElementById("app");
    if (!form) return;
    var nameInput = document.getElementById("name");
    var usdzInput = document.getElementById("usdz");
    var status = document.getElementById("status");
    var button = document.getElementById("publish");

    function setStatus(message, isError) {
      status.textContent = message || "";
      status.classList.toggle("error", Boolean(isError));
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var file = usdzInput.files && usdzInput.files[0];
      if (!file) {
        setStatus("Choose a USDZ file.", true);
        return;
      }
      if (!/\.usdz$/i.test(file.name)) {
        usdzInput.value = "";
        setStatus("Choose a .usdz file.", true);
        return;
      }
      if (file.size > MAX_BYTES) {
        setStatus(sizeWarning(file.size), true);
        return;
      }
      button.disabled = true;
      try {
        var published = await publishModel({
          name: nameInput.value,
          modelBytes: new Uint8Array(await file.arrayBuffer()),
          onStatus: setStatus
        });
        setStatus(published.unchanged
          ? "Nothing to publish."
          : "Published. It will show in the app once the site updates.");
      } catch (error) {
        setStatus(friendly(error), true);
      } finally {
        button.disabled = false;
      }
    });
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
    stringifyJson: stringifyJson,
    prepareModel: prepareModel,
    applyCatalog: applyCatalog,
    bytesToBase64: bytesToBase64,
    decodeBase64ToString: decodeBase64ToString,
    modelUrl: modelUrl,
    shareUrl: shareUrl,
    sidecarUrl: sidecarUrl,
    sizeWarning: sizeWarning,
    formatBytes: formatBytes,
    verifyToken: verifyToken,
    publishModel: publishModel,
    friendly: friendly,
    repoUrl: repoUrl
  };
});
