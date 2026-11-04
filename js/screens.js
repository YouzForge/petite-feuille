// Tous les écrans. Chaque écran renvoie { title, back, nav, node } ; le routeur (main.js) les affiche.
import { h, icon, hearts, disc, spinner, longPress, ringBadge, speak, objSlot, emptySlot } from "./ui.js";
import { COLLECTIONS, loadCollection, loadItem, loadHeroState, childView } from "./collections.js";
import { readText, writeText, uploadBlob, fetchBlob, setFolderPath, listFolders, isProjectFolder } from "./graph.js";
import { renderMd, plain, parseDoc } from "./md.js";
import { login, logout, userName, accountHash } from "./auth.js";
import { getSession } from "./jouer.js";
import { parseSteps } from "./md.js";

const go = path => { location.hash = "#" + path; };
const link = (path, cls, ...kids) => h("a", { class: cls, href: "#" + path }, ...kids);
const staleBanner = stale => stale ? h("div", { class: "banner" }, "Hors connexion : dernière version enregistrée sur ce téléphone.") : null;

/* ------------------------------------------------------------------ connexion */
export function loginScreen() {
  return {
    node: h("div", { class: "page center", style: "padding-top:70px" },
      h("img", { class: "head", src: "img/avatar.png", alt: "", style: "height:110px" }),
      h("h1", null, "Petite Feuille"),
      h("div", { class: "muted" }, "Le jeu de rôle du soir"),
      h("button", { class: "btn primary block", style: "margin-top:24px", onclick: () => login() }, "Se connecter avec Microsoft"),
      h("div", { class: "muted", style: "font-size:14px" }, "Une seule fois par jour, pour protéger vos fichiers."))
  };
}

export async function deniedScreen() {
  const code = (await accountHash()).slice(0, 12);
  return {
    node: h("div", { class: "page center", style: "padding-top:70px" },
      h("img", { class: "head", src: "img/avatar.png", alt: "", style: "height:90px;opacity:.6" }),
      h("h2", null, "Accès réservé"),
      h("div", { class: "muted" }, "Cette application est privée. Le compte utilisé n'est pas autorisé."),
      h("button", { class: "btn block", onclick: () => logout() }, "Changer de compte"),
      h("div", { class: "muted", style: "font-size:13px" }, "Code à donner au propriétaire pour autoriser ce compte : ", h("strong", null, code)))
  };
}

export function reconnectScreen() {
  return {
    node: h("div", { class: "page center", style: "padding-top:70px" },
      h("h2", null, "Il faut se reconnecter"),
      h("div", { class: "muted" }, "La connexion à OneDrive a expiré. C'est normal, cela arrive environ une fois par jour."),
      h("button", { class: "btn primary block", onclick: () => login() }, "Me reconnecter"))
  };
}

/** Carte d'état de l'héroïne : cœurs, armure, équipement porté et place pour les compagnons. */
function stateCard(st, big = true) {
  const companions = st.compagnons || [];                       // pas encore de collection « compagnons » : cases réservées
  const slots = companions.length ? companions.map(() => emptySlot("paw")) : [emptySlot("paw"), emptySlot("paw"), emptySlot("paw")];
  return h("div", { class: "card statecard" },
    h("div", { class: "state" },
      hearts(st.coeurs, big ? 34 : 28, 200),
      h("div", { class: "row", style: "gap:8px" }, icon("shield", big ? 34 : 28, "var(--ink)", 1.6, "#A9BDD1"), h("h2", null, String(st.armure)))),
    h("div", { class: "gear" },
      h("div", null, h("div", { class: "kicker" }, "Équipement"), h("div", { class: "slots" }, st.equip && st.equip.length ? st.equip.map(o => objSlot(o)) : h("span", { class: "muted", style: "font-size:14px" }, "Rien pour l'instant"))),
      h("div", null, h("div", { class: "kicker" }, "Compagnons"), h("div", { class: "slots" }, slots))));
}

/* ------------------------------------------------------------------ mode enfant */
const TILES = [
  { name: "Mes objets", icon: "sword", color: "var(--teal)", to: "/child/bientot/Mes objets" },
  { name: "Mes lieux", icon: "pin", color: "var(--blue)", to: "/child/bientot/Mes lieux" },
  { name: "Mes monstres", icon: "monster", color: "var(--purple)", to: "/child/c/creature" },
  { name: "Mes amis", icon: "friends", color: "var(--yellow)", to: "/child/c/personnage" },
  { name: "Mes compagnons", icon: "paw", color: "var(--red)", to: "/child/bientot/Mes compagnons" },
  { name: "Mes outils", icon: "tools", color: "var(--muted)", to: "/child/outils" }
];

