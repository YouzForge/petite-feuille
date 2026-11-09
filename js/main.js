// Routeur et coque de l'application.
import { initAuth, isSignedIn, isAllowed, autoLogin } from "./auth.js";
import { hasFolder, discoverFolder, resolveAliases, setBackgroundHandler, perf, listDir, readText } from "./graph.js";
import { COLLECTIONS, loadCollection } from "./collections.js";
import { staleBanner } from "./banner.js";
import { h, icon, spinner, errorBox } from "./ui.js";
import * as S from "./screens.js";
import { jouerScreen } from "./jouer.js";
import { recapScreen } from "./recap.js";
import * as P from "./pages.js";
import { formScreen } from "./forms.js";

const root = document.getElementById("app");
const dec = decodeURIComponent;

const NAV = [
  { id: "ce-soir", label: "Ce soir", icon: "moon", to: "/mj/ce-soir" },
  { id: "histoires", label: "Histoires", icon: "book", to: "/mj/histoires" },
  { id: "monde", label: "Monde", icon: "map", to: "/mj/monde" },
  { id: "notes", label: "Notes", icon: "note", to: "/mj/notes" }
];

/** [motif, fonction(...captures)] — mode = "child" | "mj" */
const ROUTES = [
  [/^\/$/, () => S.childHome(), "child"],
  [/^\/child\/bientot\/(.+)$/, n => S.soon(dec(n)), "child"],
  [/^\/child\/outils$/, () => S.tools(), "child"],
  [/^\/child\/bourse$/, () => P.bourseScreen(), "child"],
  [/^\/child\/journal$/, () => P.journalScreen(), "child"],
  [/^\/child\/carte$/, () => P.mapScreen("child"), "child"],
  [/^\/child\/c\/objet$/, () => P.childObjets(), "child"],
  [/^\/child\/c\/lieu$/, () => P.childLieux(), "child"],
  [/^\/child\/c\/compagnon$/, () => P.childCompagnons(), "child"],
  [/^\/child\/c\/([a-z]+)$/, c => S.collectionList(c, "child"), "child"],
  [/^\/child\/c\/([a-z]+)\/(.+)$/, (c, f) => S.collectionFiche(c, f, "child"), "child"],
  [/^\/mj\/ce-soir$/, () => S.mjTonight(), "mj"],
  [/^\/mj\/histoires$/, () => S.mjStories(), "mj"],
  [/^\/mj\/monde$/, () => P.mjWorldScreen(), "mj"],
  [/^\/mj\/lieux$/, () => P.lieuxObjets("lieux"), "mj"],
  [/^\/mj\/objets$/, () => P.lieuxObjets("objets"), "mj"],
  [/^\/mj\/carte$/, () => P.mapScreen("mj"), "mj"],
  [/^\/mj\/photos$/, () => P.photosScreen(), "mj"],
  [/^\/mj\/c\/compagnon$/, () => P.mjCompagnons(), "mj"],
  [/^\/mj\/nouveau\/([a-z]+)$/, c => formScreen(c, null), "mj"],
  [/^\/mj\/modifier\/([a-z]+)\/(.+)$/, (c, f) => formScreen(c, dec(f)), "mj"],
  [/^\/mj\/notes$/, () => S.mjNotes(), "mj"],
  [/^\/mj\/c\/(lieu|objet)$/, c => P.lieuxObjets(c === "lieu" ? "lieux" : "objets"), "mj"],
  [/^\/mj\/c\/([a-z]+)$/, c => S.collectionList(c, "mj"), "mj"],
  [/^\/mj\/c\/([a-z]+)\/(.+)$/, (c, f) => S.collectionFiche(c, f, "mj"), "mj"],
  [/^\/mj\/jouer\/(.+)$/, f => jouerScreen(f), "mj"],
  [/^\/mj\/recap$/, () => recapScreen(), "mj"],
  [/^\/mj\/heroine$/, () => S.heroineView(), "mj"],
  [/^\/mj\/f\/(.+)$/, p => S.fileView(p), "mj"]
];

