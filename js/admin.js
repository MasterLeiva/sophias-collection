/* Admin panel: login, product list, create / edit / delete, offers, bestsellers, colors.
   Saves through js/admin-backends.mjs: the local server, or GitHub when the store is on GitHub Pages. */
import { colorHex } from "./colors.mjs";
import { detectBackend } from "./admin-backends.mjs";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "L " + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseNum = (v) => { const n = Number(String(v).replace(/[^\d.]/g, "")); return String(v).trim() && Number.isFinite(n) ? n : null; };
const onSale = (p) => p.salePrice != null && p.salePrice < p.price;

let products = [];
let editing = null;     // product being edited, or null when creating
let pendingFile = null; // resized photo waiting to be uploaded
let mainImage = null;   // current main photo path (products without colors)
// Colors being edited: { name, hex, image (saved path) | null, blob (new photo) | null, url (preview), autoHex }
let colorRows = [];
const filters = { q: "", cat: "", chip: "all" };
let backend;
const img = (path) => backend.imageUrl(path);

// Runs a backend call; an expired login sends you back to the login screen.
async function call(fn) {
  try { return await fn(); }
  catch (err) { if (err.auth) showLogin(err.message); throw err; }
}

// ---- Login ----------------------------------------------------------------------
function showLogin(message = "") {
  $(".js-app").hidden = true;
  $(".js-login").hidden = false;
  // Local server: password. GitHub Pages: GitHub access token.
  $$("[data-mode]").forEach((el) => (el.hidden = el.dataset.mode !== backend.kind));
  $(".js-login-error").textContent = message;
  closeEditor();
  setTimeout(() => $(".js-login-form input:not([hidden] *)")?.focus(), 50);
}
async function showApp() {
  $(".js-login").hidden = true;
  $(".js-app").hidden = false;
  $$("[data-mode]").forEach((el) => (el.hidden = el.dataset.mode !== backend.kind));
  products = await call(() => backend.list());
  render();
}

$(".js-login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $(".js-login-error");
  err.textContent = "";
  try {
    const secret = backend.kind === "github" ? e.target.token.value : e.target.password.value;
    if (!secret.trim()) throw new Error(backend.kind === "github" ? "Pega tu clave de GitHub" : "Escribe la contraseña");
    const btn = $(".js-login-btn");
    btn.disabled = true;
    try { await backend.login(secret); } finally { btn.disabled = false; }
    e.target.reset();
    showApp();
  } catch (ex) { err.textContent = ex.message; }
});
$(".js-logout").onclick = async () => { await backend.logout(); showLogin(); };

// ---- List -------------------------------------------------------------------------
const CHIPS = {
  all: { label: "Todos", test: () => true },
  bestseller: { label: "⭐ Más vendidos", test: (p) => p.bestseller },
  isNew: { label: "✨ Nuevos", test: (p) => p.isNew },
  forHim: { label: "👔 Para ellos", test: (p) => p.forHim },
  sale: { label: "🏷️ En oferta", test: onSale },
  hidden: { label: "🙈 Ocultos", test: (p) => p.hidden },
};
const categories = () => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "es"));

function render() {
  const cats = categories();
  const catSel = $(".js-cat");
  catSel.innerHTML = `<option value="">Todas las categorías</option>` + cats.map((c) => `<option ${c === filters.cat ? "selected" : ""}>${esc(c)}</option>`).join("");
  $("#categories").innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");

  $(".js-stats").innerHTML = [
    ["Productos", products.length],
    ["Más vendidos", products.filter((p) => p.bestseller).length],
    ["En oferta", products.filter(onSale).length],
    ["Ocultos", products.filter((p) => p.hidden).length],
  ].map(([l, n]) => `<div class="stat"><strong>${n}</strong><span>${l}</span></div>`).join("");

  $(".js-filter-chips").innerHTML = Object.entries(CHIPS).map(([k, c]) =>
    `<button class="chip ${filters.chip === k ? "is-active" : ""}" data-chip="${k}">${c.label}</button>`).join("");

  const q = filters.q.trim().toLowerCase();
  const list = products.filter((p) =>
    CHIPS[filters.chip].test(p) &&
    (!filters.cat || p.category === filters.cat) &&
    (!q || `${p.name} ${p.category}`.toLowerCase().includes(q)));

  $(".js-list").innerHTML = list.length ? list.map((p) => `
    <li class="row ${p.hidden ? "is-hidden" : ""}">
      <button class="row__main" data-edit="${esc(p.id)}" aria-label="Editar ${esc(p.name)}">
        <img src="${esc(img(p.image))}" alt="" loading="lazy">
        <span class="row__text">
          <span class="row__name">${esc(p.name)}</span>
          <span class="row__cat">${esc(p.category)}${p.hidden ? " · Oculto" : ""}${p.colors?.length > 1 ? ` · ${p.colors.length} colores` : ""}</span>
          ${p.colors?.length ? `<span class="row__dots">${p.colors.map((c) => `<i style="background:${esc(c.hex)}" title="${esc(c.name)}"></i>`).join("")}</span>` : ""}
          <span class="row__price">${onSale(p) ? `<b class="price--sale">${money(p.salePrice)}</b> <s>${money(p.price)}</s>` : money(p.price)}</span>
        </span>
      </button>
      <div class="row__toggles">
        <button class="pill ${p.bestseller ? "is-on" : ""}" data-toggle="bestseller" data-id="${esc(p.id)}" aria-pressed="${p.bestseller}">⭐ Más vendido</button>
        <button class="pill ${p.isNew ? "is-on" : ""}" data-toggle="isNew" data-id="${esc(p.id)}" aria-pressed="${p.isNew}">✨ Nuevo</button>
        <button class="pill ${p.forHim ? "is-on" : ""}" data-toggle="forHim" data-id="${esc(p.id)}" aria-pressed="${!!p.forHim}">👔 Para ellos</button>
        ${onSale(p) ? `<span class="pill is-on pill--sale">-${Math.round((1 - p.salePrice / p.price) * 100)}%</span>` : ""}
      </div>
    </li>`).join("") : `<li class="a-empty">No hay productos con estos filtros.</li>`;
}

