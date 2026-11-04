// Formulaire unique de fiche (R14) : créer ou modifier une créature, un personnage, un lieu, un objet ou un compagnon.
// Chaque type d'élément se décrit ici par ses champs ; l'écran, l'enregistrement et la photo sont communs.
import { h, icon } from "./ui.js";
import { COLLECTIONS, toItem, loadCollection, parsePouvoirs } from "./collections.js";
import { readText, writeText, listDir } from "./graph.js";
import { parseDoc, serializeDoc, getSection, setSection, isTrue, intOf } from "./md.js";
import { photoControl } from "./photo.js";
import { heroName } from "./collections.js";

const TYPES_COMP = [["vole", "Qui vole"], ["nage", "Qui nage"], ["terre", "Sur terre"]];
const same = l => l.map(x => [x, x]);
const voit = () => ({ k: "apparence", l: `Ce que ${heroName()} voit : une phrase, sans spoiler`, t: "area" });

/** t : text · area · num · check · yesno · choice */
export const SCHEMAS = {
  creature: [
    { k: "nom", l: "Nom", t: "text", ph: "Nom de la créature" },
    { k: "coeurs", l: "Cœurs", t: "num", def: 1 },
    { k: "boss", l: "C'est un boss", t: "check", ic: "star" },
    { k: "carton", l: "Version carton fabriquée ?", t: "yesno" },
    { k: "rencontree", l: "Rencontrée (histoire, lieu)", t: "text" },
    voit
  ],
  personnage: [
    { k: "nom", l: "Nom", t: "text" },
    { k: "role", l: "Rôle", t: "text" },
    { k: "age", l: "Âge", t: "text" },
    { k: "statut", l: "Statut", t: "text" },
    { k: "rencontree", l: "Rencontré (histoire)", t: "text" },
    voit
  ],
  lieu: [
    { k: "nom", l: "Nom", t: "text" },
    { k: "ou", l: "Où", t: "text" },
    { k: "visite", l: "Visité (histoire)", t: "text" },
    { k: "carte", l: "Place sur la carte (deux nombres de 0 à 100, par exemple 50,50)", t: "text", ph: "50,50" },
    voit
  ],
  objet: [
    { k: "nom", l: "Nom", t: "text" },
    { k: "categorie", l: "Type", t: "choice", opts: same(["Arme", "Armure", "Soin", "Souvenir", "Autre"]) },
    { k: "etat", l: "État", t: "choice", opts: same(["En main", "Porté", "Souvenir", "Utilisé"]) },
    { k: "effet", l: "Effet", t: "area" },
    { k: "origine", l: "Origine", t: "area" },
    { k: "reparer", l: "À réparer", t: "check", ic: "tools" },
    voit
  ],
  compagnon: [
    { k: "animal", l: "Quel animal ? (comme dans le bestiaire)", t: "text", ph: "Loup, renard, chouette, requin…", suggest: "creature" },
    () => ({ k: "nom", l: `Son nom : celui que ${heroName()} lui donne`, t: "text", ph: "Le nom choisi (tu pourras le changer)" }),
    { k: "categorie", l: "Type", t: "choice", opts: TYPES_COMP },
    { k: "coeurs", l: "Cœurs", t: "num", def: 2 },
    { k: "pouvoirs", l: "Pouvoirs (capacités), un par ligne", t: "area", ph: "Se battre\nRenifler des traces\nHurler…" },
    () => ({ k: "apprivoise", l: `Comment ${heroName()} l'a apprivoisé`, t: "area" }),
    voit
  ]
};
const fieldsOf = colId => SCHEMAS[colId].map(f => typeof f === "function" ? f() : f);

