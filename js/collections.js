// Les collections de l'application (R14) : ajouter un type d'élément = ajouter UNE entrée ici.
import { listDir, readText, pool } from "./graph.js";
import { parseDoc, intOf, isTrue, humanize, sections } from "./md.js";
import { findObjet } from "./colors.js";

export const COLLECTIONS = {
  creature: {
    id: "creature", label: "Bestiaire", singular: "créature", icon: "monster",
    folder: "04_Bestiaire", exclude: /^(00_|LISEZMOI)/i,
    child: { label: "Mes monstres", color: "var(--purple)", route: "monstres" },
    empty: "Aucune créature pour l'instant."
  },
  personnage: {
    id: "personnage", label: "Personnages", icon: "friends",
    folder: "03_Personnages", exclude: /^(.*Fiche_Heroine|PNJ_Recurrents|00_|LISEZMOI)/i,
    child: { label: "Mes amis", color: "var(--yellow)", route: "amis" },
    empty: "Aucun personnage pour l'instant."
  },
  objet: {
    id: "objet", label: "Objets", singular: "objet", icon: "sword",
    folder: "05_Journal/Objets", exclude: /^(00_|LISEZMOI)/i,
    child: { label: "Mes objets", color: "var(--teal)", route: "objets" },
    empty: "Aucun objet pour l'instant."
  },
  lieu: {
    id: "lieu", label: "Lieux", singular: "lieu", icon: "pin",
    folder: "05_Journal/Lieux", exclude: /^(00_|LISEZMOI)/i,
    child: { label: "Mes lieux", color: "var(--blue)", route: "lieux" },
    empty: "Aucun lieu pour l'instant."
  },
  compagnon: {
    id: "compagnon", label: "Compagnons", singular: "compagnon", icon: "paw",
    folder: "03_Personnages/Compagnons", exclude: /^(00_|LISEZMOI)/i,
    child: { label: "Mes compagnons", color: "var(--red)", route: "compagnons" },
    empty: "Aucun compagnon pour l'instant."
  },
  prochaine: {
    id: "prochaine", label: "Histoires en attente", icon: "book",
    folder: "02_Campagne/Prochaines", exclude: /^(00_|LISEZMOI)/i,
    empty: "Aucune histoire n'est encore préparée."
  },
  histoire: {
    id: "histoire", label: "Histoires jouées", icon: "book",
    folder: "01_Histoires_Jouees", exclude: /^(00_|LISEZMOI|Recap_)/i,
    empty: "Aucune histoire jouée pour l'instant."
  }
};

