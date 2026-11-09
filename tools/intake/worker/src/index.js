/* Accepts a name and a USDZ from the intake page and stores both in the
   private superimmersive-client-models bucket. The browser never sees
   the bucket credentials. */
var MAX_BYTES = 70 * 1024 * 1024;
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
    "access-control-allow-methods": "POST, OPTIONS",
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
  return new Response(JSON.stringify(body), { status: status, headers: headers });
}

async function handle(request, env) {
  var origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") {
    if (!allowOrigin(origin)) return json({ error: "This page cannot upload." }, 403, origin);
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
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

export { MAX_BYTES, RESERVED_IDS, slugify, validateId, allowOrigin, handle };
export default { fetch: handle };
