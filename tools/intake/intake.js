/* Studio intake for Superimmersive client models.
   The browser posts the name and USDZ to the intake worker, which stores
   them in the private R2 bucket. This page has no bucket credentials. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SIIntake = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var UPLOAD_URL = "https://superimmersive-intake.superimmersive.workers.dev";
  var RESERVED_IDS = ["test-box", "biplane", "robot", "axel-flux-motor"];
  var MAX_BYTES = 70 * 1024 * 1024;

  function IntakeError(message, status) {
    this.name = "IntakeError";
    this.message = message;
    this.status = status || 0;
  }
  IntakeError.prototype = Object.create(Error.prototype);

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
    if (!id) return "Enter a product name.";
    if (id.length > 64) return "Keep the name shorter.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      return "Use a name that contains letters or numbers.";
    }
    if (RESERVED_IDS.indexOf(id) !== -1) {
      return "“" + id + "” is an existing example and stays as it is.";
    }
    return "";
  }

  function prepareModel(input) {
    var name = String(input.name || "").trim();
    if (!name) throw new IntakeError("Enter a product name.");
    if (name.length > 120) throw new IntakeError("Enter a product name.");
    var id = slugify(name);
    var idError = validateId(id);
    if (idError) throw new IntakeError(idError);
    var sizeBytes = input.sizeBytes == null || input.sizeBytes === "" ? 0 : Number(input.sizeBytes);
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
      throw new IntakeError("Model size is missing.");
    }
    return {
      id: id,
      name: name,
      sizeBytes: sizeBytes,
      key: "models/" + id + ".usdz",
      sidecar: { name: name }
    };
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

  async function publishModel(options) {
    var bytes = options.modelBytes;
    if (!bytes || !bytes.length) throw new IntakeError("Choose a USDZ file.");
    if (bytes.length > MAX_BYTES) throw new IntakeError(sizeWarning(bytes.length));
    var prepared = prepareModel({ name: options.name, sizeBytes: bytes.length });
    var fetchImpl = options.fetch || fetch;
    var onStatus = options.onStatus || function () {};
    var form = new FormData();
    form.append("name", prepared.name);
    form.append("file", new Blob([bytes], { type: "model/vnd.usdz+zip" }), prepared.id + ".usdz");
    onStatus("Uploading the USDZ (" + formatBytes(bytes.length) + ")…");
    var res;
    try {
      res = await fetchImpl(UPLOAD_URL, { method: "POST", body: form });
    } catch (error) {
      throw new IntakeError("Could not reach model storage. Check the connection, then try again.");
    }
    var text = await res.text();
    var data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (ignore) { data = null; }
    }
    if (!res.ok) {
      var message = data && data.error ? data.error : "The model did not store. Try again.";
      throw new IntakeError(message, res.status);
    }
    if (!data || data.id !== prepared.id || data.key !== prepared.key) {
      throw new IntakeError("Storage accepted the upload but did not confirm the file.");
    }
    return {
      id: data.id,
      key: data.key,
      bytes: data.bytes,
      name: data.name
    };
  }

  function friendly(error) {
    return (error && error.message) || "Something went wrong.";
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
        var stored = await publishModel({
          name: nameInput.value,
          modelBytes: new Uint8Array(await file.arrayBuffer()),
          onStatus: setStatus
        });
        setStatus("Stored as " + stored.id + ".");
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
    UPLOAD_URL: UPLOAD_URL,
    RESERVED_IDS: RESERVED_IDS,
    MAX_BYTES: MAX_BYTES,
    IntakeError: IntakeError,
    slugify: slugify,
    validateId: validateId,
    prepareModel: prepareModel,
    sizeWarning: sizeWarning,
    formatBytes: formatBytes,
    publishModel: publishModel,
    friendly: friendly
  };
});
