// Where the admin panel saves changes.
//   LocalBackend  → the local server (node server.mjs), password login.
//   GitHubBackend → the GitHub repository behind GitHub Pages, using a GitHub access token.
//                   Each save is a commit; GitHub Pages republishes the store in 1–2 minutes.
import { cleanProduct, imagesOf, importImages, newProduct, slugify } from "./catalog.mjs";

const encodePath = (p) => p.normalize("NFC").split("/").map(encodeURIComponent).join("/");
const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// ---- Local server -------------------------------------------------------------------
export class LocalBackend {
  kind = "local";
  savedNote = "";

  async api(path, { method = "GET", body, headers = {} } = {}) {
    const isJson = body && !(body instanceof Blob);
    const res = await fetch(`/api/admin/${path}`, {
      method,
      headers: { "X-Admin": "1", ...(isJson ? { "Content-Type": "application/json" } : {}), ...headers },
      body: isJson ? JSON.stringify(body) : body,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "login") throw Object.assign(new Error(data.error || "Inicia sesión"), { auth: true });
    if (!res.ok) throw new Error(data.error || "Algo salió mal");
    return data;
  }

  check() { return this.api("me").then(() => true, () => false); }
  login(password) { return this.api("login", { method: "POST", body: { password } }); }
  logout() { return this.api("logout", { method: "POST" }).catch(() => {}); }
  list() { return this.api("products"); }
  create(body) { return this.api("products", { method: "POST", body }); }
  update(id, body) { return this.api(`products/${encodeURIComponent(id)}`, { method: "PUT", body }); }
  remove(id) { return this.api(`products/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  async importNew() { return (await this.api("import", { method: "POST" })).added; }
  async upload(blob, category, label) {
    return (await this.api(`upload?category=${encodeURIComponent(category)}`, {
      method: "POST", body: blob, headers: { "Content-Type": "image/jpeg", "X-Filename": encodeURIComponent(label).slice(0, 80) },
    })).image;
  }
  imageUrl(path) { return encodeURI(path.normalize("NFC")); }
}

// ---- GitHub -------------------------------------------------------------------------
const TOKEN_KEY = "sc-github-token";
const PRODUCTS_PATH = "data/products.json";

export class GitHubBackend {
  kind = "github";
  savedNote = " · se verá en la tienda en 1–2 min";

  // { owner, repo, branch } from data/site.json, or guessed from the github.io address.
  constructor(config = {}) {
    const host = location.hostname;
    const guessOwner = host.endsWith(".github.io") ? host.split(".")[0] : "";
    const firstDir = location.pathname.split("/")[1] || "";
    const guessRepo = firstDir && !firstDir.includes(".") ? firstDir : `${guessOwner}.github.io`;
    this.owner = config.owner || guessOwner;
    this.repo = config.repo || guessRepo;
    this.branch = config.branch || null; // null → the repo's default branch
    this.token = storage.get(TOKEN_KEY);
    this.files = new Map(); // repo path -> blob sha (for img/ files)
  }

  async gh(path, { method = "GET", body } = {}) {
    if (!this.owner || !this.repo) throw new Error("Falta configurar el usuario y repositorio de GitHub en data/site.json");
    const res = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error("La clave de GitHub no es válida o ya venció"), { auth: true });
    if (res.status === 409 || (res.status === 422 && /sha/i.test(data.message || ""))) throw Object.assign(new Error("conflict"), { conflict: true });
    if (res.status === 403) throw new Error("GitHub no permitió el cambio. Revisa que la clave tenga permiso de escritura (Contents: Read and write).");
    if (res.status === 404) throw new Error("No se encontró el repositorio o el archivo en GitHub");
    if (!res.ok) throw new Error(data.message || "Error al comunicarse con GitHub");
    return data;
  }

  async check() {
    if (!this.token) return false;
    try { await this.verify(); return true; } catch (err) { if (err.auth) this.logout(); return false; }
  }
  async verify() {
    const repo = await this.gh("");
    if (!repo.permissions?.push) throw new Error("Esta clave no tiene permiso para editar la tienda");
    this.branch = this.branch || repo.default_branch;
    await this.loadFiles();
  }
  async login(token) {
    this.token = String(token).trim();
    try { await this.verify(); } catch (err) { this.token = null; throw err; }
    storage.set(TOKEN_KEY, this.token);
  }
  logout() { this.token = null; storage.set(TOKEN_KEY, null); }

  // List every photo in the repo once (path → sha), so we can validate, import and delete.
  async loadFiles() {
    const tree = await this.gh(`/git/trees/${encodeURIComponent(this.branch)}?recursive=1`);
    this.files = new Map(tree.tree.filter((f) => f.type === "blob" && f.path.startsWith("img/")).map((f) => [f.path, f.sha]));
  }

  async readProducts() {
    const file = await this.gh(`/contents/${PRODUCTS_PATH}?ref=${encodeURIComponent(this.branch)}`);
    const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    return { list: JSON.parse(new TextDecoder().decode(bytes)), sha: file.sha };
  }

  // Read products.json, apply `change`, write it back as one commit. Retries if someone saved in between.
  async mutate(change, message) {
    for (let attempt = 0; ; attempt++) {
      const { list, sha } = await this.readProducts();
      const result = change(list);
      const json = JSON.stringify(list, null, 2) + "\n";
      const content = btoa(Array.from(new TextEncoder().encode(json), (b) => String.fromCharCode(b)).join(""));
      try {
        await this.gh(`/contents/${PRODUCTS_PATH}`, { method: "PUT", body: { message, content, sha, branch: this.branch } });
        return { result, list };
      } catch (err) {
        if (!err.conflict || attempt >= 2) throw err;
      }
    }
  }

  // Delete photos no product uses anymore (they stay in the repo history if ever needed).
  async deleteUnused(images, list) {
    for (const img of new Set(images)) {
      const sha = this.files.get(img);
      if (!sha || list.some((p) => imagesOf(p).includes(img))) continue;
      try {
        await this.gh(`/contents/${encodePath(img)}`, { method: "DELETE", body: { message: `Admin: borrar foto ${img}`, sha, branch: this.branch } });
        this.files.delete(img);
      } catch { /* a leftover photo is harmless */ }
    }
  }

  exists = (img) => this.files.has(img);

  async list() { return (await this.readProducts()).list; }

  async create(body) {
    const { result } = await this.mutate((list) => {
      const p = newProduct(body, list, this.exists);
      list.unshift(p);
      return p;
    }, `Admin: agregar ${body.name}`);
    return result;
  }

  async update(id, body) {
    let oldImages = [];
    const { result, list } = await this.mutate((list) => {
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) throw new Error("Producto no encontrado");
      const updated = cleanProduct(body, list[i], this.exists);
      if (!updated.name || !updated.category) throw new Error("Faltan nombre o categoría");
      oldImages = imagesOf(list[i]);
      list[i] = updated;
      return updated;
    }, `Admin: actualizar ${body.name || id}`);
    await this.deleteUnused(oldImages, list);
    return result;
  }

  async remove(id) {
    let removed;
    const { list } = await this.mutate((list) => {
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) throw new Error("Producto no encontrado");
      [removed] = list.splice(i, 1);
    }, `Admin: eliminar ${id}`);
    await this.deleteUnused(imagesOf(removed), list);
  }

  async importNew() {
    await this.loadFiles();
    const { result } = await this.mutate((list) => {
      const added = importImages(list, [...this.files.keys()]);
      if (!added.length) throw Object.assign(new Error("none"), { none: true });
      return added.length;
    }, "Admin: importar fotos nuevas").catch((err) => { if (err.none) return { result: 0 }; throw err; });
    return result;
  }

  async upload(blob, category, label) {
    const folder = category.replace(/[\\/:*?"<>|.]+/g, "").trim().slice(0, 60) || "Nuevos";
    const path = `img/${folder}/${slugify(label)}-${Math.random().toString(16).slice(2, 8)}.jpg`;
    const content = await new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = fail;
      r.readAsDataURL(blob);
    });
    const res = await this.gh(`/contents/${encodePath(path)}`, { method: "PUT", body: { message: `Admin: subir foto ${path}`, content, branch: this.branch } });
    this.files.set(path, res.content.sha);
    return path;
  }

  // New photos aren't on GitHub Pages until it republishes, so show them straight from the repo.
  imageUrl(path) {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${encodeURIComponent(this.branch)}/${encodePath(path)}`;
  }
}

// Running on the local server? Its API answers with JSON; GitHub Pages answers 404 HTML.
export async function detectBackend(site) {
  try {
    const res = await fetch("/api/admin/me", { credentials: "same-origin", cache: "no-store" });
    if ((res.headers.get("content-type") || "").includes("application/json")) return new LocalBackend();
  } catch {}
  return new GitHubBackend(site?.github);
}