$(".js-q").addEventListener("input", (e) => { filters.q = e.target.value; render(); });
$(".js-cat").addEventListener("change", (e) => { filters.cat = e.target.value; render(); });
$(".js-filter-chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-chip]");
  if (b) { filters.chip = b.dataset.chip; render(); }
});

$(".js-list").addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit]");
  if (edit) return openEditor(products.find((p) => p.id === edit.dataset.edit));
  const t = e.target.closest("[data-toggle]");
  if (!t) return;
  const p = products.find((x) => x.id === t.dataset.id);
  const field = t.dataset.toggle;
  t.disabled = true;
  try {
    const updated = await call(() => backend.update(p.id, { [field]: !p[field] }));
    Object.assign(p, updated);
    render();
    const msgs = {
      bestseller: p.bestseller ? "Agregado a Más vendidos" : "Quitado de Más vendidos",
      isNew: p.isNew ? "Marcado como Nuevo" : "Ya no aparece como Nuevo",
      forHim: p.forHim ? "Agregado a Para Ellos" : "Quitado de Para Ellos",
    };
    toast(msgs[field] + backend.savedNote);
  } catch (ex) { toast(ex.message); t.disabled = false; }
});

$(".js-import").onclick = async (e) => {
  e.target.disabled = true;
  try {
    const added = await call(() => backend.importNew());
    products = await call(() => backend.list());
    render();
    toast(added ? `Se importaron ${added} foto(s) nuevas${backend.savedNote}` : "No hay fotos nuevas en las carpetas");
  } catch (ex) { toast(ex.message); }
  e.target.disabled = false;
};

// ---- Editor -----------------------------------------------------------------------
const form = $(".js-form");
const editor = $(".js-editor");

function openEditor(p = null) {
  editing = p;
  pendingFile = null;
  mainImage = p?.image ?? null;
  colorRows.forEach((r) => r.blob && URL.revokeObjectURL(r.url));
  colorRows = (p?.colors || []).map((c) => ({ ...c, blob: null, url: img(c.image), autoHex: false }));
  renderColors();
  form.reset();
  $(".js-form-error").textContent = "";
  $("#editor-title").textContent = p ? "Editar producto" : "Nuevo producto";
  $(".js-delete").hidden = !p;
  $(".js-photo-label").textContent = p ? "Cambiar foto" : "Elegir foto";
  const photo = $(".js-photo");
  photo.src = p ? img(p.image) : "";
  photo.hidden = !p;

  form.name.value = p?.name ?? "";
  form.category.value = p?.category ?? (filters.cat || "");
  form.price.value = p?.price ?? "";
  form.salePrice.value = p?.salePrice ?? "";
  form.description.value = p?.description ?? "";
  form.bestseller.checked = !!p?.bestseller;
  form.isNew.checked = p ? !!p.isNew : true;
  form.forHim.checked = !!p?.forHim;
  form.hidden.checked = !!p?.hidden;
  $(".js-sale-toggle").checked = p ? onSale(p) : false;
  syncSale();

  editor.classList.add("is-open");
  editor.setAttribute("aria-hidden", "false");
  $(".js-overlay").classList.add("is-open");
  document.body.classList.add("no-scroll");
  editor.querySelector(".editor__body").scrollTop = 0;
}
function closeEditor() {
  editor.classList.remove("is-open");
  editor.setAttribute("aria-hidden", "true");
  $(".js-overlay").classList.remove("is-open");
  document.body.classList.remove("no-scroll");
}
$(".js-new").onclick = () => openEditor(null);
$$(".js-close").forEach((b) => (b.onclick = closeEditor));
$(".js-overlay").onclick = closeEditor;
document.addEventListener("keydown", (e) => e.key === "Escape" && closeEditor());