export async function childHome() {
  let st = { prenom: "", coeurs: 3, armure: 1, equip: [], stale: false };
  try { st = await loadHeroState(); } catch (e) { if (e.auth) throw e; }

  const { wrap, ring } = ringBadge("lock");
  const parents = h("div", { class: "parents no-select", role: "button", "aria-label": "Parents : appui long de 3 secondes" },
    wrap, h("span", null, "Parents · appui long"));
  longPress(parents, ring, 3000, () => { sessionStorage.pf_mj = "1"; go("/mj/ce-soir"); });

  return {
    node: h("div", { class: "page" },
      staleBanner(st.stale),
      h("div", { class: "hello" },
        h("img", { class: "head", src: "img/avatar.png", alt: "" }),
        h("div", null, h("h1", null, st.prenom ? `Bonjour ${st.prenom} !` : "Bonjour !"), h("div", { class: "muted" }, "Apprentie aventurière"))),
      stateCard(st),
      link("/child/bientot/Mon journal", "journal",
        icon("book", 56, "#fff", 2),
        h("div", null, h("h2", null, "Mon journal"), h("small", null, icon("speaker", 22, "#fff"), "Écouter mon aventure"))),
      h("div", { class: "tiles" }, TILES.map(t => link(t.to, "tile", disc(t.icon, t.color, 60), t.name))),
      parents)
  };
}

export function soon(name) {
  return {
    title: name, back: "/",
    node: h("div", { class: "page center", style: "padding-top:60px" },
      h("div", { class: "disc", style: "background:var(--yellow);width:90px;height:90px" }, icon("moon", 44, "var(--ink)")),
      h("h2", null, "Bientôt !"),
      h("div", { class: "muted" }, "Cette page arrive dans une prochaine version."))
  };
}

/* ------------------------------------------------------------------ outils de l'enfant : appareil photo */
function resize(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res({ blob: b, url: c.toDataURL("image/jpeg", .5) }) : rej(new Error("Photo illisible")), "image/jpeg", .82);
    };
    img.onerror = () => rej(new Error("Photo illisible"));
    img.src = URL.createObjectURL(file);
  });
}
const stamp = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function tools() {
  const input = h("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none" });
  const status = h("div", { class: "muted center" });
  const prev = h("img", { alt: "", style: "max-width:100%;border-radius:18px;border:3px solid var(--ink);display:none" });
  input.addEventListener("change", async () => {
    const f = input.files[0]; if (!f) return;
    status.className = "muted center"; status.textContent = "Envoi de la photo…";
    try {
      const r = await resize(f);
      prev.src = r.url; prev.style.display = "block";
      const name = stamp() + ".jpg";
      await uploadBlob("08_Photos/" + name, r.blob, "image/jpeg");
      status.className = "ok center"; status.textContent = "Photo rangée !";
    } catch (e) {
      status.className = "ko center";
      status.textContent = e.status ? "La photo n'a pas pu être envoyée (" + e.message + ")." : "Pas de réseau : la photo n'a pas été envoyée. Réessaie quand le réseau revient.";
    }
    input.value = "";
  });
  return {
    title: "Mes outils", back: "/",
    node: h("div", { class: "page" },
      h("button", { class: "tile", style: "border-radius:26px;width:100%", onclick: () => input.click() }, disc("camera", "var(--teal)", 84), "Prendre une photo"),
      prev, status, input,
      h("div", { class: "muted center", style: "font-size:14px" }, "D'autres outils arriveront ici."))
  };
}

/* ------------------------------------------------------------------ collections (modèle unique, R14) */
function photoBox(rel, cls = "photo") {
  const box = h("div", { class: cls }, icon("image", 40, "var(--muted)"));
  fetchBlob(rel).then(b => { box.innerHTML = ""; box.append(h("img", { src: URL.createObjectURL(b), alt: "" })); }).catch(() => { /* garde l'icône */ });
  return box;
}

