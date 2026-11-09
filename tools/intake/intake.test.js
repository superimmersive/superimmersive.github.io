const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const api = require("./intake.js");

test("the form is a name, a USDZ, and publish", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "intake.js"), "utf8");
  assert.match(html, /id="app"/);
  assert.match(html, /id="name"/);
  assert.match(html, /id="usdz"/);
  assert.match(html, /id="publish"/);
  assert.match(html, /private model storage/);
  for (const gone of [
    "Unlock", "GitHub token", "Personal access token", "Load this id",
    "Thumbnail", "FAQ", "Placement", "Animated", "Share link", "Will be written",
    "How to publish", "examples list", "api.github.com"
  ]) {
    assert.equal(html.includes(gone), false, gone);
    assert.equal(js.includes(gone), false, gone);
  }
  assert.equal(js.includes("GATE_SHA256"), false);
  assert.equal(js.includes("loadExisting"), false);
  assert.equal(api.UPLOAD_URL, "https://superimmersive-intake.superimmersive.workers.dev");
  assert.match(html, /id="qr-canvas"/);
  assert.match(html, /id="qr-link"/);
  assert.match(html, /src="\.\.\/\.\.\/js\/qrcode\.min\.js"/);
  assert.match(js, /toCanvas/);
  assert.equal(api.launchUrl("garden-lamp"), "https://superimmersive.io/ar?model=garden-lamp");
});

test("the launch link is the App Clip address and the QR library can draw it", async () => {
  const QRCode = require("../../js/qrcode.min.js");
  const url = api.launchUrl("garden-lamp");
  const created = QRCode.create(url);
  const encoded = created.segments.map(function (segment) {
    return typeof segment.data === "string" ? segment.data : Buffer.from(segment.data).toString("utf8");
  }).join("");
  assert.equal(encoded, url);
  const svg = await QRCode.toString(url, { type: "svg", margin: 1 });
  assert.match(svg, /<svg/);
});

test("a name becomes a private object key", () => {
  assert.equal(api.slugify("Axel Flux Motor"), "axel-flux-motor");
  assert.equal(api.slugify("  Hello, World! "), "hello-world");
  const prepared = api.prepareModel({ name: "Garden Lamp", sizeBytes: 1200 });
  assert.equal(prepared.id, "garden-lamp");
  assert.equal(prepared.key, "models/garden-lamp.usdz");
  assert.deepEqual(prepared.sidecar, { name: "Garden Lamp" });
  assert.equal(Object.keys(prepared.sidecar).length, 1);
});

test("reserved example ids are refused", () => {
  assert.match(api.validateId("biplane"), /example/);
  assert.throws(() => api.prepareModel({ name: "Biplane", sizeBytes: 1 }), /example/);
  assert.throws(() => api.prepareModel({ name: "Test Box", sizeBytes: 1 }), /example/);
  assert.throws(() => api.prepareModel({ name: "Robot", sizeBytes: 1 }), /example/);
  assert.throws(() => api.prepareModel({ name: "Axel Flux Motor", sizeBytes: 1 }), /example/);
  assert.throws(() => api.prepareModel({ name: "!!!" }), /name/);
});

test("a file over 70 MB is refused before upload", async () => {
  assert.equal(api.sizeWarning(1000), "");
  assert.match(api.sizeWarning(api.MAX_BYTES + 1), /70 MB/);
  let called = false;
  await assert.rejects(() => api.publishModel({
    name: "Garden Lamp",
    modelBytes: { length: api.MAX_BYTES + 1 },
    fetch: function () { called = true; }
  }), /70 MB/);
  assert.equal(called, false);
  await assert.rejects(() => api.publishModel({
    name: "Garden Lamp",
    modelBytes: new Uint8Array(),
    fetch: function () { throw new Error("should not upload"); }
  }), /Choose a USDZ/);
});

