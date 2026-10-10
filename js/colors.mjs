// Color names (Spanish) → swatch color. Shared by the server (photo import) and the admin panel.
// Add more here if you use other color names in your photo file names.
export const COLOR_NAMES = {
  negro: "#1c1c1c",
  blanco: "#ffffff",
  cafe: "#6f4e37",
  marron: "#6f4e37",
  chocolate: "#4e342e",
  camel: "#c19a6b",
  beige: "#dcc7a6",
  crema: "#f3e9d2",
  nude: "#e3bc9a",
  rosada: "#f2b8c6",
  rosado: "#f2b8c6",
  rosa: "#f2b8c6",
  fucsia: "#d63384",
  rojo: "#c62828",
  vino: "#6d1a2a",
  azul: "#2b4c9b",
  celeste: "#8ec5e8",
  verde: "#2e7d4f",
  menta: "#a8dcc4",
  gris: "#9e9e9e",
  dorado: "#c9a24a",
  plateado: "#c0c0c0",
  morado: "#6a3d9a",
  lila: "#c8a2c8",
  amarillo: "#f2c94c",
  naranja: "#ef8a3c",
};

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// "Café claro" → "#6f4e37" (matches on the first word), or null if unknown.
export function colorHex(name) {
  const n = norm(name);
  return COLOR_NAMES[n] || COLOR_NAMES[n.split(/\s+/)[0]] || null;
}

// "Tote Bag Gucci (Negro)" → { base: "Tote Bag Gucci", color: "Negro" }.
// Returns null when the text in parentheses isn't a known color (e.g. "(Tamaño M)").
export function splitColor(name) {
  const m = String(name).match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m || !colorHex(m[2])) return null;
  const color = m[2].trim();
  return { base: m[1].trim(), color: color.charAt(0).toUpperCase() + color.slice(1) };
}

export const sameName = (a, b) => norm(a) === norm(b);