const slug = s => String(s || "sans nom").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "sans_nom";
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Relit la fiche juste avant d'écrire, applique mutate(meta, body) et enregistre. Refuse d'écrire hors connexion. */
export async function updateItem(colId, file, mutate) {
  const col = COLLECTIONS[colId];
  const rel = `${col.folder}/${file}`;
  const fresh = await readText(rel);
  if (fresh.stale || fresh.text == null) throw new Error("Pas de réseau : rien n'a été enregistré.");
  const d = parseDoc(fresh.text);
  let meta = { ...d.meta };
  if (!d.structured && meta.type && meta.type !== colId) { meta.genre = meta.type; }   // ancien format : « Type : personnage récurrent »
  delete meta.type;
  meta = { type: colId, ...meta };
  const out = mutate(meta, d.body);
  await writeText(rel, serializeDoc(out.meta, out.body));
  return rel;
}

export async function formScreen(colId, file) {
  const col = COLLECTIONS[colId];
  if (!col || !SCHEMAS[colId]) throw new Error("Collection inconnue");
  const fields = fieldsOf(colId);
  let meta = {}, body = "", name = "";
  if (file) {
    const r = await readText(`${col.folder}/${file}`);
    if (r.text == null) throw new Error("Fiche introuvable : " + file);
    const it = toItem(col, file, r.text);
    meta = it.meta; body = it.body; name = it.name;
  }
  const vals = {};
  for (const f of fields) {
    const v = f.k === "nom" ? (name || meta.nom || "") : meta[f.k];
    if (f.t === "check" || f.t === "yesno") vals[f.k] = isTrue(v);
    else if (f.t === "num") vals[f.k] = intOf(v) ?? f.def ?? 0;
    else if (f.k === "pouvoirs") vals[f.k] = parsePouvoirs(v != null ? v : meta.pouvoir).join("\n");
    else vals[f.k] = v == null ? "" : String(v);
  }
  let suggestions = [];
  if (colId === "compagnon") { try { suggestions = (await loadCollection(COLLECTIONS.creature)).items.map(i => i.name); } catch { /* hors connexion : pas de suggestions */ } }
  if (colId === "compagnon" && !vals.categorie) vals.categorie = "terre";
  let photo = typeof meta.photo === "string" ? meta.photo : "";
  let note = getSection(body, "Note rapide");
  const msg = h("div", { class: "muted center" });

  const lab = t => h("label", { class: "kicker", style: "text-transform:none;letter-spacing:0;font-size:15px" }, t);
  const wrap = (f, el) => h("div", { class: "list", style: "gap:6px" }, f.l ? lab(f.l) : null, el);
  const build = f => {
    if (f.t === "text") {
      const el = h("input", { class: "field", placeholder: f.ph || "" }); el.value = vals[f.k]; el.addEventListener("input", () => vals[f.k] = el.value);
      if (f.suggest && suggestions.length) { el.setAttribute("list", "dl-" + f.k); return wrap(f, h("div", null, el, h("datalist", { id: "dl-" + f.k }, suggestions.map(n => h("option", { value: n }))))); }
      return wrap(f, el);
    }
    if (f.t === "area") { const el = h("textarea", { class: "field", style: "min-height:96px", placeholder: f.ph || "À écrire ou dicter (le micro du clavier marche partout)" }); el.value = vals[f.k]; el.addEventListener("input", () => vals[f.k] = el.value); return wrap(f, el); }
    if (f.t === "num") {
      const val = h("div", { style: "font:600 26px Fredoka;min-width:2.5em;text-align:center" }, String(vals[f.k]));
      const set = n => { vals[f.k] = Math.max(0, Math.min(30, n)); val.textContent = String(vals[f.k]); };
      return wrap(f, h("div", { class: "row card", style: "padding:8px 12px;justify-content:space-between" },
        h("button", { type: "button", class: "iconbtn", "aria-label": "Moins", onclick: () => set(vals[f.k] - 1) }, icon("minus", 24)), val,
        h("button", { type: "button", class: "iconbtn", "aria-label": "Plus", onclick: () => set(vals[f.k] + 1) }, icon("plus", 24))));
    }
    if (f.t === "check") {
      const box = h("button", { type: "button", class: "checkrow", "aria-pressed": String(vals[f.k]) }, h("span", { class: "cbox" }, icon("check", 22, "#fff", 3)), f.ic ? icon(f.ic, 22, "var(--yellow)", 2) : null, h("span", null, f.l));
      box.addEventListener("click", () => { vals[f.k] = !vals[f.k]; box.setAttribute("aria-pressed", String(vals[f.k])); });
      return box;
    }
    const opts = f.t === "yesno" ? [[false, "Non"], [true, "Oui"]] : f.opts;
    const row = h("div", { class: "row", style: "gap:8px;flex-wrap:wrap" });
    const draw = () => row.replaceChildren(...opts.map(([v, l]) => h("button", { type: "button", class: "tab" + (vals[f.k] === v || (f.t === "choice" && String(vals[f.k]).toLowerCase() === String(v).toLowerCase()) ? " on" : ""), style: "flex:0 1 auto;padding:8px 16px", onclick: () => { vals[f.k] = v; draw(); } }, l)));
    draw();
    return wrap(f, row);
  };

  const saveBtn = h("button", { class: "btn primary grow", style: "font-size:20px;padding:14px" }, "Enregistrer");
  const patch = () => {
    const p = {};
    for (const f of fields) {
      const v = vals[f.k];
      p[f.k] = f.k === "pouvoirs" ? parsePouvoirs(v).join(" ; ") : typeof v === "string" ? v.trim() : v;
    }
    p.photo = photo;
    return p;
  };
  saveBtn.addEventListener("click", async () => {
    if (!String(vals.nom || "").trim()) { msg.className = "ko center"; msg.textContent = "Il faut au moins un nom."; return; }
    saveBtn.disabled = true; msg.className = "muted center"; msg.textContent = "Enregistrement…";
    try {
      let target = file;
      const p = patch();
      if (file) {
        await updateItem(colId, file, (m, b) => { const nm = { ...m, ...p }; if (colId === "compagnon") delete nm.pouvoir; return { meta: nm, body: setSection(b, "Note rapide", note) }; });
      } else {
        const ls = await listDir(col.folder);
        if (ls.stale) throw new Error("Pas de réseau : rien n'a été enregistré.");
        const taken = new Set(ls.data.map(x => x.name.toLowerCase()));
        let base = cap(slug(p.nom)), n = 1;
        while (taken.has((n === 1 ? base : `${base}_${n}`).toLowerCase() + ".md")) n++;
        target = (n === 1 ? base : `${base}_${n}`) + ".md";
        const text = serializeDoc({ type: colId, ...p }, `# ${p.nom}\n${note.trim() ? `\n## Note rapide\n${note.trim()}\n` : ""}`);
        await writeText(`${col.folder}/${target}`, text);
      }
      location.hash = `#/mj/c/${colId}/${encodeURIComponent(target)}`;
    } catch (e) { msg.className = "ko center"; msg.textContent = e.status ? "Échec de l'enregistrement (" + e.message + ")." : (e.message || "Échec de l'enregistrement."); saveBtn.disabled = false; }
  });
  const noteEl = h("textarea", { class: "field", style: "min-height:96px", placeholder: "Quelques lignes (le micro du clavier marche partout)" });
  noteEl.value = note; noteEl.addEventListener("input", () => note = noteEl.value);

  const back = file ? `/mj/c/${colId}/${encodeURIComponent(file)}` : listRoute(colId);
  return {
    title: file ? `Modifier : ${name}` : `Nouveau ${col.singular || col.label.toLowerCase()}`, back, nav: colId === "histoire" ? "histoires" : "monde",
    node: h("div", { class: "page with-nav" },
      photoControl(photo, col.icon, n => photo = n),
      fields.map(build),
      wrap({ l: "Note rapide" }, noteEl),
      msg,
      h("div", { class: "row", style: "gap:10px" }, h("a", { class: "btn", href: "#" + back, style: "text-decoration:none;color:var(--ink)" }, "Annuler"), saveBtn))
  };
}

/** Page de liste d'une collection (côté MJ). */
export const listRoute = colId => colId === "lieu" ? "/mj/lieux" : colId === "objet" ? "/mj/objets" : `/mj/c/${colId}`;