test("publish posts the USDZ to the intake worker and nowhere else", async () => {
  const model = new Uint8Array([1, 2, 3, 255]);
  let upload;
  const result = await api.publishModel({
    name: "Garden Lamp",
    modelBytes: model,
    fetch: async function (url, init) {
      upload = { url: url, method: init.method, body: init.body };
      const file = init.body.get("file");
      const bytes = new Uint8Array(await file.arrayBuffer());
      assert.deepEqual(bytes, model);
      assert.equal(file.name, "garden-lamp.usdz");
      assert.equal(init.body.get("name"), "Garden Lamp");
      return new Response(JSON.stringify({
        id: "garden-lamp",
        key: "models/garden-lamp.usdz",
        bytes: model.length,
        name: "Garden Lamp"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(upload.url, api.UPLOAD_URL);
  assert.equal(upload.method, "POST");
  assert.equal(result.id, "garden-lamp");
  assert.equal(result.key, "models/garden-lamp.usdz");
});

test("a storage error is shown and a mismatched confirmation is refused", async () => {
  await assert.rejects(() => api.publishModel({
    name: "Garden Lamp",
    modelBytes: new Uint8Array([1]),
    fetch: async function () {
      return new Response(JSON.stringify({ error: "Choose a .usdz file." }), { status: 400 });
    }
  }), /Choose a \.usdz file/);

  await assert.rejects(() => api.publishModel({
    name: "Garden Lamp",
    modelBytes: new Uint8Array([1]),
    fetch: async function () {
      return new Response(JSON.stringify({ id: "other", key: "models/other.usdz" }), { status: 200 });
    }
  }), /did not confirm/);

  await assert.rejects(() => api.publishModel({
    name: "Garden Lamp",
    modelBytes: new Uint8Array([1]),
    fetch: async function () { throw new Error("offline"); }
  }), /Could not reach model storage/);
});

test("the worker stores the USDZ and the name, and removes a half-written model", async () => {
  const worker = await import("./worker/src/index.js");
  const model = new Uint8Array([9, 8, 7, 6]);
  const bucket = memoryBucket();
  const response = await worker.handle(await uploadRequest("Garden Lamp", "photo.usdz", model), { MODELS: bucket });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    id: "garden-lamp",
    key: "models/garden-lamp.usdz",
    bytes: 4,
    name: "Garden Lamp"
  });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://superimmersive.io");
  assert.deepEqual(bucket.store.get("models/garden-lamp.usdz").bytes, Buffer.from(model));
  assert.deepEqual(JSON.parse(bucket.store.get("models/garden-lamp.json").bytes.toString("utf8")), { name: "Garden Lamp" });

  const failed = memoryBucket();
  failed.failOn = "models/garden-lamp.json";
  const broken = await worker.handle(await uploadRequest("Garden Lamp", "lamp.usdz", model), { MODELS: failed });
  assert.equal(broken.status, 502);
  assert.equal(failed.store.has("models/garden-lamp.usdz"), false);
  assert.equal(failed.deleted.includes("models/garden-lamp.usdz"), true);
});

test("a stored model returns a ten-minute download link and the file", async () => {
  const worker = await import("./worker/src/index.js");
  const model = new Uint8Array([9, 8, 7, 6]);
  const bucket = memoryBucket();
  const env = { MODELS: bucket, DOWNLOAD_SECRET: "test-download-secret" };
  const stored = await worker.handle(await uploadRequest("Garden Lamp", "lamp.usdz", model), env);
  assert.equal(stored.status, 200);

  const linkResponse = await worker.handle(new Request(api.UPLOAD_URL + "/models/garden-lamp"), env);
  assert.equal(linkResponse.status, 200);
  assert.equal(linkResponse.headers.get("cache-control"), "private, no-store");
  const link = await linkResponse.json();
  assert.equal(link.id, "garden-lamp");
  const downloadUrl = new URL(link.url);
  assert.equal(downloadUrl.origin + downloadUrl.pathname, api.UPLOAD_URL + "/models/garden-lamp.usdz");
  const exp = Number(downloadUrl.searchParams.get("exp"));
  assert.ok(exp > Math.floor(Date.now() / 1000) + worker.LINK_TTL_SECONDS - 5);
  assert.equal(link.expiresAt, new Date(exp * 1000).toISOString());

  const file = await worker.handle(new Request(link.url), env);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "model/vnd.usdz+zip");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), model);

  const staleExp = String(Math.floor(Date.now() / 1000) - 120);
  const staleSig = await worker.signDownload("garden-lamp", staleExp, env.DOWNLOAD_SECRET);
  const stale = new URL(link.url);
  stale.searchParams.set("exp", staleExp);
  stale.searchParams.set("sig", staleSig);
  const expired = await worker.handle(new Request(stale), env);
  assert.equal(expired.status, 403);

  const tampered = new URL(link.url);
  tampered.searchParams.set("sig", "ab".repeat(32));
  const rejected = await worker.handle(new Request(tampered), env);
  assert.equal(rejected.status, 403);

  const missing = await worker.handle(new Request(api.UPLOAD_URL + "/models/other-lamp"), env);
  assert.equal(missing.status, 404);
  const foreign = await worker.handle(new Request(api.UPLOAD_URL + "/models/garden-lamp", {
    headers: { Origin: "https://example.com" }
  }), env);
  assert.equal(foreign.status, 403);
});

test("the worker refuses other sites, other files, and example names", async () => {
  const worker = await import("./worker/src/index.js");
  const bucket = memoryBucket();
  const model = new Uint8Array([1]);

  const foreign = await worker.handle(await uploadRequest("Garden Lamp", "lamp.usdz", model, "https://example.com"), { MODELS: bucket });
  assert.equal(foreign.status, 403);
  assert.equal(bucket.store.size, 0);

  const text = await worker.handle(await uploadRequest("Garden Lamp", "notes.txt", model), { MODELS: bucket });
  assert.equal(text.status, 400);

  const example = await worker.handle(await uploadRequest("Biplane", "biplane.usdz", model), { MODELS: bucket });
  assert.equal(example.status, 400);

  const empty = await worker.handle(await uploadRequest("Garden Lamp", "lamp.usdz", new Uint8Array()), { MODELS: bucket });
  assert.equal(empty.status, 400);
  assert.equal(bucket.store.size, 0);

  const options = await worker.handle(new Request(api.UPLOAD_URL, {
    method: "OPTIONS",
    headers: { Origin: "https://superimmersive.github.io" }
  }), { MODELS: bucket });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), "https://superimmersive.github.io");
});

