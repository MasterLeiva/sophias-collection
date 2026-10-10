/* ==========================================================================
   Sophia's Collection — shared site logic (header, footer, cart, favorites)
   Catalog comes from data/products.json, settings from data/site.json
   (both edited through the admin panel / by hand). Page scripts run inside
   App.ready.then(...) so the data is loaded first.
   ========================================================================== */

// ---- Helpers ----------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => "L " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// NFC: a Mac writes "ñ" as "n" + tilde, GitHub stores it as one "ñ"; always ask for the latter.
const src = (path) => encodeURI(String(path).normalize("NFC"));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byId = (id) => window.PRODUCTS.find((p) => p.id === id);
const productUrl = (p) => `product.html?id=${encodeURIComponent(p.id)}`;
const categoryUrl = (c) => `shop.html?cat=${encodeURIComponent(c)}`;
const onSale = (p) => p.salePrice != null && p.salePrice < p.price;
const priceOf = (p) => (onSale(p) ? p.salePrice : p.price);
const discount = (p) => Math.round((1 - p.salePrice / p.price) * 100);
// Colors: p.colors = [{ name, hex, image }]. The first one is the default.
const colorsOf = (p) => p.colors || [];
const findColor = (p, name) => colorsOf(p).find((c) => c.name === name) || colorsOf(p)[0] || null;
const imageFor = (p, colorName) => findColor(p, colorName)?.image || p.image;

const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.5 3.9 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.2 0 5.4 3 4.3 6.2C19.5 15.4 12 20 12 20Z"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>',
  chevL: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m15 6-6 6 6 6"/></svg>',
  chevR: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 6 6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".9" fill="currentColor"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2s.2-1.1.1-1.2l-.5-.3Z"/></svg>',
};
const icon = (name, size) => ICONS[name].replace("<svg", `<svg width="${size}" height="${size}"`);

