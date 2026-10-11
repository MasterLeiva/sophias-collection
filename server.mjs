// Sophia's Collection — servidor local de la tienda + panel de admin (para usar en tu computadora).
// Sin dependencias. Iniciar desde la carpeta del proyecto:   node server.mjs
// En internet (GitHub Pages) no se usa este archivo: el admin guarda directo en GitHub.
//
// Contraseña del admin local: variable de entorno ADMIN_PASSWORD, o el archivo .admin/password.txt
// (se crea solo la primera vez con una contraseña aleatoria).
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { TRASH, cleanProduct, imagesOf, importImages, keepOnePerCategory, newProduct, slugify } from "./js/catalog.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const PRODUCTS_FILE = join(ROOT, "data", "products.json");
const IMG_DIR = join(ROOT, "img");
const MAX_UPLOAD = 15 * 1024 * 1024;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

// ---- Admin password ------------------------------------------------------------
function loadPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const file = join(ROOT, ".admin", "password.txt");
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(9).toString("base64url") + "\n", { mode: 0o600 });
    console.log(`Se creó una contraseña de admin en ${file}`);
  }
  return readFileSync(file, "utf8").trim();
}
const PASSWORD_HASH = createHash("sha256").update(loadPassword()).digest();
const sessions = new Map(); // token -> expiry
const failures = new Map(); // ip -> { count, until }

// ---- Catalog storage ----------------------------------------------------------
const readJSON = (file, fallback) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; } };
function writeJSON(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + ".tmp", JSON.stringify(data, null, 2) + "\n");
  renameSync(file + ".tmp", file); // atomic replace
}
const loadProducts = () => readJSON(PRODUCTS_FILE, []);
const saveProducts = (list) => writeJSON(PRODUCTS_FILE, list);
const imageExists = (img) => existsSync(join(ROOT, img));

// Adds photos dropped into img/<Categoría>/ (see importImages in js/catalog.mjs).
function importNewImages() {
  const paths = [];
  for (const dir of readdirSync(IMG_DIR, { withFileTypes: true })) {
    if (dir.isDirectory()) for (const file of readdirSync(join(IMG_DIR, dir.name))) paths.push(`img/${dir.name}/${file}`);
  }
  const list = loadProducts();
  const added = importImages(list, paths);
  if (added.length) saveProducts(list);
  return added;
}

// Moves a photo no product uses anymore to img/_papelera, so the importer
// doesn't add it back (and it can still be recovered by hand).
function trashImage(image, list) {
  const abs = join(ROOT, image);
  if (!image.startsWith("img/") || image.includes("..") || !existsSync(abs) || list.some((p) => imagesOf(p).includes(image))) return;
  mkdirSync(join(IMG_DIR, TRASH), { recursive: true });
  renameSync(abs, join(IMG_DIR, TRASH, `${Date.now()}-${image.split("/").pop()}`));
}

// ---- HTTP helpers ---------------------------------------------------------------
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".ico": "image/x-icon",
};
const PUBLIC_PAGES = { "/": "index.html", "/index.html": "index.html", "/shop.html": "shop.html", "/product.html": "product.html", "/admin": "admin.html", "/admin.html": "admin.html" };
const PUBLIC_DIRS = ["css/", "js/", "assets/", "img/"];

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, {
    "Content-Type": isJson ? TYPES[".json"] : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((ok, fail) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { fail(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}
const readJsonBody = async (req) => { try { return JSON.parse((await readBody(req, 1e6)).toString("utf8") || "{}"); } catch { return {}; } };

const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]));
function isAdmin(req) {
  const token = cookies(req).sc_admin;
  const exp = token && sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function serveFile(req, res, rel) {
  const abs = resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + sep) || !existsSync(abs) || !statSync(abs).isFile()) return send(res, 404, "No encontrado");
  const { size } = statSync(abs);
  const type = TYPES[extname(abs).toLowerCase()] || "application/octet-stream";
  const cache = /^(img|assets)\//.test(rel) ? "public, max-age=3600" : "no-cache";
  const base = { "Content-Type": type, "Cache-Control": cache, "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" };
  // Byte ranges: required for video playback on iPhone.
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return send(res, 416, "", { "Content-Range": `bytes */${size}` });
    res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return req.method === "HEAD" ? res.end() : createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, "Content-Length": size });
  req.method === "HEAD" ? res.end() : createReadStream(abs).pipe(res);
}