function chips(item, col) {
  const out = [];
  if (col.id === "creature") {
    if (item.coeurs != null) out.push(h("span", { class: "chip" }, icon("heart", 16, "var(--ink)", 1.6, "var(--red)"), `${item.coeurs} cœur${item.coeurs > 1 ? "s" : ""}`));
    if (item.boss) out.push(h("span", { class: "chip boss" }, icon("star", 16, "var(--ink)", 1.6, "var(--yellow)"), "Boss"));
  }
  return out;
}

export async function collectionList(colId, mode) {
  const col = COLLECTIONS[colId];
  if (!col) throw new Error("Collection inconnue");
  const { items, stale } = await loadCollection(col);
  const base = mode === "child" ? "/child/c/" : "/mj/c/";
  const title = mode === "child" && col.child ? col.child.label : col.label;

  const list = h("div", { class: mode === "child" ? "tiles" : "list" });
  const draw = q => {
    list.innerHTML = "";
    const shown = items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));
    if (!shown.length) list.append(h("div", { class: "muted center", style: "grid-column:1/-1" }, items.length ? "Rien ne correspond." : col.empty));
    for (const it of shown) {
      const to = `${base}${col.id}/${encodeURIComponent(it.file)}`;
      if (mode === "child") {
        list.append(link(to, "tile rel", it.boss ? h("span", { class: "star" }, icon("star", 26, "var(--ink)", 1.6, "var(--yellow)")) : null,
          it.photo ? photoBox("08_Photos/" + it.photo, "thumb") : disc(col.icon, col.child ? col.child.color : "var(--purple)"),
          it.name, it.coeurs != null ? hearts(it.coeurs, 20) : null));
      } else {
        list.append(link(to, "card rel", it.boss ? h("span", { class: "star" }, icon("star", 26, "var(--ink)", 1.6, "var(--yellow)")) : null,
          h("div", { class: "row" },
            it.photo ? photoBox("08_Photos/" + it.photo, "thumb") : h("div", { class: "thumb" }, icon(col.icon, 28, "var(--ink)")),
            h("div", { class: "grow" }, h("h3", null, it.name), h("div", { class: "fiche-meta" }, chips(it, col))))));
      }
    }
  };
  const search = h("div", { class: "search" }, icon("search", 22, "var(--muted)"),
    h("input", { type: "search", placeholder: "Chercher…", "aria-label": "Chercher", oninput: e => draw(e.target.value) }));
  draw("");
  return {
    title, back: mode === "child" ? "/" : "/mj/monde",
    nav: mode === "mj" ? (colId === "histoire" || colId === "prochaine" ? "histoires" : "monde") : null,
    node: h("div", { class: "page" + (mode === "mj" ? " with-nav" : "") }, staleBanner(stale), items.length > 5 || mode === "mj" ? search : null, list)
  };
}

export async function collectionFiche(colId, file, mode) {
  const col = COLLECTIONS[colId];
  const { item, stale } = await loadItem(col, decodeURIComponent(file));
  const nodes = [staleBanner(stale)];
  const head = h("div", { class: "rel" }, item.boss ? h("span", { class: "star" }, icon("star", 34, "var(--ink)", 1.6, "var(--yellow)")) : null,
    item.photo ? photoBox("08_Photos/" + item.photo) : h("div", { class: "photo" }, icon(col.icon, 56, "var(--muted)")));
  nodes.push(head, h("h1", null, item.name), h("div", { class: "fiche-meta" }, chips(item, col)));

  if (mode === "child") {
    const v = childView(item);
    const spoken = [item.name, v.description, plain(v.faits)].filter(Boolean).join(". ");
    nodes.push(h("button", { class: "btn red block", onclick: () => speak(spoken) }, icon("speaker", 26, "#fff"), "Écouter"));
    if (v.description) nodes.push(h("div", { class: "card" }, h("div", null, v.description)));
    if (v.faits) nodes.push(h("div", { class: "card md" }, h("h3", null, "Ce que j'ai fait"), h("div", { html: renderMd(v.faits) })));
  } else {
    if (colId === "prochaine") nodes.push(link("/mj/jouer/" + encodeURIComponent(item.file), "btn primary block", icon("dice", 26, "#fff"), "Jouer cette histoire"));
    nodes.push(h("div", { class: "card md", html: renderMd(item.body) }));
  }
  return {
    title: item.name, back: `${mode === "child" ? "/child" : "/mj"}/c/${colId}`,
    nav: mode === "mj" ? (colId === "histoire" || colId === "prochaine" ? "histoires" : "monde") : null,
    node: h("div", { class: "page" + (mode === "mj" ? " with-nav" : "") }, nodes)
  };
}