function chrome(screen, mode) {
  const frag = document.createDocumentFragment();
  if (screen.bare) { frag.append(screen.node); return frag; }
  if (screen.title || screen.back) {
    const bar = h("div", { class: "topbar" });
    if (screen.back) bar.append(h("a", { class: "iconbtn", href: "#" + screen.back, "aria-label": "Retour" }, icon("back", 24)));
    bar.append(h("h1", null, screen.title || ""));
    if (screen.action) bar.append(screen.action);
    if (mode === "mj") bar.append(h("button", { class: "iconbtn", "aria-label": "Retour au mode enfant", onclick: () => { sessionStorage.removeItem("pf_mj"); location.hash = "#/"; } }, icon("user", 24)));
    frag.append(bar);
  } else if (mode === "mj") {
    const bar = h("div", { class: "topbar" }, h("h1", null, ""),
      h("button", { class: "iconbtn", "aria-label": "Retour au mode enfant", onclick: () => { sessionStorage.removeItem("pf_mj"); location.hash = "#/"; } }, icon("user", 24)));
    frag.append(bar);
  }
  frag.append(screen.node);
  if (screen.nav) {
    frag.append(h("nav", { class: "nav", "aria-label": "Mode MJ" }, h("div", { class: "nav-in" },
      NAV.map(n => h("a", { href: "#" + n.to, class: n.id === screen.nav ? "on" : "" }, icon(n.icon, 26, "currentColor"), n.label)))));
  }
  return frag;
}

let token = 0;
let cleanup = null;
let busy = false;                       // une vraie navigation est en cours : le redessin automatique attend

