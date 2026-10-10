// Catalog rules shared by the local server (server.mjs) and the admin panel when it
// saves straight to GitHub (js/admin.js). Plain functions, no file or network access.
import { colorHex, splitColor, sameName } from "./colors.mjs";

export const TRASH = "_papelera";
export const SKIP_DIRS = new Set(["Icons", "Thumbnails", TRASH]);
export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

export const slugify = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producto";

export function uniqueId(base, list) {
  let id = base, n = 2;
  while (list.some((p) => p.id === id)) id = `${base}-${n++}`;
  return id;
}

// Every photo a product uses: the main one plus one per color.
export const imagesOf = (p) => [p.image, ...(p.colors || []).map((c) => c.image)];

// Accepts only known fields, with sane types. `imageExists(path)` says whether a photo path is real.
export function cleanProduct(input, existing, imageExists) {
  const out = { ...existing };
  const str = (v, max) => String(v ?? "").trim().slice(0, max);
  const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
  const validImage = (v) => { const img = str(v, 300); return img.startsWith("img/") && !img.includes("..") && imageExists(img) ? img : null; };
  if ("name" in input) out.name = str(input.name, 120);
  if ("category" in input) out.category = str(input.category, 60);
  if ("description" in input) out.description = str(input.description, 2000);
  if ("price" in input) out.price = num(input.price) ?? 0;
  if ("salePrice" in input) {
    const s = input.salePrice === "" || input.salePrice === null ? null : num(input.salePrice);
    out.salePrice = s && s > 0 ? s : null;
  }
  for (const k of ["bestseller", "isNew", "hidden"]) if (k in input) out[k] = Boolean(input[k]);
  if ("image" in input) out.image = validImage(input.image) || out.image;
  if ("colors" in input) {
    out.colors = (Array.isArray(input.colors) ? input.colors : []).slice(0, 20).map((c) => ({
      name: str(c?.name, 40),
      hex: /^#[0-9a-f]{6}$/i.test(c?.hex) ? c.hex.toLowerCase() : "#cccccc",
      image: validImage(c?.image),
    })).filter((c) => c.name && c.image);
  }
  // With colors, the first color's photo is the main photo.
  if (out.colors?.length) out.image = out.colors[0].image;
  else delete out.colors;
  return out;
}

export function newProduct(input, list, imageExists) {
  const p = cleanProduct(input, { salePrice: null, description: "", bestseller: false, isNew: true, hidden: false }, imageExists);
  if (!p.name || !p.category || !p.image) throw new Error("Faltan nombre, categoría o foto");
  p.id = uniqueId(slugify(`${p.category}-${p.name}`), list);
  p.createdAt = new Date().toISOString();
  return p;
}

// Adds photos in img/<Categoría>/ that no product uses yet. `paths` are like "img/Bolsos/x.jpeg".
// "Nombre L1,234.jpeg" → new product. "Nombre (Color) L1,234.jpeg" → a color of the product
// "Nombre" when it already exists in that category. Mutates `list`; returns the touched products.
export function importImages(list, paths) {
  const known = new Set(list.flatMap(imagesOf));
  const added = [];
  const files = paths
    .map((image) => image.split("/"))
    .filter((parts) => parts.length === 3 && parts[0] === "img" && !SKIP_DIRS.has(parts[1]) && !parts[1].startsWith(".") && !parts[2].startsWith("."))
    .sort((a, b) => a.join("/").localeCompare(b.join("/"), "es"));
  for (const [, category, file] of files) {
    const dot = file.lastIndexOf(".");
    const image = `img/${category}/${file}`;
    if (dot < 0 || !IMAGE_EXT.has(file.slice(dot).toLowerCase()) || known.has(image)) continue;
    const m = file.slice(0, dot).match(/^(.*?)\s+L\s?([\d,.]+)$/);
    const name = (m ? m[1] : file.slice(0, dot)).replace(/\s+/g, " ").trim();
    const split = splitColor(name);
    const color = split && { name: split.color, hex: colorHex(split.color), image };
    if (split) {
      const existing = list.find((p) => p.category === category && sameName(p.name, split.base));
      if (existing) {
        existing.colors = existing.colors?.length ? existing.colors : [{ name: "Color 1", hex: "#cccccc", image: existing.image }];
        existing.colors.push(color);
        known.add(image);
        added.push(existing);
        continue;
      }
    }
    const product = {
      id: uniqueId(slugify(`${category}-${split ? split.base : name}`), list),
      name: split ? split.base : name,
      category,
      price: m ? Number(m[2].replace(/,/g, "")) : 0,
      salePrice: null,
      description: "",
      bestseller: false,
      isNew: true,
      hidden: !m, // without a price in the name, keep it hidden until edited
      image,
      ...(color && { colors: [color] }),
      createdAt: new Date().toISOString(),
    };
    list.push(product);
    known.add(image);
    added.push(product);
  }
  return added;
}