/* ------------------------------------------------------------------ mode MJ */
export async function mjTonight() {
  let st = { coeurs: 3, armure: 1, equip: [] }, last = null, next = null, stale = false;
  try { st = await loadHeroState(); stale = st.stale; } catch (e) { if (e.auth) throw e; }
  try { const { items } = await loadCollection(COLLECTIONS.histoire); last = items[items.length - 1] || null; } catch (e) { if (e.auth) throw e; }
  try { const { items } = await loadCollection(COLLECTIONS.prochaine); next = items.find(i => /^pr[eê]te?$/i.test(String(i.meta.statut || ""))) || null; } catch (e) { if (e.auth) throw e; }
  const sess = getSession();
  const playFile = sess ? sess.file : next ? next.file : null;
  return {
    title: "Ce soir", nav: "ce-soir",
    node: h("div", { class: "page with-nav" },
      staleBanner(stale),
      stateCard(st, false),
      playFile
        ? h("div", { class: "card" },
            h("div", { class: "kicker" }, sess ? "Partie en cours" : "Histoire de ce soir"),
            h("h2", null, sess ? sess.titre : next.name),
            next && !sess ? h("div", { class: "muted" }, [next.meta.duree, parseSteps(next.body).length ? `${parseSteps(next.body).length} étapes` : null].filter(Boolean).join(" · ")) : null,
            link("/mj/jouer/" + encodeURIComponent(playFile), "btn primary block", icon("dice", 26, "#fff"), sess ? "Reprendre la partie" : "Jouer"),
            sess ? link("/mj/recap", "btn block", "Terminer et faire le récap") : null)
        : h("div", { class: "card" }, h("h3", null, "Pas d'histoire prête pour ce soir"), h("div", { class: "muted" }, "Une histoire apparaît ici quand son fichier (dans 02_Campagne/Prochaines) a le statut « prête ».")),
      last ? link(`/mj/c/histoire/${encodeURIComponent(last.file)}`, "card", h("div", { class: "kicker" }, "Dernière histoire jouée"), h("h3", null, last.name)) : null)
  };
}

export async function mjStories() {
  const [wait, played] = await Promise.all([loadCollection(COLLECTIONS.prochaine).catch(e => { if (e.auth) throw e; return { items: [], stale: false }; }), loadCollection(COLLECTIONS.histoire)]);
  const sect = (title, col, items) => [h("div", { class: "kicker" }, title),
    items.length ? h("div", { class: "list" }, items.map(it => link(`/mj/c/${col.id}/${encodeURIComponent(it.file)}`, "card", h("div", { class: "row" },
      h("div", { class: "thumb" }, icon(col.icon, 28, "var(--ink)")), h("div", { class: "grow" }, h("h3", null, it.name), it.meta.statut ? h("div", { class: "fiche-meta" }, h("span", { class: "chip" }, String(it.meta.statut))) : null))))) : h("div", { class: "muted" }, col.empty)];
  return {
    title: "Histoires", nav: "histoires",
    node: h("div", { class: "page with-nav" }, staleBanner(wait.stale || played.stale), ...sect("En attente", COLLECTIONS.prochaine, wait.items), ...sect("Jouées", COLLECTIONS.histoire, played.items))
  };
}

export function mjWorld() {
  const item = (name, sub, ic, to) => to
    ? link(to, "card", h("div", { class: "row" }, h("div", { class: "thumb" }, icon(ic, 28, "var(--ink)")), h("div", { class: "grow" }, h("h3", null, name), h("div", { class: "muted" }, sub)), icon("next", 22, "var(--muted)")))
    : h("div", { class: "card", style: "opacity:.55" }, h("div", { class: "row" }, h("div", { class: "thumb", style: "background:var(--card)" }, icon(ic, 28, "var(--muted)")), h("div", { class: "grow" }, h("h3", null, name), h("div", { class: "muted" }, "Bientôt"))));
  return {
    title: "Monde", nav: "monde",
    node: h("div", { class: "page with-nav" },
      item("Fiche de l'héroïne", "Cœurs, pouvoirs, objets", "helmet", "/mj/heroine"),
      item("Personnages", "Ceux rencontrés en chemin", "friends", "/mj/c/personnage"),
      item("Bestiaire", "Les créatures et leurs cartons", "monster", "/mj/c/creature"),
      item("Règles complètes", "Le fichier maître du projet", "book", "/mj/f/00_REGLES_PROJET.md"),
      item("Carte du monde", "", "map"), item("Lieux et objets", "", "pin"), item("Compagnons", "", "paw"), item("Photos à classer", "", "image"))
  };
}