/** Peut-on redessiner l'écran tout seul ? Seulement les écrans de lecture, jamais pendant une saisie ou une fenêtre ouverte. */
const SOFT_OK = /^\/($|child\/(journal|bourse|c\/)|mj\/(ce-soir|histoires|monde|lieux|objets|c\/|heroine|f\/))/;
function canRedraw() {
  const path = location.hash.replace(/^#/, "") || "/";
  if (!SOFT_OK.test(path) || !isSignedIn()) return false;
  if (document.querySelector(".sheet-back, .ask-overlay")) return false;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
  if ([...root.querySelectorAll("input, textarea")].some(e => e.value)) return false;
  return true;
}

/* Une fois le premier écran affiché, on prépare les autres onglets pendant que l'utilisateur lit (une seule fois par lancement). */
let prefetched = false;
function prefetch() {
  if (prefetched || !hasFolder()) return;
  prefetched = true;
  setTimeout(async () => {
    const quiet = p => p.catch(() => {});
    for (const col of Object.values(COLLECTIONS)) await quiet(loadCollection(col));
    await quiet((async () => { const ls = await listDir("05_Journal"); const jf = ls.data.find(f => !f.dir && /^Journal_de_.*\.md$/i.test(f.name)); if (jf) await readText("05_Journal/" + jf.name); })());
    await quiet(readText("06_Notes_MJ/Inbox_Idees.md"));
    await quiet(listDir("08_Photos"));
  }, 1200);
}

/* mesure ?perf=1 : requêtes et durée de chaque écran, en bas à gauche */
let perfBox = null;
function showPerf(label, ms, p0) {
  if (!perf.on) return;
  if (!perfBox) { perfBox = h("div", { style: "position:fixed;left:6px;bottom:6px;z-index:99;background:#000c;color:#fff;font:12px monospace;padding:4px 8px;border-radius:8px;pointer-events:none;max-width:90vw" }); document.body.append(perfBox); }
  perfBox.textContent = `${label} : ${Math.round(ms)} ms · ${perf.req - p0.req} req (${perf.list - p0.list} listes, ${perf.content - p0.content} contenus) · fond ${perf.bg - p0.bg}`;
}

async function render(soft = false) {
  if (soft && (busy || !canRedraw())) return;
  const mine = soft ? token : ++token;
  if (!soft) busy = true;
  const t0 = performance.now(), p0 = { ...perf };
  let path = location.hash.replace(/^#/, "") || "/";
  if (/^(code|state|error)=/.test(path)) path = "/";           // retour de connexion Microsoft
  try {
    if (!isSignedIn()) { if (autoLogin()) { root.replaceChildren(spinner("Connexion…")); return; } root.replaceChildren(chrome(S.loginScreen(), "child")); return; }

    if (!(await isAllowed())) { if (mine === token) root.replaceChildren(chrome(await S.deniedScreen(), "child")); return; }

    if (!hasFolder()) {                                           // première ouverture sur ce téléphone : on retrouve le dossier du projet
      root.replaceChildren(spinner("Recherche du dossier du projet…"));
      let found = false;
      try { found = await discoverFolder(); } catch (e) { if (e.auth || e.status === 401) { if (autoLogin()) { root.replaceChildren(spinner("Connexion…")); return; } root.replaceChildren(chrome(S.reconnectScreen(), "child")); return; } }
      if (!found) { root.replaceChildren(chrome(S.folderSetupScreen(() => render()), "child")); return; }
    }

    await resolveAliases();
    let match = null;
    for (const [re, fn, mode] of ROUTES) { const m = path.match(re); if (m) { match = { fn, mode, args: m.slice(1) }; break; } }
    if (!match) { location.hash = "#/"; return; }
    if (match.mode === "mj" && sessionStorage.pf_mj !== "1") { location.hash = "#/"; return; }

    if (!soft) {
      if (cleanup) { try { cleanup(); } catch { /* ok */ } cleanup = null; }
      root.replaceChildren(spinner());
      window.scrollTo(0, 0);
    }
    try {
      const screen = await match.fn(...match.args);
      if (mine !== token) return;                                // on est déjà ailleurs
      if (soft) {
        if (!canRedraw()) return;                                // l'utilisateur a commencé à écrire entre-temps
        const y = window.scrollY;
        if (cleanup) { try { cleanup(); } catch { /* ok */ } }
        cleanup = screen.cleanup || null;
        root.replaceChildren(chrome(screen, match.mode));
        window.scrollTo(0, y);
      } else {
        cleanup = screen.cleanup || null;
        root.replaceChildren(chrome(screen, match.mode));
      }
      showPerf(path, performance.now() - t0, p0);
      offlineBanner();
      prefetch();
    } catch (e) {
      if (mine !== token || soft) return;
      if (e.auth || e.status === 401) { if (autoLogin()) { root.replaceChildren(spinner("Connexion…")); return; } root.replaceChildren(chrome(S.reconnectScreen(), "child")); return; }
      root.replaceChildren(chrome({ title: "Oups", back: match.mode === "mj" ? "/mj/ce-soir" : "/", node: h("div", { class: "page" }, errorBox(e, () => render())) }, match.mode));
    }
  } finally { if (!soft && mine === token) busy = false; }
}

/* Vérifications faites en arrière-plan par graph.js (copie locale d'abord, puis comparaison avec OneDrive) */
let authAsked = false, offlineFlag = false;
function offlineBanner() { if (!offlineFlag || root.querySelector(".banner")) return; const pg = root.querySelector(".page"); if (pg && !pg.classList.contains("center")) pg.prepend(staleBanner(true)); }
function softRedraw(n = 0) { if (!busy && canRedraw()) render(true); else if (n < 4) setTimeout(() => softRedraw(n + 1), 3000); }
setBackgroundHandler(info => {
  if (info.auth) {                                               // la connexion Microsoft a expiré : on le dit dès qu'on peut sans casser une saisie
    if (!authAsked && canRedraw()) { authAsked = true; if (autoLogin()) root.replaceChildren(spinner("Connexion…")); else root.replaceChildren(chrome(S.reconnectScreen(), "child")); }
    return;
  }
  if (info.revoked) { render(); return; }                       // accès retiré : copies effacées, on relit
  if (info.online) { offlineFlag = false; return; }
  if (info.offline) { offlineFlag = true; offlineBanner(); return; }
  if (info.changed) softRedraw();
});

window.addEventListener("hashchange", () => render());
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
initAuth().then(() => render()).catch(e => { root.replaceChildren(h("div", { class: "page" }, errorBox(e, () => location.reload()))); });