// Offer controls
function syncSale() {
  const on = $(".js-sale-toggle").checked;
  $(".js-sale-body").hidden = !on;
  const price = parseNum(form.price.value), sale = parseNum(form.salePrice.value);
  const note = $(".js-sale-note");
  note.className = "sale__note js-sale-note";
  if (!on || !sale) note.textContent = "";
  else if (!price || sale >= price) { note.textContent = "El precio de oferta debe ser menor que el precio normal."; note.classList.add("is-error"); }
  else note.textContent = `Descuento de ${Math.round((1 - sale / price) * 100)}% · antes ${money(price)}, ahora ${money(sale)}`;
}
$(".js-sale-toggle").addEventListener("change", () => { syncSale(); if ($(".js-sale-toggle").checked) form.salePrice.focus(); });
form.price.addEventListener("input", syncSale);
form.salePrice.addEventListener("input", syncSale);
$$("[data-pct]").forEach((b) => (b.onclick = () => {
  const price = parseNum(form.price.value);
  if (!price) return toast("Primero escribe el precio normal");
  form.salePrice.value = Math.round(price * (1 - b.dataset.pct / 100));
  syncSale();
}));

// Photo: shrink big phone photos before uploading (max 1600px, JPEG).
$(".js-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingFile = await resizeImage(file, 1600, 0.85);
    const photo = $(".js-photo");
    photo.src = URL.createObjectURL(pendingFile);
    photo.hidden = false;
    $(".js-photo-label").textContent = "Cambiar foto";
  } catch {
    toast("No se pudo leer esa imagen. Prueba con una foto JPG o PNG.");
  }
});

function resizeImage(file, max, quality) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((b) => (b ? ok(b) : fail()), "image/jpeg", quality);
    };
    img.onerror = fail;
    img.src = URL.createObjectURL(file);
  });
}

// ---- Colors ---------------------------------------------------------------------
function renderColors() {
  const hasColors = colorRows.length > 0;
  // With colors, each color has its own photo and the first one is the main photo.
  $(".js-photo-block").hidden = hasColors;
  $(".js-colors-hint").textContent = hasColors
    ? "La primera foto es la que se muestra primero. Toca una foto para cambiarla."
    : "¿Viene en varios colores? Agrega una foto por color y en la tienda aparecerán las bolitas para cambiar de color.";
  $(".js-color-list").innerHTML = colorRows.map((r, i) => `
    <li class="crow">
      <label class="crow__photo" title="Cambiar foto">
        <img src="${esc(r.url)}" alt="">
        <input type="file" accept="image/*" class="sr-only" data-color-photo="${i}">
      </label>
      <input class="crow__name" value="${esc(r.name)}" placeholder="Color (ej. Negro)" maxlength="40" data-color-name="${i}" aria-label="Nombre del color">
      <input type="color" class="crow__hex" value="${esc(r.hex)}" data-color-hex="${i}" aria-label="Tono del color">
      <div class="crow__actions">
        ${i > 0 ? `<button type="button" data-color-first="${i}" title="Mostrar primero" aria-label="Mostrar primero">↑</button>` : ""}
        <button type="button" data-color-remove="${i}" title="Quitar color" aria-label="Quitar color">✕</button>
      </div>
    </li>`).join("");
}

function photoRow(blob) {
  return { name: "", hex: "#cccccc", image: null, blob, url: URL.createObjectURL(blob), autoHex: true };
}

$(".js-color-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let blob;
  try { blob = await resizeImage(file, 1600, 0.85); } catch { return toast("No se pudo leer esa imagen. Prueba con una foto JPG o PNG."); }
  // First color on a product that already has a photo: that photo becomes the first color.
  if (!colorRows.length && (pendingFile || mainImage)) {
    colorRows.push(pendingFile ? photoRow(pendingFile)
      : { name: "", hex: "#cccccc", image: mainImage, blob: null, url: img(mainImage), autoHex: true });
    pendingFile = null;
  }
  colorRows.push(photoRow(blob));
  renderColors();
  const empty = $$(".crow__name").find((i) => !i.value);
  if (empty) empty.focus();
});

