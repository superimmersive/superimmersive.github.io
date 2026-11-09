const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const api = require("./intake.js");

const root = path.join(__dirname, "..", "..");
const catalogPath = path.join(root, "models", "catalog.json");
const originalCatalog = fs.readFileSync(catalogPath, "utf8");

function sample(overrides) {
  return Object.assign({
    id: "garden-lamp",
    name: "Garden Lamp",
    placement: "floor",
    animated: true,
    animationMode: "loop",
    sizeBytes: 1200,
    specText: "A shade \u2014 400 mm",
    dimensions: "400 \u00d7 200 mm",
    details: "Tap to play.",
    faq: [
      { question: " How tall? ", answer: " 400 mm " },
      { question: " ", answer: "" }
    ],
    listInExamples: true
  }, overrides);
}

test("the form is visible without a passphrase gate", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "intake.js"), "utf8");
  assert.equal(html.includes('id="gate"'), false);
  assert.equal(html.includes("Unlock"), false);
  assert.equal(html.includes('id="pat"'), false);
  assert.equal(html.includes("Personal access token"), false);
  assert.equal(html.includes("GitHub token"), false);
  assert.match(html, /<div id="app">/);
  assert.equal(js.includes("GATE_SHA256"), false);
  assert.equal(Object.hasOwn(api, "GATE_SHA256"), false);
});

test("catalog.json round-trips without touching example entries", () => {
  assert.equal(api.stringifyJson(JSON.parse(originalCatalog)), originalCatalog);
});

test("slug, share URL, and FAQ cleanup", () => {
  assert.equal(api.slugify("Axel Flux Motor"), "axel-flux-motor");
  assert.equal(api.slugify("  Hello, World! "), "hello-world");
  const prepared = api.prepareModel(sample());
  assert.equal(prepared.shareUrl, "https://superimmersive.io/ar?model=garden-lamp");
  assert.equal(prepared.modelUrl, "https://superimmersive.io/models/garden-lamp.usdz");
  assert.equal(prepared.sidecarUrl, "https://superimmersive.io/ar/models/garden-lamp.json");
  assert.equal(prepared.faq.length, 1);
  assert.equal(prepared.faq[0].question, "How tall?");
  assert.equal(prepared.entry.animated, true);
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.entry, "animationMode"), false);
  assert.equal(prepared.sidecar.details, "Tap to play.");
  assert.equal(prepared.sidecar.url, prepared.modelUrl);
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.sidecar, "animationMode"), false);
});

