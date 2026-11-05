// Pages des collections et du monde : journal, objets, lieux, carte, compagnons (mode enfant) ; lieux et objets, compagnons,
// photos à classer, idée du soir, onglet secondaire des fiches (mode MJ).
import { h, icon, hearts, disc, speak } from "./ui.js";
import { COLLECTIONS, loadCollection, loadHeroState, heroName } from "./collections.js";
import { findObjet, inkOn } from "./colors.js";
import { readText, writeText, listDir, pool } from "./graph.js";
import { renderMd, plain, parseDoc, sections } from "./md.js";
import { photoBox, photoControl } from "./photo.js";
import { updateItem } from "./forms.js";

const link = (path, cls, ...kids) => h("a", { class: cls, href: "#" + path }, ...kids);
const stale = s => s ? h("div", { class: "banner" }, "Hors connexion : dernière version enregistrée sur ce téléphone.") : null;
const flat = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/’/g, "'").toLowerCase();

/** Bouton rond « écouter » (voix du téléphone). */
const sbtn = text => h("button", { class: "sbtn", "aria-label": "Écouter", onclick: e => { e.preventDefault(); e.stopPropagation(); speak(text); } }, icon("speaker", 24, "#fff"));

/** Apparence d'un objet : couleur et icône du registre (R18), sinon selon son type. */
function objetLook(it) {
  const o = findObjet(it.name);
  if (o) return { color: o.couleur, ic: o.icone, ink: inkOn(o.couleur) };
  const t = flat(it.meta.categorie);
  const ic = /arme/.test(t) ? "sword" : /armure/.test(t) ? "helmet" : /soin|potion/.test(t) ? "potion" : /souvenir|lettre|carte/.test(t) ? "note" : "star";
  return { color: "#2F7F6F", ic, ink: "#FFFFFF" };
}
const bigIcon = (look, size = 62) => { const d = h("div", { class: "disc", style: `background:${look.color};width:${size}px;height:${size}px;border:3px solid var(--ink);flex:none` }); d.append(icon(look.ic, size * 0.5, look.ink, 2.2)); return d; };
const dashedCard = (ic, text) => h("div", { class: "card dashed" }, h("div", { class: "row" }, h("div", { class: "disc", style: "width:62px;height:62px;border:3px dashed var(--dash);flex:none" }, icon(ic, 30, "var(--dash)", 2)), h("div", { class: "grow muted", style: "font-size:19px" }, text)));

/* ================================================================== MODE ENFANT */