const colorList = $(".js-color-list");
colorList.addEventListener("input", (e) => {
  const i = e.target.dataset.colorName ?? e.target.dataset.colorHex;
  if (i == null) return;
  const r = colorRows[i];
  if ("colorName" in e.target.dataset) {
    r.name = e.target.value.trim();
    // Pick the swatch tone from the name ("Negro" → black) until it's set by hand.
    const hex = r.autoHex && colorHex(r.name);
    if (hex) { r.hex = hex; $(`[data-color-hex="${i}"]`).value = hex; }
  } else {
    r.hex = e.target.value;
    r.autoHex = false;
  }
});
colorList.addEventListener("change", async (e) => {
  const i = e.target.dataset.colorPhoto;
  if (i == null || !e.target.files[0]) return;
  try {
    const blob = await resizeImage(e.target.files[0], 1600, 0.85);
    Object.assign(colorRows[i], { blob, image: null, url: URL.createObjectURL(blob) });
    renderColors();
  } catch { toast("No se pudo leer esa imagen. Prueba con una foto JPG o PNG."); }
});
colorList.addEventListener("click", (e) => {
  const first = e.target.closest("[data-color-first]");
  if (first) { colorRows.unshift(...colorRows.splice(first.dataset.colorFirst, 1)); return renderColors(); }
  const rm = e.target.closest("[data-color-remove]");
  if (!rm) return;
  const [removed] = colorRows.splice(rm.dataset.colorRemove, 1);
  // Last color removed: keep its photo as the product's photo.
  if (!colorRows.length) {
    if (removed.blob) pendingFile = removed.blob; else mainImage = removed.image;
    const photo = $(".js-photo");
    photo.src = removed.url;
    photo.hidden = false;
  }
  renderColors();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $(".js-form-error");
  err.textContent = "";
  const name = form.name.value.trim();
  const category = form.category.value.trim();
  const price = parseNum(form.price.value);
  const saleOn = $(".js-sale-toggle").checked;
  const salePrice = saleOn ? parseNum(form.salePrice.value) : null;

  if (!name) return (err.textContent = "Escribe el nombre del producto.");
  if (!category) return (err.textContent = "Escribe o elige una categoría.");
  if (price == null) return (err.textContent = "Escribe el precio.");
  if (saleOn && (!salePrice || salePrice >= price)) return (err.textContent = "El precio de oferta debe ser menor que el precio normal.");
  const names = colorRows.map((r) => r.name.toLowerCase());
  if (names.some((n) => !n)) return (err.textContent = "Escribe el nombre de cada color.");
  if (new Set(names).size !== names.length) return (err.textContent = "Hay dos colores con el mismo nombre.");
  if (!colorRows.length && !pendingFile && !mainImage) return (err.textContent = "Elige una foto del producto.");

  const save = $(".js-save");
  save.disabled = true;
  save.textContent = "Guardando…";
  try {
    const body = {
      name, category, price, salePrice,
      description: form.description.value,
      bestseller: form.bestseller.checked,
      isNew: form.isNew.checked,
      forHim: form.forHim.checked,
      hidden: form.hidden.checked,
    };
    const upload = (blob, label) => call(() => backend.upload(blob, category, label));
    if (colorRows.length) {
      for (const r of colorRows) if (r.blob) { r.image = await upload(r.blob, `${name} ${r.name}`); r.blob = null; }
      body.colors = colorRows.map(({ name, hex, image }) => ({ name, hex, image }));
    } else {
      body.colors = [];
      if (pendingFile) { body.image = await upload(pendingFile, name); pendingFile = null; }
      else body.image = mainImage;
    }
    if (editing) {
      Object.assign(editing, await call(() => backend.update(editing.id, body)));
    } else {
      products.unshift(await call(() => backend.create(body)));
    }
    closeEditor();
    render();
    toast((editing ? "Cambios guardados ✓" : "Producto agregado ✓") + backend.savedNote);
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    save.disabled = false;
    save.textContent = "Guardar";
  }
});

$(".js-delete").onclick = async () => {
  if (!editing || !confirm(`¿Eliminar “${editing.name}” de la tienda? Esta acción no se puede deshacer desde el panel.`)) return;
  try {
    await call(() => backend.remove(editing.id));
    products = products.filter((p) => p !== editing);
    closeEditor();
    render();
    toast("Producto eliminado" + backend.savedNote);
  } catch (ex) { toast(ex.message); }
};

// ---- Toast ------------------------------------------------------------------------
let toastTimer;
function toast(text) {
  const t = $(".js-toast");
  t.textContent = text;
  t.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), 2800);
}

// ---- Boot -------------------------------------------------------------------------
const site = await fetch("data/site.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({}));
backend = await detectBackend(site);
(await backend.check()) ? showApp().catch((err) => toast(err.message)) : showLogin();