// ---- Admin API -------------------------------------------------------------------
async function adminApi(req, res, path) {
  const ip = req.socket.remoteAddress;

  if (path === "/api/admin/login" && req.method === "POST") {
    const f = failures.get(ip);
    if (f && f.until > Date.now()) return send(res, 429, { error: "Demasiados intentos. Espera unos minutos." });
    const { password = "" } = await readJsonBody(req);
    const given = createHash("sha256").update(String(password)).digest();
    if (!timingSafeEqual(given, PASSWORD_HASH)) {
      const count = (f?.count || 0) + 1;
      failures.set(ip, { count, until: count >= 5 ? Date.now() + 10 * 60 * 1000 : 0 });
      return send(res, 401, { error: "Contraseña incorrecta" });
    }
    failures.delete(ip);
    const token = randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + SESSION_MS);
    return send(res, 200, { ok: true }, { "Set-Cookie": `sc_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
  }

  if (!isAdmin(req)) return send(res, 401, { error: "Inicia sesión" });
  // Every state-changing request must come from our own admin page.
  if (req.method !== "GET" && req.headers["x-admin"] !== "1") return send(res, 403, { error: "Solicitud no permitida" });

  if (path === "/api/admin/me") return send(res, 200, { ok: true });

  if (path === "/api/admin/logout" && req.method === "POST") {
    sessions.delete(cookies(req).sc_admin);
    return send(res, 200, { ok: true }, { "Set-Cookie": "sc_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }

  if (path === "/api/admin/products" && req.method === "GET") return send(res, 200, loadProducts());

  if (path === "/api/admin/products" && req.method === "POST") {
    const list = loadProducts();
    let p;
    try { p = newProduct(await readJsonBody(req), list, imageExists); } catch (err) { return send(res, 400, { error: err.message }); }
    list.unshift(p);
    keepOnePerCategory(list, p);
    saveProducts(list);
    return send(res, 201, p);
  }

  const one = path.match(/^\/api\/admin\/products\/([\w-]+)$/);
  if (one) {
    const list = loadProducts();
    const i = list.findIndex((p) => p.id === one[1]);
    if (i < 0) return send(res, 404, { error: "Producto no encontrado" });
    if (req.method === "PUT") {
      const updated = cleanProduct(await readJsonBody(req), list[i], imageExists);
      if (!updated.name || !updated.category) return send(res, 400, { error: "Faltan nombre o categoría" });
      const oldImages = imagesOf(list[i]);
      list[i] = updated;
      keepOnePerCategory(list, updated);
      saveProducts(list);
      for (const img of oldImages) if (!imagesOf(updated).includes(img)) trashImage(img, list);
      return send(res, 200, updated);
    }
    if (req.method === "DELETE") {
      const [removed] = list.splice(i, 1);
      saveProducts(list);
      for (const img of new Set(imagesOf(removed))) trashImage(img, list);
      return send(res, 200, { ok: true });
    }
  }

  if (path === "/api/admin/upload" && req.method === "POST") {
    const type = req.headers["content-type"] || "";
    const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[type.split(";")[0]];
    if (!ext) return send(res, 415, { error: "Formato de imagen no soportado (usa JPG, PNG o WebP)" });
    const category = String(new URL(req.url, "http://x").searchParams.get("category") || "Nuevos").replace(/[\\/:*?"<>|.]+/g, "").trim().slice(0, 60) || "Nuevos";
    const buf = await readBody(req, MAX_UPLOAD);
    if (!buf.length) return send(res, 400, { error: "Imagen vacía" });
    const dir = join(IMG_DIR, category);
    mkdirSync(dir, { recursive: true });
    let label = "foto";
    try { label = decodeURIComponent(req.headers["x-filename"] || "foto"); } catch {}
    const name = `${slugify(label)}-${randomBytes(3).toString("hex")}${ext}`;
    writeFileSync(join(dir, name), buf);
    return send(res, 201, { image: `img/${category}/${name}` });
  }

  if (path === "/api/admin/import" && req.method === "POST") {
    const added = importNewImages();
    return send(res, 200, { added: added.length, products: added });
  }

  send(res, 404, { error: "No encontrado" });
}

// ---- Router -----------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return send(res, 400, "URL inválida"); }

    if (path.startsWith("/api/admin/")) return await adminApi(req, res, path);

    if (path === "/data/products.json" || path === "/data/site.json") return serveFile(req, res, path.slice(1));
    if (PUBLIC_PAGES[path]) return serveFile(req, res, PUBLIC_PAGES[path]);

    const rel = normalize(path.replace(/^\/+/, ""));
    if (PUBLIC_DIRS.some((d) => rel.startsWith(d)) && !rel.includes(`${TRASH}`)) return serveFile(req, res, rel);
    send(res, 404, "No encontrado");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status === 413 ? "Archivo demasiado grande" : "Error del servidor" });
  }
});

const added = importNewImages();
if (added.length) console.log(`Se importaron ${added.length} foto(s) nuevas desde img/`);
setInterval(() => { const now = Date.now(); for (const [t, exp] of sessions) if (exp < now) sessions.delete(t); }, 3600e3).unref();

server.listen(PORT, () => {
  console.log(`Tienda:  http://localhost:${PORT}`);
  console.log(`Admin:   http://localhost:${PORT}/admin`);
});