// ---- Contact: orders on WhatsApp, Instagram to follow ---------------------------------
const igProfile = () => `https://www.instagram.com/${CONFIG.instagram}/`;
const waLink = (text) => `https://wa.me/${CONFIG.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
const waGreeting = () => `¡Hola ${CONFIG.storeName}! Tengo una consulta.`;
// "50431423808" → "+504 3142-3808"
const waDisplay = () => String(CONFIG.whatsapp).replace(/^(504)(\d{4})(\d{4})$/, "+$1 $2-$3");

function orderMessage(lines) {
  const rows = lines.map((l) => `• ${l.qty} x ${l.product.name}${l.color ? ` — Color: ${l.color}` : ""} (${l.product.category}) — ${money(l.qty * priceOf(l.product))}`);
  const total = lines.reduce((n, l) => n + l.qty * priceOf(l.product), 0);
  return `¡Hola ${CONFIG.storeName}! Me gustaría hacer este pedido:\n\n${rows.join("\n")}\n\nTotal: ${money(total)}`;
}

// Opens WhatsApp (app on phones, WhatsApp Web on computers) with the order already written.
function sendOrder(lines) {
  window.open(waLink(orderMessage(lines)), "_blank", "noopener");
}

// ---- Cart & favorites state ---------------------------------------------------
// A cart line is one product in one color.
const lineKey = (id, color) => `${id}::${color || ""}`;
const Cart = {
  items: storage.get("sc-cart", []), // [{ id, color, qty }]
  save() { storage.set("sc-cart", this.items); renderCart(); updateCounts(); },
  find(key) { return this.items.find((i) => lineKey(i.id, i.color) === key); },
  add(id, qty = 1, color = null) {
    const p = byId(id);
    color = p && colorsOf(p).length ? findColor(p, color).name : null;
    const line = this.find(lineKey(id, color));
    if (line) line.qty += qty; else this.items.push({ id, color, qty });
    this.save();
  },
  setQty(key, qty) {
    if (qty <= 0) this.items = this.items.filter((i) => lineKey(i.id, i.color) !== key);
    else this.find(key).qty = qty;
    this.save();
  },
  lines() {
    return this.items.map((i) => {
      const product = byId(i.id);
      // Drop a color the store no longer offers back to the default one.
      const color = product && colorsOf(product).length ? findColor(product, i.color).name : null;
      i.color = color; // keeps the line key in sync with what's shown
      return { ...i, color, product };
    }).filter((l) => l.product);
  },
  count() { return this.lines().reduce((n, l) => n + l.qty, 0); },
  total() { return this.lines().reduce((n, l) => n + l.qty * priceOf(l.product), 0); },
};

const Wishlist = {
  ids: storage.get("sc-wishlist", []),
  has(id) { return this.ids.includes(id); },
  toggle(id) {
    this.ids = this.has(id) ? this.ids.filter((x) => x !== id) : [...this.ids, id];
    storage.set("sc-wishlist", this.ids);
    updateCounts();
    $$(`[data-wish="${CSS.escape(id)}"]`).forEach((b) => {
      b.classList.toggle("is-on", this.has(id));
      b.setAttribute("aria-pressed", this.has(id));
    });
    document.dispatchEvent(new CustomEvent("wishlist:change"));
    return this.has(id);
  },
};

// ---- Price + product card (used everywhere) -----------------------------------
function priceHtml(p) {
  return onSale(p)
    ? `<span class="price price--sale">${money(p.salePrice)}</span> <s class="price price--was">${money(p.price)}</s>`
    : `<span class="price">${money(p.price)}</span>`;
}

// Little color dots; tapping one swaps the photo (see initDelegation).
function swatches(p, active, { max = 6, size = "" } = {}) {
  const cs = colorsOf(p);
  if (cs.length < 2) return "";
  const shown = cs.slice(0, max);
  return `<div class="swatches ${size}" role="group" aria-label="Colores disponibles">
    ${shown.map((c) => `<button class="swatch ${c.name === active ? "is-active" : ""}" style="--swatch:${esc(c.hex)}" data-swatch="${esc(c.name)}" aria-label="${esc(c.name)}" aria-pressed="${c.name === active}" title="${esc(c.name)}"></button>`).join("")}
    ${cs.length > max ? `<span class="swatches__more">+${cs.length - max}</span>` : ""}
  </div>`;
}

function productCard(p) {
  const on = Wishlist.has(p.id);
  const color = findColor(p)?.name || "";
  const badge = onSale(p) ? `<span class="card__badge card__badge--sale">-${discount(p)}%</span>`
    : p.isNew ? `<span class="card__badge">Nuevo</span>` : "";
  return `
    <article class="card" data-product="${esc(p.id)}">
      <div class="card__media">
        ${badge}
        <img src="${src(imageFor(p))}" alt="${esc(p.name)}" loading="lazy" decoding="async">
        <button class="card__wish ${on ? "is-on" : ""}" data-wish="${esc(p.id)}" aria-pressed="${on}" aria-label="Agregar a favoritos">${ICONS.heart}</button>
        <button class="card__add" data-add="${esc(p.id)}" data-color="${esc(color)}">${ICONS.plus} Agregar</button>
      </div>
      ${swatches(p, color)}
      <span class="card__cat">${esc(p.category)}${colorsOf(p).length > 1 ? ` · ${colorsOf(p).length} colores` : ""}</span>
      <a class="card__name card__link" href="${productUrl(p)}${color && colorsOf(p).length > 1 ? `&color=${encodeURIComponent(color)}` : ""}">${esc(p.name)}</a>
      <span class="card__price">${priceHtml(p)}</span>
    </article>`;
}

// ---- Layout: announcement, header, drawers, footer ------------------------------
function renderChrome() {
  const cats = window.CATEGORIES;
  const year = new Date().getFullYear();
  const igLink = (label, cls = "") => `<a class="${cls}" href="${igProfile()}" target="_blank" rel="noopener">${label}</a>`;
  const waContact = (label, cls = "") => `<a class="${cls}" href="${waLink(waGreeting())}" target="_blank" rel="noopener">${label}</a>`;

  document.body.insertAdjacentHTML("afterbegin", `
    <a class="sr-only" href="#main">Saltar al contenido</a>
    <div class="announcement" role="region" aria-label="Anuncios">
      <button class="js-ann-prev" aria-label="Anterior">${ICONS.chevL}</button>
      <div class="announcement__track">
        ${CONFIG.announcements.map((t, i) => `<p class="announcement__msg ${i === 0 ? "is-active" : ""}">${esc(t)}</p>`).join("")}
      </div>
      <button class="js-ann-next" aria-label="Siguiente">${ICONS.chevR}</button>
    </div>
    <header class="header">
      <div class="container header__inner">
        <nav class="header__nav" aria-label="Principal">
          <a href="shop.html">Tienda</a>
          ${cats.map((c) => `<a href="${categoryUrl(c)}">${esc(c)}</a>`).join("")}
        </nav>
        <a class="header__logo" href="index.html" aria-label="${esc(CONFIG.storeName)} — Inicio">
          <img src="assets/logo.png" alt="${esc(CONFIG.storeName)}" width="600" height="150">
        </a>
        <div class="header__icons">
          <button class="icon-btn js-search-open" aria-label="Buscar">${ICONS.search}</button>
          <a class="icon-btn" href="shop.html?view=favoritos" aria-label="Favoritos">${ICONS.heart}<span class="badge-count js-wish-count" data-count="0">0</span></a>
          <button class="icon-btn js-cart-open" aria-label="Carrito">${ICONS.bag}<span class="badge-count js-cart-count" data-count="0">0</span></button>
          <button class="icon-btn js-menu-open" aria-label="Menú">${ICONS.menu}</button>
        </div>
      </div>
    </header>

    <div class="overlay js-overlay"></div>

    <aside class="drawer drawer--right js-menu" aria-label="Menú" aria-hidden="true">
      <div class="drawer__head">
        <img src="assets/logo.png" alt="" style="height:30px;width:auto">
        <button class="icon-btn js-close" aria-label="Cerrar">${ICONS.close}</button>
      </div>
      <div class="drawer__body">
        <ul class="menu-list">
          <li><a href="shop.html">Ver todo ${ICONS.arrow}</a></li>
          ${PRODUCTS.some(onSale) ? `<li><a href="shop.html?view=ofertas">Ofertas ${ICONS.arrow}</a></li>` : ""}
          ${cats.map((c) => `<li><a href="${categoryUrl(c)}">${esc(c)} ${ICONS.arrow}</a></li>`).join("")}
          <li><a href="shop.html?view=favoritos">Favoritos ${ICONS.arrow}</a></li>
        </ul>
        <div class="menu-extra">
          ${waContact(`${icon("whatsapp", 18)} Escríbenos: ${esc(waDisplay())}`, "ig-link")}
          ${igLink(`${icon("instagram", 18)} Síguenos: @${esc(CONFIG.instagram)}`, "ig-link")}
        </div>
      </div>
    </aside>

    <aside class="drawer drawer--right js-cart" aria-label="Carrito" aria-hidden="true">
      <div class="drawer__head">
        <span class="drawer__title">Tu carrito</span>
        <button class="icon-btn js-close" aria-label="Cerrar">${ICONS.close}</button>
      </div>
      <div class="drawer__body js-cart-body"></div>
      <div class="drawer__foot js-cart-foot"></div>
    </aside>


    <div class="search-panel js-search" role="dialog" aria-label="Buscar" aria-hidden="true">
      <div class="search-panel__bar container">
        ${icon("search", 22)}
        <label class="sr-only" for="search-input">Buscar productos</label>
        <input id="search-input" class="js-search-input" type="search" placeholder="Buscar perfumes, bolsos, lentes…" autocomplete="off">
        <button class="icon-btn js-close" aria-label="Cerrar">${ICONS.close}</button>
      </div>
      <div class="search-results container js-search-results"></div>
    </div>

    <div class="toast js-toast" role="status" aria-live="polite"></div>
  `);

  document.body.insertAdjacentHTML("beforeend", `
    <div class="container">
      <section class="usps" aria-label="Beneficios">
        <div class="usp"><span class="usp__icon">${ICONS.truck}</span><div><h4>Envíos a toda Honduras</h4><p>Recibe tu pedido en la puerta de tu casa</p></div></div>
        <div class="usp"><span class="usp__icon">${ICONS.chat}</span><div><h4>Atención personalizada</h4><p>Te asesoramos por WhatsApp</p></div></div>
        <div class="usp"><span class="usp__icon">${ICONS.sparkle}</span><div><h4>Marcas que amas</h4><p>Nuevos productos cada semana</p></div></div>
      </section>
    </div>
    <footer class="footer">
      <div class="container">
        <div class="footer__grid">
          <details><summary>Tienda</summary><ul>
            <li><a href="shop.html">Ver todo</a></li>
            ${cats.map((c) => `<li><a href="${categoryUrl(c)}">${esc(c)}</a></li>`).join("")}
          </ul></details>
          <details><summary>Ayuda</summary><ul>
            <li>${waContact(`WhatsApp ${esc(waDisplay())}`)}</li>
            <li><a href="shop.html?view=favoritos">Mis favoritos</a></li>
          </ul></details>
          <div class="footer__ig">
            <h4>Síguenos en Instagram</h4>
            <p>Novedades, nuevos ingresos y ofertas en nuestras publicaciones.</p>
            ${igLink(`${icon("instagram", 18)} @${esc(CONFIG.instagram)}`, "btn btn--ig")}
          </div>
        </div>
        <div class="footer__bottom">
          <img src="assets/logo.png" alt="${esc(CONFIG.storeName)}">
          <p>© ${year} ${esc(CONFIG.storeName)}. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
    <a class="wa-float" href="${waLink(waGreeting())}" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">${ICONS.whatsapp}</a>
  `);

  // Footer columns are always open on desktop.
  const mq = matchMedia("(min-width: 1000px)");
  const syncFooter = () => $$(".footer details").forEach((d) => (d.open = mq.matches));
  syncFooter();
  mq.addEventListener("change", syncFooter);
}

// ---- Announcement bar -------------------------------------------------------
function initAnnouncements() {
  const msgs = $$(".announcement__msg");
  if (!msgs.length) return $(".announcement").remove();
  let i = 0, timer;
  const show = (n) => {
    msgs[i].classList.remove("is-active");
    i = (n + msgs.length) % msgs.length;
    msgs[i].classList.add("is-active");
    clearInterval(timer);
    timer = setInterval(() => show(i + 1), 4500);
  };
  $(".js-ann-prev").onclick = () => show(i - 1);
  $(".js-ann-next").onclick = () => show(i + 1);
  show(0);
}

// ---- Drawers & panels ------------------------------------------------------
let activePanel = null;
function openPanel(panel) {
  closePanel();
  activePanel = panel;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  $(".js-overlay").classList.add("is-open");
  document.body.classList.add("no-scroll");
}
function closePanel() {
  if (!activePanel) return;
  activePanel.classList.remove("is-open");
  activePanel.setAttribute("aria-hidden", "true");
  $(".js-overlay").classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  activePanel = null;
}
window.openCart = () => openPanel($(".js-cart"));

function initPanels() {
  $(".js-menu-open").onclick = () => openPanel($(".js-menu"));
  $(".js-cart-open").onclick = () => openPanel($(".js-cart"));
  $(".js-search-open").onclick = () => {
    openPanel($(".js-search"));
    renderSearch("");
    setTimeout(() => $(".js-search-input").focus(), 50);
  };
  $(".js-overlay").onclick = closePanel;
  $$(".js-close").forEach((b) => (b.onclick = closePanel));
  document.addEventListener("keydown", (e) => e.key === "Escape" && closePanel());
  $(".js-search-input").addEventListener("input", (e) => renderSearch(e.target.value));


  const header = $(".header");
  const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 10);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function renderSearch(q) {
  const box = $(".js-search-results");
  const term = q.trim().toLowerCase();
  if (!term) {
    box.innerHTML = `<p class="search-hint">Categorías populares</p>
      <div class="chips">${CATEGORIES.map((c) => `<a class="chip" href="${categoryUrl(c)}">${esc(c)}</a>`).join("")}</div>`;
    return;
  }
  const hits = PRODUCTS.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(term));
  box.innerHTML = hits.length
    ? `<p class="search-hint">${hits.length} resultado${hits.length === 1 ? "" : "s"}</p>` +
      hits.slice(0, 12).map((p) => `
        <a class="line-item" href="${productUrl(p)}" style="grid-template-columns:60px 1fr auto">
          <img src="${src(p.image)}" alt="" style="width:60px" loading="lazy">
          <div><div class="line-item__name">${esc(p.name)}</div><div class="line-item__cat">${esc(p.category)}</div></div>
          <span class="line-item__price">${money(priceOf(p))}</span>
        </a>`).join("")
    : `<p class="search-hint">No encontramos resultados para “${esc(q)}”.</p>`;
}

// ---- Cart drawer ------------------------------------------------------------
function renderCart() {
  const body = $(".js-cart-body"), foot = $(".js-cart-foot");
  if (!body) return;
  const lines = Cart.lines();
  if (!lines.length) {
    body.innerHTML = `<div class="cart-empty"><h3>Tu carrito está vacío</h3><p>¡Descubre nuestras novedades!</p><a class="btn" href="shop.html">Ir a la tienda</a></div>`;
    foot.hidden = true;
    return;
  }
  foot.hidden = false;
  body.innerHTML = lines.map(({ product: p, qty, color }) => {
    const key = esc(lineKey(p.id, color));
    const url = productUrl(p) + (color ? `&color=${encodeURIComponent(color)}` : "");
    return `
    <div class="line-item">
      <a href="${url}"><img src="${src(imageFor(p, color))}" alt="${esc(p.name)}"></a>
      <div>
        <a class="line-item__name" href="${url}">${esc(p.name)}</a>
        <div class="line-item__cat">${color ? `Color: ${esc(color)} · ` : ""}${esc(p.category)}</div>
        <div class="qty">
          <button data-qty="${key}" data-delta="-1" aria-label="Quitar uno">−</button>
          <span>${qty}</span>
          <button data-qty="${key}" data-delta="1" aria-label="Agregar uno">+</button>
        </div>
        <div><button class="line-item__remove" data-remove="${key}">Eliminar</button></div>
      </div>
      <span class="line-item__price">${money(priceOf(p) * qty)}${onSale(p) ? `<br><s class="price--was">${money(p.price * qty)}</s>` : ""}</span>
    </div>`;
  }).join("");
  foot.innerHTML = `
    <div class="cart-total"><span>Subtotal</span><span>${money(Cart.total())}</span></div>
    <p class="cart-note">El envío se coordina al confirmar tu pedido.</p>
    <button class="btn btn--whatsapp btn--block js-checkout">${icon("whatsapp", 20)} Hacer pedido por WhatsApp</button>
    <a class="btn btn--outline btn--block" href="shop.html">Seguir comprando</a>`;
  $(".js-checkout", foot).onclick = () => sendOrder(Cart.lines());
}

function updateCounts() {
  const c = Cart.count(), w = Wishlist.ids.filter(byId).length;
  $$(".js-cart-count").forEach((el) => { el.textContent = c; el.dataset.count = c; });
  $$(".js-wish-count").forEach((el) => { el.textContent = w; el.dataset.count = w; });
}

let toastTimer;
function toast(html) {
  const t = $(".js-toast");
  t.innerHTML = html;
  t.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), 2800);
}

// Delegated clicks for add-to-cart, favorites and quantity buttons.
function initDelegation() {
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      e.preventDefault();
      Cart.add(add.dataset.add, 1, add.dataset.color || null);
      toast(`Agregado al carrito · <a href="#" class="js-toast-cart">Ver carrito</a>`);
      return;
    }
    if (e.target.closest(".js-toast-cart")) { e.preventDefault(); openCart(); return; }
    // Color dot on a product card: swap photo, link and the color "Agregar" will use.
    const sw = e.target.closest(".card [data-swatch]");
    if (sw) {
      e.preventDefault();
      const card = sw.closest(".card"), p = byId(card.dataset.product), c = findColor(p, sw.dataset.swatch);
      $(".card__media img", card).src = src(c.image);
      $(".card__add", card).dataset.color = c.name;
      $(".card__link", card).href = `${productUrl(p)}&color=${encodeURIComponent(c.name)}`;
      $$("[data-swatch]", card).forEach((b) => { b.classList.toggle("is-active", b === sw); b.setAttribute("aria-pressed", b === sw); });
      return;
    }
    const wish = e.target.closest("[data-wish]");
    if (wish) {
      e.preventDefault();
      toast(Wishlist.toggle(wish.dataset.wish) ? "Agregado a favoritos 💗" : "Eliminado de favoritos");
      return;
    }
    const q = e.target.closest("[data-qty]");
    if (q) {
      const line = Cart.find(q.dataset.qty);
      if (line) Cart.setQty(q.dataset.qty, line.qty + Number(q.dataset.delta));
      return;
    }
    const rm = e.target.closest("[data-remove]");
    if (rm) Cart.setQty(rm.dataset.remove, 0);
  });
}

// Fade sections in as they scroll into view.
function initReveal(root = document) {
  const els = $$(".reveal:not(.is-in)", root);
  if (!("IntersectionObserver" in window)) return els.forEach((el) => el.classList.add("is-in"));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => io.observe(el));
}

// ---- Boot -------------------------------------------------------------------
const getJSON = (url) => fetch(url, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });

window.App = {
  ready: Promise.all([getJSON("data/products.json"), getJSON("data/site.json")])
    .then(([products, site]) => {
      window.CONFIG = site;
      window.PRODUCTS = products.filter((p) => !p.hidden);
      // Categories listed in site.json "categoryOrder" go first, in that order; the rest alphabetically.
      const order = site.categoryOrder || [];
      const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
      window.CATEGORIES = [...new Set(PRODUCTS.map((p) => p.category))]
        .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "es"));
      renderChrome();
      initAnnouncements();
      initPanels();
      initDelegation();
      renderCart();
      updateCounts();
    })
    .catch((err) => {
      console.error(err);
      document.body.insertAdjacentHTML("afterbegin", `<p style="padding:24px;text-align:center">No se pudo cargar la tienda. Intenta de nuevo en un momento.</p>`);
      throw err;
    }),
};
// Run reveal after the page script has rendered its sections.
App.ready.then(() => requestAnimationFrame(() => initReveal()));

// Keep tabs in sync if the cart changes in another tab.
addEventListener("storage", (e) => {
  if (!window.PRODUCTS) return;
  if (e.key === "sc-cart") { Cart.items = storage.get("sc-cart", []); renderCart(); updateCounts(); }
  if (e.key === "sc-wishlist") { Wishlist.ids = storage.get("sc-wishlist", []); updateCounts(); }
});