test("scrub is stored and loop or a still model omits animationMode", () => {
  const scrub = api.prepareModel(sample({
    id: "hub-motor",
    name: "Hub Motor",
    placement: "wall",
    animationMode: "scrub"
  }));
  assert.equal(scrub.entry.animationMode, "scrub");
  assert.equal(scrub.entry.placement, "wall");
  assert.equal(scrub.sidecar.animationMode, "scrub");
  const still = api.prepareModel(sample({ animated: false, animationMode: "scrub" }));
  assert.equal(still.entry.animated, false);
  assert.equal(Object.prototype.hasOwnProperty.call(still.entry, "animationMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(still.sidecar, "animationMode"), false);
});

test("adding a model keeps every current catalog entry, and hiding removes only the new id", () => {
  const prepared = api.prepareModel(sample());
  const added = api.applyCatalog(originalCatalog, prepared.entry, true);
  assert.equal(added.action, "add");
  const parsed = JSON.parse(added.text);
  assert.deepEqual(parsed.slice(0, -1), JSON.parse(originalCatalog));
  assert.equal(parsed.at(-1).id, "garden-lamp");
  assert.ok(added.text.includes("\\u2014"));
  assert.equal(added.text.includes("\u2014"), false);
  const again = api.applyCatalog(added.text, prepared.entry, true);
  assert.equal(again.changed, false);
  const removed = api.applyCatalog(added.text, prepared.entry, false);
  assert.equal(removed.text, originalCatalog);
  const absent = api.applyCatalog(originalCatalog, prepared.entry, false);
  assert.equal(absent.changed, false);
  assert.equal(absent.text, originalCatalog);
});

test("reserved example ids and broken FAQ rows are refused", () => {
  assert.match(api.validateId("biplane"), /example/);
  assert.throws(() => api.prepareModel(sample({ id: "test-box", name: "Test Box" })), /example/);
  assert.throws(() => api.prepareModel(sample({ id: "robot" })), /example/);
  assert.throws(() => api.prepareModel(sample({ id: "axel-flux-motor" })), /example/);
  assert.throws(() => api.normalizeFaq([{ question: "Colour?", answer: "" }]), /both/);
  assert.throws(() => api.prepareModel(sample({ placement: "ceiling" })), /floor or wall/);
  assert.throws(() => api.prepareModel(sample({ animationMode: "ping" })), /loop or scrub/);
});

test("bundled and duplicate catalog rows are refused", () => {
  const entry = api.prepareModel(sample({ id: "custom-box", name: "Custom Box", animated: false })).entry;
  assert.throws(() => api.applyCatalog(JSON.stringify([
    { id: "custom-box", bundled: true, name: "Custom Box" }
  ]), entry, true), /bundled/);
  assert.throws(() => api.applyCatalog(JSON.stringify([
    { id: "custom-box", name: "A" },
    { id: "custom-box", name: "B" }
  ]), entry, true), /more than once/);
});

test("base64 matches the file bytes, including a chunk larger than 32 KB", () => {
  const bytes = new Uint8Array(40000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  assert.equal(api.bytesToBase64(bytes), Buffer.from(bytes).toString("base64"));
  const wrapped = api.bytesToBase64(Buffer.from("catalog\n", "utf8")).replace(/(.{10})/g, "$1\n");
  assert.equal(api.decodeBase64ToString(wrapped), "catalog\n");
});

test("size warnings follow the GitHub and App Clip limits", () => {
  assert.equal(api.sizeWarning(1000), "");
  assert.match(api.sizeWarning(9 * 1024 * 1024), /few MB/);
  assert.match(api.sizeWarning(50 * 1024 * 1024), /50 MB/);
  assert.match(api.sizeWarning(api.MAX_BYTES + 1), /70 MB/);
});

test("the App Clip page downloads catalog models and still serves the bundled test box", () => {
  const html = fs.readFileSync(path.join(root, "ar", "index.html"), "utf8");
  assert.match(html, /\/models\/" \+ id \+ "\.usdz"/);
  assert.match(html, /\/ar\/models\/test-box\.usdz/);
  assert.doesNotMatch(html, /a\.href = "\/ar\/models\/" \+ id/);
});

function githubDouble(initialCatalog) {
  const calls = [];
  let refSha = "1".repeat(40);
  let refFailuresLeft = 0;
  let blobN = 0;
  let commitN = 0;
  const blobStore = new Map();
  const usdz = new Map();

  function putBlob(encoding, content) {
    blobN += 1;
    const sha = "b" + String(blobN).padStart(39, "0");
    blobStore.set(sha, { encoding: encoding, content: content });
    return sha;
  }

  const catalogSha = putBlob("base64", Buffer.from(initialCatalog, "utf8").toString("base64"));

  function json(data, status) {
    const code = status || 200;
    return {
      ok: code >= 200 && code < 300,
      status: code,
      statusText: code === 200 ? "OK" : "Error",
      async text() { return JSON.stringify(data); }
    };
  }

  async function fetchImpl(url, opts) {
    const method = (opts && opts.method) || "GET";
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    const token = opts.headers.Authorization.replace(/^Bearer /, "");
    assert.equal(url.startsWith("https://api.github.com/"), true);
    assert.equal(url.includes(token), false);
    calls.push({ url: url, method: method, body: body });

    if (url === "https://api.github.com/user") return json({ login: "devon" });
    if (url === api.repoUrl("") && method === "GET") {
      return json({ default_branch: "main", permissions: { push: true } });
    }
    if (url === api.repoUrl("/git/ref/heads/main") && method === "GET") {
      return json({ object: { sha: refSha } });
    }
    if (method === "GET" && url === api.repoUrl("/git/commits/" + refSha)) {
      return json({ sha: refSha, tree: { sha: "tree-root" } });
    }
    if (url === api.repoUrl("/git/trees/tree-root")) {
      return json({ tree: [{ path: "models", type: "tree", sha: "tree-models" }] });
    }
    if (url === api.repoUrl("/git/trees/tree-models")) {
      const tree = [{ path: "catalog.json", type: "blob", sha: catalogSha, size: Buffer.byteLength(initialCatalog) }];
      usdz.forEach(function (info, name) {
        tree.push({ path: name, type: "blob", sha: info.sha, size: info.size });
      });
      return json({ tree: tree });
    }
    if (method === "GET" && url.indexOf("/git/blobs/") !== -1) {
      const sha = url.slice(url.lastIndexOf("/") + 1);
      const blob = blobStore.get(sha);
      const content = blob.encoding === "base64" ? blob.content.replace(/(.{60})/g, "$1\n") : blob.content;
      return json({ content: content, encoding: blob.encoding, sha: sha });
    }
    if (url === api.repoUrl("/git/blobs") && method === "POST") {
      return json({ sha: putBlob(body.encoding, body.content) });
    }
    if (url === api.repoUrl("/git/trees") && method === "POST") {
      return json({ sha: "tree-new-" + blobN });
    }
    if (url === api.repoUrl("/git/commits") && method === "POST") {
      commitN += 1;
      assert.equal(JSON.stringify(body).includes(token), false);
      return json({ sha: "c".repeat(39) + String(commitN) });
    }
    if (url === api.repoUrl("/git/refs/heads/main") && method === "PATCH") {
      assert.equal(body.force, false);
      if (refFailuresLeft > 0) {
        refFailuresLeft -= 1;
        refSha = "2".repeat(40);
        return json({ message: "Update is not a fast forward" }, 422);
      }
      refSha = body.sha;
      return json({ object: { sha: body.sha } });
    }
    throw new Error("Unexpected " + method + " " + url);
  }

  return {
    fetchImpl: fetchImpl,
    calls: calls,
    usdz: usdz,
    failNextRef: function () { refFailuresLeft = 1; },
    blobStore: blobStore
  };
}

function posts(calls, suffix, method) {
  return calls.filter(function (call) {
    return call.method === (method || "POST") && call.url === api.repoUrl(suffix);
  });
}

test("publish commits the USDZ, sidecar, thumbnail, and catalog in one shot", async () => {
  const github = githubDouble(originalCatalog);
  const model = new Uint8Array([1, 2, 3, 255]);
  const thumb = new Uint8Array([9, 8, 7]);
  const prepared = api.prepareModel(sample({ sizeBytes: 0 }));
  const result = await api.publishModel({
    token: "github_pat_test_token_value",
    prepared: prepared,
    modelBytes: model,
    thumbBytes: thumb,
    fetch: github.fetchImpl
  });
  assert.equal(result.login, "devon");
  assert.equal(result.branch, "main");
  assert.equal(result.shareUrl, "https://superimmersive.io/ar?model=garden-lamp");
  assert.equal(result.unchanged, false);
  const trees = posts(github.calls, "/git/trees");
  assert.equal(trees.length, 1);
  const paths = trees[0].body.tree.map(function (item) { return item.path; }).sort();
  assert.deepEqual(paths, [
    "ar/models/garden-lamp.json",
    "models/catalog.json",
    "models/garden-lamp.usdz",
    "models/thumbs/garden-lamp.jpg"
  ]);
  const blobs = posts(github.calls, "/git/blobs");
  const usdzBlob = blobs.find(function (call) { return call.body.encoding === "base64" && call.body.content.startsWith(api.bytesToBase64(model).slice(0, 8)); });
  assert.ok(usdzBlob);
  assert.equal(Buffer.from(usdzBlob.body.content, "base64").equals(Buffer.from(model)), true);
  const catalogBlob = blobs.find(function (call) { return call.body.encoding === "utf-8" && call.body.content.includes('"garden-lamp"') && call.body.content.includes('"test-box"'); });
  assert.ok(catalogBlob);
  const published = JSON.parse(catalogBlob.body.content);
  assert.deepEqual(published.slice(0, -1), JSON.parse(originalCatalog));
  assert.equal(published.at(-1).sizeBytes, 4);
  assert.equal(Object.prototype.hasOwnProperty.call(published.at(-1), "animationMode"), false);
  const sidecarBlob = blobs.find(function (call) { return call.body.encoding === "utf-8" && call.body.content.includes('"details"'); });
  const sidecar = JSON.parse(sidecarBlob.body.content);
  assert.equal(sidecar.details, "Tap to play.");
  assert.equal(sidecar.sizeBytes, 4);
  assert.equal(sidecar.faq[0].answer, "400 mm");
  const commit = posts(github.calls, "/git/commits")[0].body;
  assert.deepEqual(commit.parents, ["1".repeat(40)]);
  assert.match(commit.message, /Publish AR model garden-lamp/);
  assert.equal(commit.message.includes("github_pat_"), false);
  const ref = github.calls.find(function (call) { return call.method === "PATCH"; });
  assert.equal(ref.body.force, false);
});

test("a metadata update keeps the existing USDZ and can leave the examples list", async () => {
  const listed = api.applyCatalog(originalCatalog, api.prepareModel(sample()).entry, true).text;
  const github = githubDouble(listed);
  github.usdz.set("garden-lamp.usdz", { sha: "existing-usdz", size: 4321 });
  const prepared = api.prepareModel(sample({
    sizeBytes: 1,
    listInExamples: false,
    specText: "Updated spec"
  }));
  const result = await api.publishModel({
    token: "github_pat_test_token_value",
    prepared: prepared,
    fetch: github.fetchImpl
  });
  assert.equal(result.catalogAction, "remove");
  const paths = posts(github.calls, "/git/trees")[0].body.tree.map(function (item) { return item.path; });
  assert.equal(paths.includes("models/garden-lamp.usdz"), false);
  assert.equal(paths.includes("models/catalog.json"), true);
  const catalogBlob = posts(github.calls, "/git/blobs").find(function (call) {
    return call.body.encoding === "utf-8" && call.body.content.indexOf("catalog") !== -1 || (call.body.content && call.body.content.indexOf("test-box") !== -1);
  });
  const catalogCall = posts(github.calls, "/git/blobs").find(function (call) {
    return call.body.encoding === "utf-8" && String(call.body.content).indexOf('"test-box"') !== -1;
  });
  const published = JSON.parse(catalogCall.body.content);
  assert.equal(published.some(function (item) { return item.id === "garden-lamp"; }), false);
  assert.deepEqual(published, JSON.parse(originalCatalog));
  const sidecar = JSON.parse(posts(github.calls, "/git/blobs").find(function (call) {
    return call.body.encoding === "utf-8" && String(call.body.content).indexOf('"Updated spec"') !== -1;
  }).body.content);
  assert.equal(sidecar.sizeBytes, 4321);
  assert.equal(sidecar.specText, "Updated spec");
  assert.equal(catalogBlob.body.content.includes("garden-lamp"), false);
});

test("a product that was never listed does not rewrite catalog.json", async () => {
  const github = githubDouble(originalCatalog);
  const result = await api.publishModel({
    token: "github_pat_test_token_value",
    prepared: api.prepareModel(sample({ listInExamples: false, sizeBytes: 0 })),
    modelBytes: new Uint8Array([4, 5]),
    fetch: github.fetchImpl
  });
  assert.equal(result.listed, false);
  const paths = posts(github.calls, "/git/trees")[0].body.tree.map(function (item) { return item.path; });
  assert.deepEqual(paths.sort(), ["ar/models/garden-lamp.json", "models/garden-lamp.usdz"]);
});

test("a lost race retries once and the second commit parents the new head", async () => {
  const github = githubDouble(originalCatalog);
  github.failNextRef();
  await api.publishModel({
    token: "github_pat_test_token_value",
    prepared: api.prepareModel(sample({ sizeBytes: 0 })),
    modelBytes: new Uint8Array([1]),
    fetch: github.fetchImpl
  });
  const commits = posts(github.calls, "/git/commits");
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0].body.parents, ["1".repeat(40)]);
  assert.deepEqual(commits[1].body.parents, ["2".repeat(40)]);
  const patches = github.calls.filter(function (call) { return call.method === "PATCH"; });
  assert.equal(patches.length, 2);
  assert.equal(patches.every(function (call) { return call.body.force === false; }), true);
});

test("missing files and a token that cannot push fail before a commit", async () => {
  const github = githubDouble(originalCatalog);
  await assert.rejects(() => api.publishModel({
    token: "github_pat_test_token_value",
    prepared: api.prepareModel(sample({ sizeBytes: 0 })),
    fetch: github.fetchImpl
  }), /Choose a USDZ/);
  assert.equal(posts(github.calls, "/git/commits").length, 0);

  await assert.rejects(() => api.publishModel({
    token: "github_pat_test_token_value",
    prepared: api.prepareModel(sample()),
    modelBytes: { length: api.MAX_BYTES + 1 },
    fetch: function () { throw new Error("should not upload"); }
  }), /70 MB/);

  await assert.rejects(() => api.verifyToken("github_pat_test_token_value", async function (url) {
    if (url.endsWith("/user")) {
      return { ok: true, status: 200, async text() { return JSON.stringify({ login: "devon" }); } };
    }
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ default_branch: "main", permissions: { push: false } }); }
    };
  }), /cannot push/);
});
