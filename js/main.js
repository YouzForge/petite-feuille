// Routeur et coque de l'application.
import { initAuth, isSignedIn, isAllowed } from "./auth.js";
import { hasFolder, discoverFolder, resolveAliases } from "./graph.js";
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
async function render() {
  const mine = ++token;
  let path = location.hash.replace(/^#/, "") || "/";
  if (/^(code|state|error)=/.test(path)) path = "/";           // retour de connexion Microsoft
  if (!isSignedIn()) { root.replaceChildren(chrome(S.loginScreen(), "child")); return; }

  if (!(await isAllowed())) { if (mine === token) root.replaceChildren(chrome(await S.deniedScreen(), "child")); return; }

  if (!hasFolder()) {                                           // première ouverture sur ce téléphone : on retrouve le dossier du projet
    root.replaceChildren(spinner("Recherche du dossier du projet…"));
    let found = false;
    try { found = await discoverFolder(); } catch (e) { if (e.auth || e.status === 401) { root.replaceChildren(chrome(S.reconnectScreen(), "child")); return; } }
    if (!found) { root.replaceChildren(chrome(S.folderSetupScreen(() => render()), "child")); return; }
  }

  await resolveAliases();
  let match = null;
  for (const [re, fn, mode] of ROUTES) { const m = path.match(re); if (m) { match = { fn, mode, args: m.slice(1) }; break; } }
  if (!match) { location.hash = "#/"; return; }
  if (match.mode === "mj" && sessionStorage.pf_mj !== "1") { location.hash = "#/"; return; }

  if (cleanup) { try { cleanup(); } catch { /* ok */ } cleanup = null; }
  root.replaceChildren(spinner());
  window.scrollTo(0, 0);
  try {
    const screen = await match.fn(...match.args);
    if (mine !== token) return;                                // on est déjà ailleurs
    cleanup = screen.cleanup || null;
    root.replaceChildren(chrome(screen, match.mode));
  } catch (e) {
    if (mine !== token) return;
    if (e.auth || e.status === 401) { root.replaceChildren(chrome(S.reconnectScreen(), "child")); return; }
    root.replaceChildren(chrome({ title: "Oups", back: match.mode === "mj" ? "/mj/ce-soir" : "/", node: h("div", { class: "page" }, errorBox(e, render)) }, match.mode));
  }
}

window.addEventListener("hashchange", render);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
initAuth().then(render).catch(e => { root.replaceChildren(h("div", { class: "page" }, errorBox(e, () => location.reload()))); });