/** Affiche n'importe quel fichier Markdown du projet. */
export async function heroineView() {
  const st = await loadHeroState();
  if (!st.file) throw new Error("Fiche de l'héroïne introuvable dans 03_Personnages.");
  return fileView(encodeURIComponent(st.file));
}

/** Dossier du projet introuvable automatiquement : on le choisit en touchant les dossiers (aucune saisie). */
export function folderSetupScreen(onDone) {
  const box = h("div", { class: "page", style: "padding-top:40px" });
  const show = async path => {
    box.replaceChildren(h("h2", null, "Choisis le dossier du projet"), spinner("…"));
    let names = [], isProject = false, err = null;
    try { [names, isProject] = await Promise.all([listFolders(path), isProjectFolder(path)]); } catch (e) { err = e; }
    const up = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    box.replaceChildren(
      h("h2", null, "Choisis le dossier du projet"),
      h("div", { class: "muted" }, "Touche les dossiers jusqu'à celui du jeu (il contient le fichier 00_REGLES_PROJET.md). Une seule fois sur ce téléphone."),
      h("div", { class: "kicker" }, path || "OneDrive"),
      isProject ? h("button", { class: "btn primary block", onclick: () => { setFolderPath(path); onDone(); } }, "C'est ce dossier") : null,
      path ? h("button", { class: "btn block", onclick: () => show(up) }, icon("back", 22), "Dossier au-dessus") : null,
      err ? h("div", { class: "ko" }, "Impossible de lire ce dossier.") : null,
      h("div", { class: "list" }, names.map(n => h("button", { class: "card", onclick: () => show(path ? path + "/" + n : n) },
        h("div", { class: "row" }, icon("pin", 22, "var(--ink)"), h("div", { class: "grow" }, h("h3", null, n)), icon("next", 22, "var(--muted)"))))));
  };
  show("");
  return { node: box };
}

export async function fileView(rel) {
  rel = decodeURIComponent(rel);
  const r = await readText(rel);
  if (r.text == null) throw new Error("Fichier introuvable : " + rel);
  const d = parseDoc(r.text);
  return {
    title: d.title || rel.split("/").pop(), back: "/mj/monde", nav: "monde",
    node: h("div", { class: "page with-nav" }, staleBanner(r.stale), h("div", { class: "card md", html: renderMd(d.body) }))
  };
}

const NOTES = "06_Notes_MJ/Inbox_Idees.md";
export async function mjNotes() {
  const cur = await readText(NOTES);
  const shown = h("div", { class: "card md" });
  const showText = t => { shown.innerHTML = t ? renderMd(t, { dropTitle: false }) : "<p class='muted'>Aucune note pour l'instant.</p>"; };
  showText(cur.text);
  let current = cur;
  const field = h("textarea", { class: "field", placeholder: "Une idée, une phrase de la joueuse, un rappel… (le micro du clavier fonctionne ici)", "aria-label": "Nouvelle note" });
  const msg = h("div", { class: "muted" });
  const btn = h("button", { class: "btn primary block" }, "Enregistrer dans OneDrive");
  btn.addEventListener("click", async () => {
    const note = field.value.trim(); if (!note) return;
    msg.className = "muted"; msg.textContent = "Enregistrement…"; btn.disabled = true;
    try {
      const fresh = await readText(NOTES);                      // on relit juste avant d'écrire
      if (fresh.stale) throw new Error("Pas de réseau : rien n'a été enregistré.");
      const d = new Date(), p = n => String(n).padStart(2, "0");
      const when = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
      const base = (fresh.text || "# Idées en vrac").trimEnd();
      const next = `${base}\n\n## ${when}\n${note}\n`;
      await writeText(NOTES, next);
      field.value = ""; showText(next);
      msg.className = "ok"; msg.textContent = "Note enregistrée.";
    } catch (e) { msg.className = "ko"; msg.textContent = e.message || "Échec de l'enregistrement."; }
    btn.disabled = false;
  });
  return {
    title: "Notes", nav: "notes",
    node: h("div", { class: "page with-nav" }, staleBanner(cur.stale), field, btn, msg, h("div", { class: "kicker" }, "Notes déjà enregistrées"), shown)
  };
}