function memoryBucket() {
  const store = new Map();
  const deleted = [];
  return {
    store: store,
    deleted: deleted,
    failOn: "",
    async put(key, value) {
      if (key === this.failOn) throw new Error("sidecar failed");
      let bytes;
      if (typeof value === "string") bytes = Buffer.from(value);
      else if (value instanceof Uint8Array) bytes = Buffer.from(value);
      else if (value && typeof value.arrayBuffer === "function") bytes = Buffer.from(await value.arrayBuffer());
      else bytes = Buffer.from(await new Response(value).arrayBuffer());
      store.set(key, { bytes: bytes });
    },
    async delete(key) {
      deleted.push(key);
      store.delete(key);
    },
    async head(key) {
      const item = store.get(key);
      return item ? { size: item.bytes.length } : null;
    },
    async get(key) {
      const item = store.get(key);
      return item ? { body: item.bytes, size: item.bytes.length } : null;
    }
  };
}

async function uploadRequest(name, filename, bytes, origin) {
  const form = new FormData();
  form.set("name", name);
  form.set("file", new File([bytes], filename, { type: "application/octet-stream" }));
  return new Request(api.UPLOAD_URL, {
    method: "POST",
    headers: { Origin: origin || "https://superimmersive.io" },
    body: form
  });
}