/** « 50,50 » → { x, y } (0 à 100), sinon null. */
export function parseCarte(v) {
  const m = String(v ?? "").match(/(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/);
  return m ? { x: Math.max(0, Math.min(100, Number(m[1]))), y: Math.max(0, Math.min(100, Number(m[2]))) } : null;
}
/** Type d'un compagnon : "vole", "nage" ou "terre". */
export function typeCompagnon(meta) {
  const t = String(meta.categorie || meta.type_compagnon || "").toLowerCase();
  if (/vol|oiseau|air/.test(t)) return "vole";
  if (/nag|aqua|eau|plong/.test(t)) return "nage";
  return "terre";
}

/** Un élément de collection, prêt à afficher. */
export function toItem(col, file, text) {
  const d = parseDoc(text);
  const photo = typeof d.meta.photo === "string" && /\.(jpe?g|png|webp|heic)$/i.test(d.meta.photo) ? d.meta.photo : null;
  return {
    col: col.id, file, rel: `${col.folder}/${file}`,
    name: String(d.meta.nom || d.meta.titre || d.title || humanize(file)),
    meta: d.meta, body: d.body,
    coeurs: intOf(d.meta.coeurs), boss: isTrue(d.meta.boss), photo,
    apparence: String(d.meta.apparence || "").trim(),
    etat: String(d.meta.etat || "").trim(),
    carte: parseCarte(d.meta.carte),
    type: typeCompagnon(d.meta)
  };
}

/** Charge tous les éléments d'une collection. → { items, stale } */
export async function loadCollection(col) {
  const ls = await listDir(col.folder);
  const files = ls.data.filter(f => !f.dir && /\.md$/i.test(f.name) && !(col.exclude && col.exclude.test(f.name)))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  let stale = ls.stale;
  const items = (await pool(files, async f => {
    const r = await readText(`${col.folder}/${f.name}`);
    if (r.stale) stale = true;
    return r.text == null ? null : toItem(col, f.name, r.text);
  })).filter(Boolean);
  return { items, stale };
}

export async function loadItem(col, file) {
  const r = await readText(`${col.folder}/${file}`);
  if (r.text == null) throw new Error("Fiche introuvable : " + file);
  return { item: toItem(col, file, r.text), stale: r.stale };
}

/** Ce que l'enfant a le droit de voir d'une fiche (pas de spoiler : aucune idée, aucune proposition, aucune note de MJ). */
export function childView(item) {
  const raw = String(item.meta.apparence || "").trim();
  const intro = raw.charAt(0).toUpperCase() + raw.slice(1);
  const secs = sections(item.body).filter(s => /^(ce que \S+ a fait|ce que j.ai fait)/i.test(s.title));
  return { description: intro, faits: secs.map(s => s.text.trim()).filter(Boolean).join("\n") };
}

/** Prénom de l'héroïne, lu dans sa fiche puis gardé sur le téléphone (jamais écrit dans le code public). */
export const heroName = () => { try { return localStorage.getItem("pf:prenom") || "l'aventurière"; } catch { return "l'aventurière"; } };

/** Fiche de l'héroïne : trouvée dans 03_Personnages (fichier « …Fiche_Heroine.md »), sans nom écrit dans le code. */
export async function findHeroFile() {
  const ls = await listDir("03_Personnages");
  const f = ls.data.find(x => !x.dir && /Fiche_Heroine\.md$/i.test(x.name));
  return f ? "03_Personnages/" + f.name : null;
}

/** État de l'héroïne (prénom, cœurs, armure, équipement) lu dans sa fiche. */
export async function loadHeroState() {
  const empty = { prenom: "", coeurs: 3, armure: 1, equip: [], compagnons: [], stale: false, found: false, file: null };
  const file = await findHeroFile();
  if (!file) return empty;
  const r = await readText(file);
  if (r.text == null) return empty;
  const d = parseDoc(r.text);
  let coeurs = intOf(d.meta.coeurs), armure = intOf(d.meta.armure);
  if (coeurs == null) { const m = r.text.match(/Cœurs\*\*\s*\|[^\n]*?\((\d+)\)/); coeurs = m ? Number(m[1]) : 3; }
  if (armure == null) { const m = r.text.match(/Armure\*\*\s*\|[^\n]*?(\d+)/); armure = m ? Number(m[1]) : 1; }
  const nom = String(d.meta.nom || (r.text.match(/\*\*Nom\s*:?\s*\*\*\s*:?\s*([^\n|]+)/) || r.text.match(/\*\*Nom\*\*\s*\|\s*([^|\n]+)/) || [, ""])[1] || "").trim();
  const prenom = nom.split(/[,\s—–-]/)[0] || "";
  try { if (prenom) localStorage.setItem("pf:prenom", prenom); } catch { /* ok */ }
  // équipement : lignes de la section « Inventaire » reconnues dans le registre des objets (et marquées « porté »)
  const inv = (r.text.match(/^## Inventaire\s*\n([\s\S]*?)(?=\n## |(?![\s\S]))/m) || [, ""])[1];
  const equip = [];
  for (const line of inv.split("\n")) {
    if (!/^\s*[-*]\s/.test(line) || /aucun/i.test(line)) continue;
    const o = findObjet(line);
    if (o && o.equip && !equip.some(e => e.id === o.id)) equip.push(o);
  }
  let compagnons = [];
  try { const ls = await listDir("03_Personnages/Compagnons"); compagnons = ls.data.filter(f => !f.dir && /\.md$/i.test(f.name) && !/^(00_|LISEZMOI)/i.test(f.name)).map(f => humanize(f.name)); } catch { /* pas de dossier : aucun compagnon */ }
  return { prenom, coeurs, armure, equip, compagnons, stale: r.stale, found: true, file };
}
