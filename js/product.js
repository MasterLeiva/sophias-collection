/* Product detail page.  URL: product.html?id=<product id> */

App.ready.then(() => {
  const params = new URLSearchParams(location.search);
  const p = byId(params.get("id"));
  const pdp = $(".js-pdp");

  if (!p) {
    pdp.innerHTML = `<div class="grid-empty" style="padding:80px 0"><h1 class="section-title">Producto no encontrado</h1><a class="btn" href="shop.html">Ir a la tienda</a></div>`;
    $(".js-related").closest("section").remove();
    return;
  }

  let qty = 1;
  let color = findColor(p, params.get("color"))?.name || null;
  document.title = `${p.name} — ${CONFIG.storeName}`;
  const wish = () => Wishlist.has(p.id);
  const badge = onSale(p) ? `<span class="card__badge card__badge--sale">-${discount(p)}%</span>`
    : p.isNew ? `<span class="card__badge">Nuevo</span>` : "";

  pdp.innerHTML = `
    <nav class="breadcrumbs" aria-label="Ruta">
      <a href="index.html">Inicio</a> / <a href="${categoryUrl(p.category)}">${esc(p.category)}</a> / <span>${esc(p.name)}</span>
    </nav>
    <div class="pdp">
      <div class="pdp__media">
        ${badge}
        <img class="js-main-img" src="${src(imageFor(p, color))}" alt="${esc(p.name)}${color ? ` — ${esc(color)}` : ""}">
      </div>
      <div class="pdp__info">
        <span class="eyebrow">${esc(p.category)}</span>
        <h1 class="pdp__title">${esc(p.name)}</h1>
        <div class="pdp__price">${priceHtml(p)}</div>
        ${color ? `
        <div class="pdp__colors">
          <p class="pdp__color-label">Color: <strong class="js-color-name">${esc(color)}</strong></p>
          ${colorsOf(p).length > 1 ? swatches(p, color, { max: 20, size: "swatches--lg" }) : ""}
        </div>` : ""}
        ${p.description ? `<p class="pdp__desc">${esc(p.description)}</p>` : ""}
        <div class="pdp__row">
          <div class="qty qty--lg" style="margin:0">
            <button class="js-minus" aria-label="Quitar uno">−</button>
            <span class="js-qty">1</span>
            <button class="js-plus" aria-label="Agregar uno">+</button>
          </div>
          <button class="pdp__wish ${wish() ? "is-on" : ""}" data-wish="${esc(p.id)}" aria-pressed="${wish()}" aria-label="Agregar a favoritos">${ICONS.heart}</button>
        </div>
        <button class="btn btn--dark btn--block js-add">Agregar al carrito</button>
        <button class="btn btn--whatsapp btn--block js-buy">${icon("whatsapp", 20)} Pedir por WhatsApp</button>
        <div class="pdp__accordion">
          <details open><summary>Cómo comprar</summary><p>Agrega tus productos al carrito y toca “Hacer pedido por WhatsApp”. Se abre nuestro chat con tu pedido ya escrito: solo envíalo y te confirmamos disponibilidad, forma de pago y envío.</p></details>
          <details><summary>Envíos</summary><p>Realizamos envíos a toda Honduras. El costo y tiempo de entrega se coordinan al confirmar tu pedido.</p></details>
        </div>
      </div>
    </div>`;

  $(".js-minus").onclick = () => { qty = Math.max(1, qty - 1); $(".js-qty").textContent = qty; };
  $(".js-plus").onclick = () => { qty += 1; $(".js-qty").textContent = qty; };
  $(".js-add").onclick = () => { Cart.add(p.id, qty, color); openCart(); };
  $(".js-buy").onclick = () => sendOrder([{ product: p, qty, color }]);

  // Tapping a color swaps the photo and remembers it in the URL (for sharing).
  pdp.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-swatch]");
    if (!sw) return;
    color = sw.dataset.swatch;
    const img = $(".js-main-img");
    img.src = src(imageFor(p, color));
    img.alt = `${p.name} — ${color}`;
    $(".js-color-name").textContent = color;
    $$("[data-swatch]", pdp).forEach((b) => { b.classList.toggle("is-active", b === sw); b.setAttribute("aria-pressed", b === sw); });
    history.replaceState(null, "", `${productUrl(p)}&color=${encodeURIComponent(color)}`);
  });

  const related = PRODUCTS.filter((x) => x.category === p.category && x.id !== p.id);
  const more = PRODUCTS.filter((x) => x.category !== p.category && x.bestseller);
  $(".js-related").innerHTML = [...related, ...more].slice(0, 8).map(productCard).join("");
});
