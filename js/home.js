/* Homepage sections. Hero videos and category covers are set in data/site.json. */

const FALLBACK_SLIDE_MS = 8000; // used if a video can't autoplay (e.g. iPhone low-power mode)

function initHero() {
  const hero = $(".js-hero");
  const slidesData = CONFIG.heroSlides || [];
  if (!slidesData.length) return hero.remove();
  const desktop = matchMedia("(min-width: 1000px)").matches;

  hero.innerHTML = slidesData.map((s, i) => {
    const p = byId(s.product);
    const href = p ? productUrl(p) : "shop.html";
    return `
      <div class="hero__slide ${i === 0 ? "is-active" : ""}" aria-hidden="${i !== 0}">
        ${desktop ? `<video class="hero__bg" src="${src(s.video)}" muted playsinline loop preload="${i === 0 ? "auto" : "none"}" aria-hidden="true"></video>` : ""}
        <div class="hero__media">
          <video src="${src(s.video)}" muted playsinline preload="${i === 0 ? "auto" : "metadata"}" ${i === 0 ? "autoplay" : ""}></video>
        </div>
        <div class="hero__content">
          ${s.kicker ? `<span class="hero__kicker">${esc(s.kicker)}</span>` : ""}
          <h2 class="hero__title">${esc(s.title)}</h2>
          <a class="btn" href="${href}" tabindex="${i === 0 ? 0 : -1}">Comprar ahora</a>
        </div>
      </div>`;
  }).join("") + `
    <div class="hero__dots">
      ${slidesData.map((s) => `<button class="hero__dot" aria-label="Ver ${esc(s.title)}"><span></span></button>`).join("")}
    </div>`;

  const slides = $$(".hero__slide", hero);
  const dots = $$(".hero__dot", hero);
  const mainVideo = (i) => $(".hero__media video", slides[i]);
  const bgVideo = (i) => $(".hero__bg", slides[i]);
  let current = 0, fallbackTimer, fallbackStart, visible = true;

  function go(n) {
    const prev = current;
    current = (n + slides.length) % slides.length;
    slides.forEach((s, i) => {
      const on = i === current;
      s.classList.toggle("is-active", on);
      s.setAttribute("aria-hidden", !on);
      $(".btn", s).tabIndex = on ? 0 : -1;
    });
    [mainVideo(prev), bgVideo(prev)].forEach((v) => v && v.pause());
    play();
  }

  function play() {
    clearTimeout(fallbackTimer);
    fallbackStart = null;
    const v = mainVideo(current), bg = bgVideo(current);
    v.currentTime = 0;
    if (bg) { bg.preload = "auto"; bg.currentTime = 0; bg.play().catch(() => {}); }
    if (!visible) return;
    v.play().catch(() => {
      // Autoplay blocked: advance on a timer instead.
      fallbackStart = performance.now();
      fallbackTimer = setTimeout(() => go(current + 1), FALLBACK_SLIDE_MS);
    });
  }

  slides.forEach((s, i) => mainVideo(i).addEventListener("ended", () => i === current && go(current + 1)));
  dots.forEach((d, i) => (d.onclick = () => go(i)));

  // Progress bar on the active dot.
  (function tick() {
    const v = mainVideo(current);
    let pct = 0;
    if (fallbackStart) pct = (performance.now() - fallbackStart) / FALLBACK_SLIDE_MS;
    else if (v.duration) pct = v.currentTime / v.duration;
    dots.forEach((d, i) => {
      $("span", d).style.transform = `scaleX(${i < current ? 1 : i === current ? Math.min(pct, 1) : 0})`;
    });
    requestAnimationFrame(tick);
  })();

  // Swipe between slides on touch screens.
  let x0 = null;
  hero.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  hero.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) go(current + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  // Pause videos while the hero is scrolled out of view.
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    const v = mainVideo(current), bg = bgVideo(current);
    if (visible) { v.play().catch(() => {}); bg && bg.play().catch(() => {}); }
    else { v.pause(); bg && bg.pause(); }
  }, { threshold: 0.15 }).observe(hero);

  play();
}

