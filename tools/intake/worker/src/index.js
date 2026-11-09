/* Accepts a name and a USDZ from the intake page and stores both in the
   private superimmersive-client-models bucket. The browser never sees
   the bucket credentials. A later GET for that id returns a download
   link that lasts ten minutes. */
var MAX_BYTES = 70 * 1024 * 1024;
var LINK_TTL_SECONDS = 600;
var CLOCK_SKEW_SECONDS = 60;
var RESERVED_IDS = ["test-box", "biplane", "robot", "axel-flux-motor"];

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

function allowOrigin(origin) {
  if (
    origin === "https://superimmersive.io" ||
    origin === "https://www.superimmersive.io" ||
    origin === "https://superimmersive.github.io"
  ) {
    return origin;
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "")) return origin;
  return "";
}

function corsHeaders(origin) {
  var headers = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
  var allowed = allowOrigin(origin);
  if (allowed) headers["access-control-allow-origin"] = allowed;
  return headers;
}

function json(body, status, origin) {
  var headers = corsHeaders(origin);
  headers["content-type"] = "application/json; charset=utf-8";
  headers["cache-control"] = "private, no-store";
  return new Response(JSON.stringify(body), { status: status, headers: headers });
}

function safeEqual(left, right) {
  var a = String(left || "");
  var b = String(right || "");
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signDownload(id, exp, secret) {
  var key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  var signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id + "." + exp));
  var bytes = new Uint8Array(signed);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

async function verifyDownload(id, exp, sig, secret, nowMs) {
  if (!/^[1-9][0-9]*$/.test(String(exp || ""))) return false;
  var expiry = Number(exp);
  var now = Math.floor(nowMs / 1000);
  if (expiry < now - CLOCK_SKEW_SECONDS) return false;
  if (expiry > now + LINK_TTL_SECONDS + CLOCK_SKEW_SECONDS) return false;
  var expected = await signDownload(id, String(expiry), secret);
  return safeEqual(expected, String(sig || "").toLowerCase());
}

function modelPath(pathname) {
  var match = /^\/models\/([a-z0-9]+(?:-[a-z0-9]+)*)(\.usdz)?$/.exec(pathname);
  if (!match) return null;
  return { id: match[1], download: Boolean(match[2]) };
}

async function handle(request, env) {
  var origin = request.headers.get("origin") || "";
  var url = new URL(request.url);
  if (request.method === "OPTIONS") {
    if (!allowOrigin(origin)) return json({ error: "This page cannot upload." }, 403, origin);
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method === "GET") return download(url, env, origin);
  if (request.method !== "POST") return json({ error: "Send the USDZ with POST." }, 405, origin);
  if (!allowOrigin(origin)) return json({ error: "This page cannot upload." }, 403, origin);

  var form;
  try {
    form = await request.formData();
  } catch (error) {
    return json({ error: "Send the name and the USDZ together." }, 400, origin);
  }

  var name = String(form.get("name") || "").trim();
  if (!name || name.length > 120) return json({ error: "Enter a product name." }, 400, origin);
  var id = slugify(name);
  var idError = validateId(id);
  if (idError) return json({ error: idError }, 400, origin);

  var file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return json({ error: "Choose a USDZ file." }, 400, origin);
  }
  var filename = String(file.name || "");
  if (!/\.usdz$/i.test(filename)) return json({ error: "Choose a .usdz file." }, 400, origin);
  var size = Number(file.size);
  if (!Number.isInteger(size) || size < 1) return json({ error: "The USDZ file is empty." }, 400, origin);
  if (size > MAX_BYTES) return json({ error: "This USDZ is over 70 MB." }, 413, origin);

  var usdzKey = "models/" + id + ".usdz";
  var sidecarKey = "models/" + id + ".json";
  var body = typeof file.stream === "function" ? file.stream() : await file.arrayBuffer();
  await env.MODELS.put(usdzKey, body, {
    httpMetadata: { contentType: "model/vnd.usdz+zip" }
  });
  try {
    await env.MODELS.put(sidecarKey, JSON.stringify({ name: name }) + "\n", {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
  } catch (error) {
    await env.MODELS.delete(usdzKey);
    return json({ error: "The model did not finish storing. Try again." }, 502, origin);
  }

  return json({ id: id, key: usdzKey, bytes: size, name: name }, 200, origin);
}

async function download(url, env, origin) {
  if (origin && !allowOrigin(origin)) return json({ error: "This page cannot fetch models." }, 403, origin);
  var parsed = modelPath(url.pathname);
  if (!parsed) return json({ error: "That model id is not valid." }, 404, origin);
  var idError = validateId(parsed.id);
  if (idError) return json({ error: idError }, 400, origin);
  if (!env.DOWNLOAD_SECRET) return json({ error: "Download links are not available." }, 500, origin);

  var key = "models/" + parsed.id + ".usdz";
  if (!parsed.download) {
    var existing = await env.MODELS.head(key);
    if (!existing) return json({ error: "That model is not stored." }, 404, origin);
    var exp = String(Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS);
    var sig = await signDownload(parsed.id, exp, env.DOWNLOAD_SECRET);
    var link = new URL("/models/" + parsed.id + ".usdz", url.origin);
    link.searchParams.set("exp", exp);
    link.searchParams.set("sig", sig);
    return json({
      id: parsed.id,
      url: link.toString(),
      expiresAt: new Date(Number(exp) * 1000).toISOString()
    }, 200, origin);
  }

  var fresh = await verifyDownload(
    parsed.id,
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
    env.DOWNLOAD_SECRET,
    Date.now()
  );
  if (!fresh) return json({ error: "This download link is not valid." }, 403, origin);
  var object = await env.MODELS.get(key);
  if (!object || object.body == null) return json({ error: "That model is not stored." }, 404, origin);
  var headers = corsHeaders(origin);
  headers["content-type"] = "model/vnd.usdz+zip";
  headers["cache-control"] = "private, no-store";
  if (object.size != null) headers["content-length"] = String(object.size);
  return new Response(object.body, { status: 200, headers: headers });
}

export {
  MAX_BYTES,
  LINK_TTL_SECONDS,
  RESERVED_IDS,
  slugify,
  validateId,
  allowOrigin,
  signDownload,
  verifyDownload,
  handle
};
export default { fetch: handle };