export async function journalScreen() {
  const ls = await listDir("05_Journal");
  const jf = ls.data.find(f => !f.dir && /^Journal_de_.*\.md$/i.test(f.name));
  const r = jf ? await readText("05_Journal/" + jf.name) : { text: null };
  if (r.text == null) throw new Error("Journal introuvable (05_Journal/Journal_de_….md).");
  const parts = r.text.replace(/\r\n/g, "\n").split(/\n(?=## )/).slice(1);
  const chapters = parts.map(p => {
    const lines = p.split("\n");
    const head = lines[0].replace(/^##\s*/, "");
    const [k, ...t] = head.split(/\s+[—–-]\s+/);
    const text = lines.slice(1).filter(l => !/^---+\s*$/.test(l) && !/^\*Les nouvelles/.test(l)).join("\n").trim();
    return { kicker: t.length ? k : "", title: t.length ? t.join(" — ") : k, text };
  }).filter(c => c.text);
  const nodes = [stale(r.stale)];
  for (const c of chapters) {
    nodes.push(h("div", { class: "list", style: "gap:8px" },
      h("div", { class: "row", style: "justify-content:space-between" },
        h("div", { class: "grow" }, c.kicker ? h("div", { class: "kicker" }, c.kicker) : null, h("h2", { style: "color:var(--red)" }, c.title)),
        sbtn(c.title + ". " + plain(c.text))),
      h("div", { class: "card md journal-text", html: renderMd(c.text, { dropTitle: false }) })));
  }
  nodes.push(dashedCard("book", "La prochaine aventure s'écrira ici."));
  const all = chapters.map(c => c.title + ". " + plain(c.text)).join(" ");
  return {
    title: "Mon journal", back: "/",
    node: h("div", { class: "page" }, nodes,
      h("div", { class: "bottombar" }, h("button", { class: "btn primary block", style: "font-size:20px", onclick: () => speak(all) }, icon("speaker", 26, "#fff"), "Écouter mon aventure")))
  };
}

export async function childObjets() {
  const { items, stale: st } = await loadCollection(COLLECTIONS.objet);
  const used = it => /utilis/i.test(it.etat);
  const sorted = [...items].sort((a, b) => Number(used(a)) - Number(used(b)));
  const nodes = [stale(st)];
  for (const it of sorted) {
    const look = objetLook(it), say = [it.name, it.apparence].filter(Boolean).join(". ");
    nodes.push(h("button", { class: "card bigcard" + (used(it) ? " faded" : ""), onclick: () => speak(say) },
      h("div", { class: "row" }, bigIcon(look),
        h("div", { class: "grow" }, h("h2", null, it.name), it.apparence ? h("div", { class: "muted", style: "font-size:19px" }, it.apparence) : null, used(it) ? h("span", { class: "chip", style: "align-self:flex-start;margin-top:4px" }, "utilisé") : null),
        sbtn(say))));
  }
  if (!items.length) nodes.push(h("div", { class: "muted center" }, COLLECTIONS.objet.empty));
  nodes.push(dashedCard("question", "La place d'un futur objet"));
  return { title: "Mes objets", back: "/", node: h("div", { class: "page" }, nodes) };
}

export async function childLieux() {
  const { items, stale: st } = await loadCollection(COLLECTIONS.lieu);
  const nodes = [stale(st),
    link("/child/carte", "card mapcta", h("div", { class: "row" }, icon("map", 54, "#fff", 2), h("div", null, h("h2", null, "Carte du monde"), h("div", null, "Tout mon monde"))))];
  for (const it of items) {
    const say = [it.name, it.apparence].filter(Boolean).join(". ");
    nodes.push(h("button", { class: "card bigcard", onclick: () => speak(say) },
      h("div", { class: "row" }, h("div", { class: "disc", style: "background:var(--blue);width:56px;height:56px;border:3px solid var(--ink);flex:none" }, icon("pin", 28, "#fff", 2.2)),
        h("div", { class: "grow" }, h("h2", null, it.name), it.apparence ? h("div", { class: "muted", style: "font-size:18px" }, it.apparence) : null), sbtn(say))));
  }
  nodes.push(dashedCard("question", "Un lieu à découvrir"));
  return { title: "Mes lieux", back: "/", node: h("div", { class: "page" }, nodes) };
}

const TYPES = [["vole", "Qui vole"], ["nage", "Qui nage"], ["terre", "Sur terre"]];

export async function childCompagnons() {
  const { items, stale: st } = await loadCollection(COLLECTIONS.compagnon);
  const nodes = [stale(st)];
  if (!items.length) {
    nodes.push(h("div", { class: "kicker" }, "Mes compagnons"),
      h("div", { class: "row", style: "justify-content:space-around;align-items:flex-start" }, TYPES.map(([, l]) => h("div", { class: "center list", style: "gap:6px;align-items:center" },
        h("div", { class: "disc", style: "width:92px;height:92px;border:4px dashed var(--dash)" }, icon("paw", 40, "var(--dash)", 2)), h("div", { style: "font:600 19px Fredoka" }, l)))),
      dashedCard("paw", "Un compagnon à rencontrer"),
      h("div", { class: "muted", style: "font-size:19px" }, `Quand ${heroName() === "l'aventurière" ? "je" : "je"} ferai un ami animal, il viendra ici. Je choisirai avec qui partir à l'aventure.`));
  } else {
    for (const [k, l] of TYPES) {
      const mine = items.filter(i => i.type === k);
      nodes.push(h("div", { class: "kicker" }, l),
        h("div", { class: "row", style: "flex-wrap:wrap;gap:14px;align-items:flex-start" }, mine.length ? mine.map(i => {
          const say = [i.name, i.apparence].filter(Boolean).join(". ");
          return h("button", { class: "compa", onclick: () => speak(say) }, i.photo ? photoBox("08_Photos/" + i.photo, "thumb big") : h("div", { class: "disc", style: "width:92px;height:92px;background:var(--teal);border:4px solid var(--ink)" }, icon("paw", 40, "#fff", 2)), h("div", { style: "font:600 19px Fredoka" }, i.name));
        }) : [h("div", { class: "disc", style: "width:92px;height:92px;border:4px dashed var(--dash)" }, icon("paw", 40, "var(--dash)", 2))]));
    }
  }
  return { title: "Mes compagnons", back: "/", node: h("div", { class: "page" }, nodes) };
}

/* ------------------------------------------------------------------ carte du monde */
const MYSTERY = [[22, 14], [84, 24], [14, 78], [90, 62], [34, 90]];

export async function mapScreen(mode) {
  const { items, stale: st } = await loadCollection(COLLECTIONS.lieu);
  const view = h("div", { class: "mapview", role: "img", "aria-label": "Carte du monde" });
  const world = h("div", { class: "mapworld" });
  const svg = `<svg viewBox="0 0 100 110" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><g fill="none" stroke="#B8956A" stroke-width=".7" stroke-dasharray="1.4 2.2" stroke-linecap="round"><circle cx="50" cy="55" r="16"/><circle cx="50" cy="55" r="34"/><circle cx="50" cy="55" r="52"/></g></svg>`;
  world.append(h("div", { style: "position:absolute;inset:0", html: svg }));
  for (const [x, y] of MYSTERY) world.append(h("div", { class: "mpin q", style: `left:${x}%;top:${y}%` }, h("span", { style: "font:600 34px Fredoka;color:var(--dash)" }, "?")));
  // lieux : position donnée (champ « carte ») ou répartis en cercle autour du village
  const placed = items.map((it, i) => {
    const village = /village/i.test(it.name);
    const a = (i / Math.max(items.length, 1)) * Math.PI * 2 - 1;
    const pos = it.carte || (village ? { x: 50, y: 50 } : { x: 50 + 30 * Math.cos(a), y: 50 + 30 * Math.sin(a) });
    return { it, pos, village };
  });
  for (const { it, pos, village } of placed) {
    world.append(h("div", { class: "mpin" + (village ? " home" : ""), style: `left:${pos.x}%;top:${pos.y}%` },
      icon("pin", village ? 46 : 34, "var(--ink)", 1.8, village ? "var(--red)" : "var(--blue)"),
      h("span", { class: "mlabel" }, it.name)));
  }
  view.append(world);
  let z = 1, tx = 0, ty = 0;
  const apply = () => {
    const w = view.clientWidth || 300, hgt = view.clientHeight || 330;
    tx = Math.max(Math.min(tx, 0), w - w * z); ty = Math.max(Math.min(ty, 0), hgt - hgt * z);
    world.style.setProperty("--z", String(z));
    world.style.transform = `translate(${tx}px,${ty}px) scale(${z})`;
  };
  const zoom = (k, cx, cy) => {
    const nz = Math.max(1, Math.min(3.5, z * k));
    const w = view.clientWidth || 300, hgt = view.clientHeight || 330;
    const px = cx ?? w / 2, py = cy ?? hgt / 2;
    tx = px - (px - tx) * (nz / z); ty = py - (py - ty) * (nz / z); z = nz; apply();
  };
  const ptrs = new Map(); let last = null;
  view.addEventListener("pointerdown", e => { view.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; });
  view.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); const cur = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 1) { tx += cur.x - prev.x; ty += cur.y - prev.y; ptrs.set(e.pointerId, cur); apply(); return; }
    ptrs.set(e.pointerId, cur);
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (last) { const r = view.getBoundingClientRect(); zoom(d / last, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
    last = d;
  });
  for (const n of ["pointerup", "pointercancel"]) view.addEventListener(n, e => { ptrs.delete(e.pointerId); last = null; });
  view.addEventListener("wheel", e => { e.preventDefault(); const r = view.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const btns = h("div", { class: "mapbtns" },
    h("button", { class: "iconbtn", "aria-label": "Zoom +", onclick: () => zoom(1.4) }, icon("plus", 26)),
    h("button", { class: "iconbtn", "aria-label": "Zoom −", onclick: () => zoom(1 / 1.4) }, icon("minus", 26)));
  const box = h("div", { class: "mapbox" }, view, btns);
  setTimeout(apply, 0);
  return {
    title: "Carte du monde", back: mode === "mj" ? "/mj/lieux" : "/child/c/lieu", nav: mode === "mj" ? "monde" : null,
    node: h("div", { class: "page" + (mode === "mj" ? " with-nav" : "") }, stale(st), box,
      h("div", { class: "muted", style: "font-size:18px" }, mode === "mj"
        ? "La carte se déplace et se zoome avec les doigts. Chaque lieu se place avec le champ « Place sur la carte » de sa fiche ; sans position, il est posé en cercle autour du village."
        : "Ma carte se déplace et se zoome avec les doigts. Les « ? » sont des lieux à découvrir !"),
      h("div", { class: "fiche-meta" }, h("span", { class: "chip", style: "background:#F6D9D3" }, "Mon village"), h("span", { class: "chip" }, "À découvrir")))
  };
}

/* ================================================================== MODE MJ */

/** Lieux ou objets : deux onglets, recherche, +. */
export async function lieuxObjets(tab) {
  const colId = tab === "objets" ? "objet" : "lieu";
  const [lieux, objets] = await Promise.all([loadCollection(COLLECTIONS.lieu), loadCollection(COLLECTIONS.objet)]);
  const cur = colId === "lieu" ? lieux : objets;
  const tabs = h("div", { class: "tabs" },
    h("a", { class: "tab center" + (colId === "lieu" ? " on" : ""), href: "#/mj/lieux" }, `Lieux · ${lieux.items.length}`),
    h("a", { class: "tab center" + (colId === "objet" ? " on" : ""), href: "#/mj/objets" }, `Objets · ${objets.items.length}`));
  const list = h("div", { class: "list" });
  const draw = q => {
    list.replaceChildren();
    if (colId === "lieu") list.append(link("/mj/carte", "card mapcta", h("div", { class: "row" }, icon("map", 40, "#fff", 2), h("div", { class: "grow" }, h("h3", null, "Carte du monde"), h("div", null, "Voir toute la carte")), icon("next", 22, "#fff"))));
    const shown = cur.items.filter(i => flat(i.name).includes(flat(q)));
    if (!shown.length) list.append(h("div", { class: "muted center" }, cur.items.length ? "Rien ne correspond." : COLLECTIONS[colId].empty));
    for (const it of shown) {
      const to = `/mj/c/${colId}/${encodeURIComponent(it.file)}`;
      const look = colId === "objet" ? objetLook(it) : null;
      const sub = colId === "objet" ? [it.meta.categorie, it.etat].filter(Boolean).join(" · ") : String(it.meta.ou || "");
      list.append(link(to, "card", h("div", { class: "row" },
        look ? bigIcon(look, 54) : h("div", { class: "disc", style: "background:var(--blue);width:54px;height:54px;border:3px solid var(--ink);flex:none" }, icon("pin", 26, "#fff", 2.2)),
        h("div", { class: "grow" }, h("h3", null, it.name), sub ? h("div", { class: "muted", style: "font-size:15px" }, sub) : null),
        icon("next", 22, "var(--muted)"))));
    }
  };
  const search = h("div", { class: "search" }, icon("search", 22, "var(--muted)"),
    h("input", { type: "search", placeholder: colId === "lieu" ? "Rechercher un lieu" : "Rechercher un objet", "aria-label": "Chercher", oninput: e => draw(e.target.value) }));
  draw("");
  return {
    title: "Lieux et objets", back: "/mj/monde", nav: "monde",
    action: link(`/mj/nouveau/${colId}`, "iconbtn plus", icon("plus", 26, "#fff", 3)),
    node: h("div", { class: "page with-nav" }, stale(cur.stale), tabs, search, list)
  };
}

/** Compagnons groupés par type, + pour en ajouter. */
export async function mjCompagnons() {
  const { items, stale: st } = await loadCollection(COLLECTIONS.compagnon);
  const nodes = [stale(st)];
  for (const [k, l] of TYPES) {
    nodes.push(h("div", { class: "kicker" }, l));
    const mine = items.filter(i => i.type === k);
    if (!mine.length) nodes.push(h("div", { class: "card dashed muted" }, "Pas encore de compagnon de ce type."));
    for (const i of mine) nodes.push(link(`/mj/c/compagnon/${encodeURIComponent(i.file)}`, "card", h("div", { class: "row" },
      i.photo ? photoBox("08_Photos/" + i.photo, "thumb") : h("div", { class: "disc", style: "background:var(--teal);width:54px;height:54px;border:3px solid var(--ink);flex:none" }, icon("paw", 26, "#fff", 2)),
      h("div", { class: "grow" }, h("h3", null, i.name), h("div", { class: "fiche-meta" }, i.animal ? h("span", { class: "chip" }, i.animal) : null, i.coeurs != null ? h("span", { class: "chip" }, icon("heart", 16, "var(--ink)", 1.6, "var(--red)"), `${i.coeurs} cœurs`) : null)),
      icon("next", 22, "var(--muted)"))));
  }
  nodes.push(h("div", { class: "card md" }, h("div", { html: "<strong>Rappel :</strong> le compagnon qui part avec " + heroName() + " est noté dans le récap du soir : rien à cocher ici. Claude met à jour le compte rendu et le journal." })));
  return {
    title: "Compagnons", back: "/mj/monde", nav: "monde",
    action: link("/mj/nouveau/compagnon", "iconbtn plus", icon("plus", 26, "#fff", 3)),
    node: h("div", { class: "page with-nav" }, nodes)
  };
}

/* ------------------------------------------------------------------ onglet secondaire d'une fiche */
export const SECONDARY = { creature: "Rencontres", personnage: "Rencontres", lieu: "Apparitions", objet: "Utilisations", compagnon: "Aventures" };

const terms = name => {
  const core = flat(name).replace(/^(le |la |les |l'|un |une )/, "").replace(/\s*[—–-].*$/, "").trim();
  const first = core.split(/[\s']+/).find(w => w.length >= 5);
  return [...new Set([core, first].filter(Boolean))];
};
const clean = l => l.replace(/\*\*/g, "").replace(/^\s*(?:[-*]|\d+\.)\s+/, "").replace(/`/g, "").trim();

/** Où une fiche apparaît dans les histoires jouées et les récaps. */
export async function appearances(item) {
  const ls = await listDir("01_Histoires_Jouees");
  const files = ls.data.filter(f => !f.dir && /\.md$/i.test(f.name));
  const ts = terms(item.name);
  const docs = await pool(files, async f => { const r = await readText("01_Histoires_Jouees/" + f.name); return r.text == null ? null : { f: f.name, d: parseDoc(r.text), text: r.text }; });
  const out = [];
  for (const x of docs.filter(Boolean)) {
    const lines = x.d.body.split("\n").filter(l => l.trim() && ts.some(t => flat(l).includes(t))).map(clean).filter(l => l && !/^#/.test(l));
    if (lines.length) out.push({ title: x.d.title || x.f, lines: lines.slice(0, 3) });
  }
  return out;
}

const norm = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Fiche MJ d'un compagnon : ses pouvoirs, et le lien vers l'animal sauvage du bestiaire (le compagnon est un animal apprivoisé). */
export async function compagnonHead(item) {
  const nodes = [];
  if (item.pouvoirs.length) nodes.push(h("div", { class: "card" }, h("div", { class: "kicker" }, "Pouvoirs"),
    h("div", { class: "row", style: "flex-wrap:wrap;gap:8px;margin-top:6px" }, item.pouvoirs.map(p => h("span", { class: "chip" }, icon("star", 16, "var(--ink)", 1.6, "var(--yellow)"), p)))));
  if (item.animal) {
    let c = null;
    try { c = (await loadCollection(COLLECTIONS.creature)).items.find(i => norm(i.name) === norm(item.animal)); } catch { /* hors connexion */ }
    nodes.push(c ? link(`/mj/c/creature/${encodeURIComponent(c.file)}`, "card", h("div", { class: "row" }, icon("monster", 26, "var(--purple)", 2), h("div", { class: "grow" }, h("div", { class: "kicker" }, "Animal sauvage du bestiaire"), h("h3", null, c.name)), icon("next", 22, "var(--muted)")))
      : h("div", { class: "card dashed muted" }, `Animal : ${item.animal} (pas encore dans le bestiaire)`));
  }
  return nodes;
}

export async function secondaryPanel(item, colId) {
  const nodes = [];
  if (colId === "creature") {   // les compagnons de ce type d'animal = ceux que l'héroïne a apprivoisés
    try {
      const mine = (await loadCollection(COLLECTIONS.compagnon)).items.filter(i => i.animal && norm(i.animal) === norm(item.name));
      for (const i of mine) nodes.push(link(`/mj/c/compagnon/${encodeURIComponent(i.file)}`, "card", h("div", { class: "row" }, icon("paw", 26, "var(--teal)", 2), h("div", { class: "grow" }, h("div", { class: "kicker" }, "Apprivoisé : compagnon"), h("h3", null, i.name)), icon("next", 22, "var(--muted)"))));
    } catch { /* hors connexion */ }
  }
  const done = sections(item.body).find(s => /^ce que \S+ a fait/i.test(s.title));
  if (done && done.text.trim()) nodes.push(h("div", { class: "card md" }, h("h3", null, done.title), h("div", { html: renderMd(done.text) })));
  let found = [];
  try { found = await appearances(item); } catch { /* hors connexion : on n'affiche que ce qui est déjà là */ }
  if (found.length) for (const f of found) nodes.push(h("div", { class: "card" }, h("div", { class: "kicker" }, f.title), h("ul", { class: "steplist", style: "font-size:16px" }, f.lines.map(l => h("li", null, l)))));
  else if (!nodes.length) nodes.push(h("div", { class: "card dashed muted" }, "Pas encore mentionné dans une histoire jouée."));
  return h("div", { class: "list" }, nodes);
}

/* ------------------------------------------------------------------ photos à classer */
const CLASSES = [["creature", "Monstre"], ["lieu", "Lieu"], ["objet", "Objet"], ["personnage", "Personnage"], ["compagnon", "Compagnon"]];

export async function photosScreen() {
  const ls = await listDir("08_Photos");
  const photos = ls.data.filter(f => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name)).map(f => f.name).sort().reverse();
  const cols = {};
  await Promise.all(CLASSES.map(async ([id]) => { try { cols[id] = (await loadCollection(COLLECTIONS[id])).items; } catch { cols[id] = []; } }));
  const used = new Set(Object.values(cols).flat().map(i => i.photo).filter(Boolean));
  let todo = photos.filter(p => !used.has(p));
  let chosen = null, classe = "creature", target = null;

  const grid = h("div", { class: "tiles" });
  const panel = h("div", { class: "card" });
  const msg = h("div", { class: "muted center" });
  const drawGrid = () => {
    grid.replaceChildren();
    if (!todo.length) { grid.append(h("div", { class: "card dashed muted", style: "grid-column:1/-1" }, photos.length ? "Toutes les photos sont reliées à une fiche." : "Aucune photo pour l'instant. Prends-en depuis « Mes outils » ou avec le bouton photo.")); return; }
    for (const p of todo) {
      const b = h("button", { class: "ptile" + (chosen === p ? " on" : ""), "aria-pressed": String(chosen === p), onclick: () => { chosen = p; target = null; drawGrid(); drawPanel(); } },
        photoBox("08_Photos/" + p, "photo sq"), h("span", { class: "muted", style: "font-size:12px;overflow-wrap:anywhere" }, p));
      if (chosen === p) b.append(h("span", { class: "tick" }, icon("check", 20, "#fff", 3)));
      grid.append(b);
    }
  };
  const drawPanel = () => {
    panel.replaceChildren();
    if (!chosen) { panel.append(h("div", { class: "muted" }, "Touche une photo pour l'associer à une fiche.")); return; }
    const chips = h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" }, CLASSES.map(([id, l]) => h("button", { class: "tab" + (id === classe ? " on" : ""), style: "flex:0 1 auto;padding:8px 14px", onclick: () => { classe = id; target = null; drawPanel(); } }, l)));
    const list = h("div", { class: "list", style: "gap:8px" });
    const pick = h("div", { class: "search" }, icon("search", 22, "var(--muted)"), h("input", { type: "search", placeholder: "Choisir la fiche", oninput: e => drawList(e.target.value) }));
    const drawList = q => {
      list.replaceChildren();
      const sh = (cols[classe] || []).filter(i => flat(i.name).includes(flat(q || "")));
      if (!sh.length) list.append(h("div", { class: "muted" }, (cols[classe] || []).length ? "Rien ne correspond." : "Aucune fiche de ce type pour l'instant."));
      for (const i of sh) list.append(h("button", { class: "card", style: "padding:8px 12px;flex-direction:row;align-items:center;gap:10px;" + (target === i.file ? "background:var(--yellow)" : ""), onclick: () => { target = i.file; drawList(q); } }, icon(target === i.file ? "check" : COLLECTIONS[classe].icon, 22), i.name));
    };
    drawList("");
    const go = h("button", { class: "btn primary block", onclick: async () => {
      if (!target) { msg.className = "ko center"; msg.textContent = "Choisis d'abord une fiche."; return; }
      go.disabled = true; msg.className = "muted center"; msg.textContent = "Enregistrement…";
      try {
        await updateItem(classe, target, (m, b) => ({ meta: { ...m, photo: chosen }, body: b }));
        const it = (cols[classe] || []).find(i => i.file === target); if (it) it.photo = chosen;
        todo = todo.filter(p => p !== chosen); chosen = null; target = null;
        msg.className = "ok center"; msg.textContent = "Photo associée.";
        drawGrid(); drawPanel();
      } catch (e) { msg.className = "ko center"; msg.textContent = e.message || "Échec."; go.disabled = false; }
    } }, "Associer");
    panel.append(h("div", { class: "kicker" }, "Associer la photo choisie à"), chips, pick, list, go);
  };
  drawGrid(); drawPanel();

  const input = h("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none" });
  input.addEventListener("change", async () => {
    const f = input.files[0]; if (!f) return;
    msg.className = "muted center"; msg.textContent = "Envoi de la photo…";
    try { const { sendPhoto } = await import("./photo.js"); const r = await sendPhoto(f); todo.unshift(r.name); chosen = r.name; msg.className = "ok center"; msg.textContent = "Photo rangée."; drawGrid(); drawPanel(); }
    catch (e) { msg.className = "ko center"; msg.textContent = e.status ? "La photo n'a pas pu être envoyée." : "Pas de réseau."; }
    input.value = "";
  });
  return {
    title: "Photos à classer", back: "/mj/monde", nav: "monde",
    action: h("button", { class: "iconbtn plus", "aria-label": "Prendre une photo", onclick: () => input.click() }, icon("camera", 24, "#fff", 2)),
    node: h("div", { class: "page with-nav" }, stale(ls.stale), h("div", { class: "muted" }, "Les photos prises avec l'appli, dans le dossier 08_Photos, pas encore reliées à une fiche."), grid, panel, msg, input)
  };
}

/* ------------------------------------------------------------------ Notes du MJ : une seule page pour les notes et les idées */
const NOTES_TITRE = "# Inbox — idées et notes du MJ";

/** Range une nouvelle entrée à la fin de la section « À traiter » (la crée si besoin). Le reste du fichier n'est pas touché. */
export function addToInbox(text, entry) {
  let t = String(text || "").trimEnd();
  if (!/^## À traiter\s*$/m.test(t)) t = (t || NOTES_TITRE) + "\n\n## À traiter\n\n## Traité";
  const i = t.search(/^## Traité\s*$/m);
  if (i < 0) return t + "\n\n" + entry + "\n";
  return t.slice(0, i).trimEnd() + "\n\n" + entry + "\n\n" + t.slice(i) + "\n";
}

/** Notes et idées : une seule zone de saisie. Chaque entrée est rangée sous « À traiter » ; Claude la déplace sous « Traité » une fois exploitée. */
export async function notesPanel(notesFile, onSaved) {
  const names = [];
  for (const id of ["objet", "personnage", "lieu", "creature", "compagnon"]) {
    try { const { items } = await loadCollection(COLLECTIONS[id]); names.push(...items.map(i => i.name)); } catch { /* ok */ }
  }
  const picks = new Set();
  const field = h("textarea", { class: "field", style: "min-height:140px", placeholder: "Une idée d'histoire, un élément pour l'univers, une phrase de la joueuse, un rappel… (le micro du clavier fonctionne ici)", "aria-label": "Nouvelle note" });
  const chipBox = h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" });
  const drawChips = () => chipBox.replaceChildren(...[...names.slice(0, 10), "Fils ouverts"].map(n => h("button", { class: "tab" + (picks.has(n) ? " on" : ""), style: "flex:0 1 auto;padding:8px 14px", onclick: () => { picks.has(n) ? picks.delete(n) : picks.add(n); drawChips(); } }, n)));
  drawChips();
  const msg = h("div", { class: "muted" });
  const btn = h("button", { class: "btn primary block" }, icon("bulb", 24, "#fff"), "Enregistrer dans OneDrive");
  btn.addEventListener("click", async () => {
    const note = field.value.trim(); if (!note) { msg.className = "ko"; msg.textContent = "Écris d'abord quelque chose."; return; }
    btn.disabled = true; msg.className = "muted"; msg.textContent = "Enregistrement…";
    try {
      const fresh = await readText(notesFile);                  // on relit juste avant d'écrire
      if (fresh.stale) throw new Error("Pas de réseau : rien n'a été enregistré.");
      const d = new Date(), p = n => String(n).padStart(2, "0");
      const when = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
      const reprise = picks.size ? `\n**À reprendre :** ${[...picks].join(", ")}` : "";
      const next = addToInbox(fresh.text, `### ${when}\n${note}${reprise}`);
      await writeText(notesFile, next);
      field.value = ""; picks.clear(); drawChips();
      msg.className = "ok"; msg.textContent = "Enregistré.";
      if (onSaved) onSaved(next);
    } catch (e) { msg.className = "ko"; msg.textContent = e.message || "Échec de l'enregistrement."; }
    btn.disabled = false;
  });
  return h("div", { class: "list" },
    field,
    h("div", { class: "kicker" }, "Cela concerne (facultatif)"), chipBox, btn, msg);
}

/* ------------------------------------------------------------------ Monde (mode MJ) */
async function count(col) {
  try { const ls = await listDir(col.folder); return ls.data.filter(f => !f.dir && /\.md$/i.test(f.name) && !(col.exclude && col.exclude.test(f.name))).length; } catch { return null; }
}
export async function mjWorldScreen() {
  let st = { coeurs: 3, armure: 1 };
  try { st = await loadHeroState(); } catch (e) { if (e.auth) throw e; }
  const [nP, nC, nB, nL, nO, ph] = await Promise.all([count(COLLECTIONS.personnage), count(COLLECTIONS.compagnon), count(COLLECTIONS.creature), count(COLLECTIONS.lieu), count(COLLECTIONS.objet),
    listDir("08_Photos").then(l => l.data.filter(f => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name)).length).catch(() => null)]);
  const plural = (n, s, p) => n == null ? "" : n === 0 ? `Aucun${s.endsWith("e") ? "e" : ""} ${s}` : `${n} ${n > 1 ? p : s}`;
  const tile = (to, ic, color, name, sub) => link(to, "card wtile", disc(ic, color, 52), h("h3", null, name), h("div", { class: "muted", style: "font-size:15px" }, sub));
  return {
    title: "Monde", nav: "monde",
    node: h("div", { class: "page with-nav" },
      link("/mj/heroine", "card", h("div", { class: "row" }, h("div", { class: "disc", style: "background:var(--yellow);width:60px;height:60px;border:3px solid var(--ink)" }, icon("helmet", 30, "var(--ink)", 2)),
        h("div", { class: "grow" }, h("h3", null, `Fiche de ${heroName()}`), h("div", { class: "row", style: "gap:8px" }, hearts(Math.min(st.coeurs, 5), 18, 120), icon("shield", 20, "var(--ink)", 1.6, "#A9BDD1"), h("span", null, String(st.armure)))), icon("next", 22, "var(--muted)"))),
      link("/mj/carte", "card mapcta", h("div", { class: "row" }, icon("map", 40, "#fff", 2), h("div", { class: "grow" }, h("h3", null, "Carte du monde"), h("div", null, "Tout son monde")), icon("next", 22, "#fff"))),
      h("div", { class: "tiles" },
        tile("/mj/c/personnage", "friends", "var(--yellow)", "Personnages", n(nP, "rencontré", "rencontrés")),
        tile("/mj/c/compagnon", "paw", "var(--teal)", "Compagnons", nC ? plural(nC, "compagnon", "compagnons") : "Aucun pour l'instant"),
        tile("/mj/c/creature", "monster", "var(--purple)", "Bestiaire", plural(nB, "créature", "créatures")),
        tile("/mj/lieux", "pin", "var(--blue)", "Lieux et objets", `${nL ?? 0} lieux · ${nO ?? 0} objets`),
        tile("/mj/f/00_REGLES_PROJET.md", "book", "var(--red)", "Règles", "Pour Justine aussi"),
        tile("/mj/photos", "image", "var(--muted)", "Photos à classer", ph == null ? "Dans 08_Photos" : `${ph} dans 08_Photos`)))
  };
  function n(v, s, p) { return v == null ? "" : v === 0 ? "Aucun pour l'instant" : `${v} ${v > 1 ? p : s}`; }
}