// ---- Novedades / Más vendidos / Ofertas tabs ----------------------------------
function initProductTabs() {
  const rail = $(".js-product-rail");
  const subtitle = $(".js-tab-subtitle");
  const newest = [...PRODUCTS].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const sets = {
    new: { title: "Lo último en llegar", items: newest.filter((p) => p.isNew), link: "shop.html" },
    best: { title: "Los favoritos de nuestras clientas", items: PRODUCTS.filter((p) => p.bestseller), link: "shop.html" },
    sale: { title: "Precios especiales por tiempo limitado", items: PRODUCTS.filter(onSale), link: "shop.html?view=ofertas" },
  };
  // Hide tabs with nothing in them.
  $$(".tab").forEach((t) => (t.hidden = !sets[t.dataset.tab].items.length));
  const show = (key) => {
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === key;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    subtitle.textContent = sets[key].title;
    $(".rail-head .link-arrow").href = sets[key].link;
    rail.innerHTML = sets[key].items.map(productCard).join("");
    rail.scrollLeft = 0;
  };
  $$(".tab").forEach((t) => (t.onclick = () => show(t.dataset.tab)));
  const first = $$(".tab").find((t) => !t.hidden);
  if (first) show(first.dataset.tab); else rail.closest("section").remove();
}

// ---- Category covers ---------------------------------------------------------
// Cover photo of a category: the product marked "Portada" in the admin, else its first product.
const coverFor = (cat) => PRODUCTS.find((x) => x.category === cat && x.isCover) || PRODUCTS.find((x) => x.category === cat);

function initCollections() {
  $(".js-collections").innerHTML = CATEGORIES.map((c) => `
    <a class="collection-card" href="${categoryUrl(c)}">
      <img src="${src(coverFor(c).image)}" alt="${esc(c)}" loading="lazy">
      <span class="collection-card__label">${esc(c)} ${ICONS.arrow}</span>
    </a>`).join("");
}

// Banners skip themselves if their product or category no longer exists.
// Big home photo of a category: the product marked "Foto grande del inicio" in the admin,
// else its cover, else its first product.
const bannerFor = (cat) =>
  PRODUCTS.find((x) => x.category === cat && x.isBanner) || PRODUCTS.find((x) => x.category === cat && x.isCover) || PRODUCTS.find((x) => x.category === cat);

const BANNER_TEXT = {
  "Lentes": "El accesorio perfecto para cada look.",
  "Makeup": "Paletas, blush y sets para brillar.",
};

function banner(cat) {
  const p = bannerFor(cat);
  if (!p) return "";
  const text = BANNER_TEXT[cat];
  return `
    <a class="banner" href="${categoryUrl(cat)}">
      <img src="${src(p.image)}" alt="" loading="lazy">
      <div class="banner__content reveal">
        <h2 class="banner__title">${esc(cat)}</h2>
        ${text ? `<p class="banner__text">${esc(text)}</p>` : ""}
        <span class="btn">Comprar ahora</span>
      </div>
    </a>`;
}

function initBanners() {
  const slots = CONFIG.homeBanners || {};
  $(".js-split").innerHTML = (slots.split || []).map(banner).join("");
  $(".js-grid").innerHTML = (slots.grid || []).map(banner).join("");

  const f = slots.feature && bannerFor(slots.feature);
  $(".js-feature").innerHTML = f ? `
    <div class="feature__media"><img src="${src(f.image)}" alt="${esc(f.name)}" loading="lazy"></div>
    <div class="feature__text reveal">
      <span class="eyebrow">Sets de perfumes</span>
      <h2>Regalos que enamoran</h2>
      <p>Minis y sets de tus fragancias favoritas — ideales para regalar o para llevar contigo a todas partes.</p>
      <a class="btn btn--dark" href="${categoryUrl(slots.feature)}">Ver sets de perfumes</a>
    </div>` : "";
}

App.ready.then(() => {
  initHero();
  initProductTabs();
  initCollections();
  initBanners();
});
