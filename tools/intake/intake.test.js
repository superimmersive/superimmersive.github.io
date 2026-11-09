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

test("the form is a name, a USDZ, and publish", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "intake.js"), "utf8");
  assert.match(html, /id="app"/);
  assert.match(html, /id="name"/);
  assert.match(html, /id="usdz"/);
  assert.match(html, /id="publish"/);
  for (const gone of [
    "Unlock", "GitHub token", "Personal access token", "Load this id",
    "Thumbnail", "FAQ", "Placement", "Animated", "Share link", "Will be written",
    "qrcode", "How to publish"
  ]) {
    assert.equal(html.includes(gone), false, gone);
  }
  assert.equal(js.includes("GATE_SHA256"), false);
  assert.equal(js.includes("loadExisting"), false);
  assert.equal(Object.hasOwn(api, "GATE_SHA256"), false);
});

test("catalog.json round-trips without touching example entries", () => {
  assert.equal(api.stringifyJson(JSON.parse(originalCatalog)), originalCatalog);
});

test("a name becomes an examples-list entry", () => {
  assert.equal(api.slugify("Axel Flux Motor"), "axel-flux-motor");
  assert.equal(api.slugify("  Hello, World! "), "hello-world");
  const prepared = api.prepareModel({ name: "Garden Lamp", sizeBytes: 1200 });
  assert.equal(prepared.id, "garden-lamp");
  assert.equal(prepared.modelUrl, "https://superimmersive.io/models/garden-lamp.usdz");
  assert.equal(prepared.entry.placement, "floor");
  assert.equal(prepared.entry.animated, false);
  assert.equal(prepared.sidecar.name, "Garden Lamp");
  assert.equal(Object.keys(prepared.sidecar).length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.entry, "animationMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.entry, "faq"), false);
});

test("adding a model keeps every current catalog entry", () => {
  const prepared = api.prepareModel(sample());
  const added = api.applyCatalog(originalCatalog, prepared.entry, true);
  assert.equal(added.action, "add");
  const parsed = JSON.parse(added.text);
  assert.deepEqual(parsed.slice(0, -1), JSON.parse(originalCatalog));
  assert.equal(parsed.at(-1).id, "garden-lamp");
  const again = api.applyCatalog(added.text, prepared.entry, true);
  assert.equal(again.changed, false);
  const removed = api.applyCatalog(added.text, prepared.entry, false);
  assert.equal(removed.text, originalCatalog);
  const absent = api.applyCatalog(originalCatalog, prepared.entry, false);
  assert.equal(absent.changed, false);
  assert.equal(absent.text, originalCatalog);
});

test("reserved example ids are refused", () => {
  assert.match(api.validateId("biplane"), /example/);
  assert.throws(() => api.prepareModel(sample({ id: "test-box", name: "Test Box" })), /example/);
  assert.throws(() => api.prepareModel(sample({ id: "robot" })), /example/);
  assert.throws(() => api.prepareModel(sample({ id: "axel-flux-motor" })), /example/);
  assert.throws(() => api.prepareModel({ name: "!!!" }), /name/);
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

test("a file over 70 MB is refused", () => {
  assert.equal(api.sizeWarning(1000), "");
  assert.equal(api.sizeWarning(50 * 1024 * 1024), "");
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

test("publish commits the USDZ, sidecar, and catalog in one shot", async () => {
  const github = githubDouble(originalCatalog);
  const model = new Uint8Array([1, 2, 3, 255]);
  const prepared = api.prepareModel(sample({ sizeBytes: 0 }));
  const result = await api.publishModel({
    token: "github_pat_test_token_value",
    prepared: prepared,
    modelBytes: model,
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
    "models/garden-lamp.usdz"
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
  assert.equal(published.at(-1).placement, "floor");
  assert.equal(published.at(-1).animated, false);
  const sidecarBlob = blobs.find(function (call) {
    return call.body.encoding === "utf-8" && String(call.body.content).trim().startsWith("{");
  });
  assert.deepEqual(JSON.parse(sidecarBlob.body.content), { name: "Garden Lamp" });
  const commit = posts(github.calls, "/git/commits")[0].body;
  assert.deepEqual(commit.parents, ["1".repeat(40)]);
  assert.match(commit.message, /Publish AR model garden-lamp/);
  assert.equal(commit.message.includes("github_pat_"), false);
  const ref = github.calls.find(function (call) { return call.method === "PATCH"; });
  assert.equal(ref.body.force, false);
});

test("publishing again without a new file keeps the USDZ and stays listed", async () => {
  const listed = api.applyCatalog(originalCatalog, api.prepareModel(sample()).entry, true).text;
  const github = githubDouble(listed);
  github.usdz.set("garden-lamp.usdz", { sha: "existing-usdz", size: 4321 });
  const prepared = api.prepareModel(sample({ name: "Garden Lamp Revised", sizeBytes: 1 }));
  const result = await api.publishModel({
    token: "github_pat_test_token_value",
    prepared: prepared,
    fetch: github.fetchImpl
  });
  assert.equal(result.catalogAction, "update");
  const paths = posts(github.calls, "/git/trees")[0].body.tree.map(function (item) { return item.path; });
  assert.equal(paths.includes("models/garden-lamp.usdz"), false);
  const catalogCall = posts(github.calls, "/git/blobs").find(function (call) {
    return call.body.encoding === "utf-8" && String(call.body.content).indexOf('"test-box"') !== -1;
  });
  const published = JSON.parse(catalogCall.body.content);
  const row = published.find(function (item) { return item.id === "garden-lamp"; });
  assert.equal(row.name, "Garden Lamp Revised");
  assert.equal(row.sizeBytes, 4321);
});

test("every publish adds the catalog row", async () => {
  const github = githubDouble(originalCatalog);
  const result = await api.publishModel({
    token: "github_pat_test_token_value",
    prepared: api.prepareModel(sample({ sizeBytes: 0 })),
    modelBytes: new Uint8Array([4, 5]),
    fetch: github.fetchImpl
  });
  assert.equal(result.listed, true);
  const paths = posts(github.calls, "/git/trees")[0].body.tree.map(function (item) { return item.path; });
  assert.deepEqual(paths.sort(), ["ar/models/garden-lamp.json", "models/catalog.json", "models/garden-lamp.usdz"]);
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
