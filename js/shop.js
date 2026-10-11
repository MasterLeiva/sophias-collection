/* Shop page.  URLs: shop.html, shop.html?cat=Bolsos, shop.html?view=ofertas, shop.html?view=favoritos */

App.ready.then(() => {
  const params = new URLSearchParams(location.search);
  const VIEWS = {
    favoritos: { title: "Favoritos", eyebrow: "Tu lista", desc: "Los productos que guardaste con 💗", filter: (p) => Wishlist.has(p.id),
      empty: "Aún no tienes favoritos. Toca el corazón en cualquier producto para guardarlo." },
    ofertas: { title: "Ofertas", eyebrow: "Tienda", desc: "Precios especiales por tiempo limitado", filter: onSale,
      empty: "No hay ofertas en este momento. ¡Síguenos en Instagram para enterarte de las próximas!" },
  };
  const state = {
    view: VIEWS[params.get("view")] ? params.get("view") : null,
    cat: CATEGORIES.includes(params.get("cat")) ? params.get("cat") : null,
    sort: "featured",
  };
  const hasSales = PRODUCTS.some(onSale);

  function sync() {
    const q = new URLSearchParams();
    if (state.view) q.set("view", state.view);
    else if (state.cat) q.set("cat", state.cat);
    history.replaceState(null, "", `shop.html${q.toString() ? "?" + q : ""}`);
  }

  function renderShop() {
    const view = VIEWS[state.view];
    let items = view ? PRODUCTS.filter(view.filter) : PRODUCTS.filter((p) => !state.cat || inCategory(p, state.cat));

    const sorters = {
      featured: (a, b) => (b.bestseller - a.bestseller) || (onSale(b) - onSale(a)) || (b.isNew - a.isNew),
      "price-asc": (a, b) => priceOf(a) - priceOf(b),
      "price-desc": (a, b) => priceOf(b) - priceOf(a),
      name: (a, b) => a.name.localeCompare(b.name, "es"),
    };
    items = [...items].sort(sorters[state.sort]);

    const title = view ? view.title : state.cat || "Ver todo";
    $(".js-shop-title").textContent = title;
    $(".js-shop-eyebrow").textContent = view ? view.eyebrow : "Tienda";
    $(".js-shop-desc").textContent = view ? view.desc : "Pedidos por WhatsApp · Envíos a toda Honduras";
    document.title = `${title} — ${CONFIG.storeName}`;

    const chip = (label, attrs, on) => `<button class="chip ${on ? "is-active" : ""}" ${attrs}>${label}</button>`;
    $(".js-chips").innerHTML =
      chip("Ver todo", 'data-cat=""', !state.cat && !state.view) +
      (hasSales ? chip("🏷️ Ofertas", 'data-view="ofertas"', state.view === "ofertas") : "") +
      CATEGORIES.map((c) => chip(esc(c), `data-cat="${esc(c)}"`, state.cat === c && !state.view)).join("") +
      chip("💗 Favoritos", 'data-view="favoritos"', state.view === "favoritos");

    $(".js-count").textContent = `${items.length} producto${items.length === 1 ? "" : "s"}`;
    $(".js-grid").innerHTML = items.length
      ? items.map(productCard).join("")
      : `<div class="grid-empty"><p>${view ? view.empty : "No hay productos en esta categoría todavía."}</p><a class="btn" href="shop.html">Ver todo</a></div>`;
  }

  $(".js-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.view = chip.dataset.view || null;
    state.cat = state.view ? null : chip.dataset.cat || null;
    sync();
    renderShop();
    $(`.chip.is-active`).scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
  $(".js-sort").addEventListener("change", (e) => { state.sort = e.target.value; renderShop(); });
  // Removing a favorite while viewing favorites should drop it from the grid.
  document.addEventListener("wishlist:change", () => state.view === "favoritos" && renderShop());

  renderShop();
});
