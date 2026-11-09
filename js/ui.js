// Petites briques d'interface partagées (le « kit » côté code).
import { ICONS } from "./icons.js";
import { inkOn } from "./colors.js";

const SVGNS = "http://www.w3.org/2000/svg";

/** Crée un élément. h("div", {class:"x", onclick:fn}, "texte", autreNoeud) */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

/** Icône SVG du kit. */
export function icon(name, size = 24, color = "var(--ink)", sw = 2, fill = "none") {
  const wrap = document.createElement("span");
  wrap.style.display = "inline-flex";
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return wrap.firstChild;
}

/**
 * Cœurs en lignes : au plus `per` par ligne, et chaque cœur est réduit pour que la ligne tienne dans `maxW` pixels.
 * Beaucoup de cœurs (ou un téléphone étroit) ne cassent donc jamais la mise en page.
 */
export function hearts(n, size = 26, maxW = 9999) {
  const per = Math.max(1, Math.min(n, n <= 10 ? 5 : n <= 20 ? 7 : 9));
  const gap = 4;
  const s = Math.max(12, Math.min(size, Math.floor(maxW / per) - gap));
  const box = h("div", { class: "hearts", role: "img", "aria-label": `${n} cœurs`, style: `flex-direction:column;align-items:center;gap:${gap}px;max-width:100%` });
  for (let i = 0; i < n; i += per) {
    const row = h("div", { class: "hearts", style: `gap:${gap}px` });
    for (let k = i; k < Math.min(n, i + per); k++) row.append(icon("heart", s, "var(--ink)", 1.6, "var(--red)"));
    box.append(row);
  }
  return box;
}

/** Disque coloré avec une icône blanche (tuiles de l'accueil). */
export function disc(name, color, size = 60) {
  const d = h("div", { class: "disc", style: `background:${color};width:${size}px;height:${size}px` });
  d.append(icon(name, size * 0.5, "#fff", 2.2));
  return d;
}

export function spinner(text = "Chargement…") {
  return h("div", { class: "page center", style: "padding-top:80px" },
    h("div", { class: "spin" }, icon("moon", 36, "var(--muted)")),
    h("div", { class: "muted" }, text));
}

export function errorBox(e, retry) {
  return h("div", { class: "card" },
    h("h3", null, "Oups, ça ne marche pas"),
    h("div", { class: "muted" }, String(e && e.message || e)),
    retry && h("button", { class: "btn", onclick: retry }, "Réessayer"));
}

/**
 * Appui long avec anneau qui se remplit (jeux vidéo). `ring` = élément <circle>.
 * Renvoie rien ; appelle onDone() après `ms` millisecondes de pression continue.
 */
export function longPress(target, ring, ms, onDone) {
  const L = 2 * Math.PI * 22; // rayon 22 → circonférence
  ring.setAttribute("stroke-dasharray", String(L));
  ring.setAttribute("stroke-dashoffset", String(L));
  let t0 = 0, raf = 0, done = false;
  const reset = () => { cancelAnimationFrame(raf); t0 = 0; ring.setAttribute("stroke-dashoffset", String(L)); };
  const frame = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    ring.setAttribute("stroke-dashoffset", String(L * (1 - k)));
    if (k >= 1) { done = true; if (navigator.vibrate) navigator.vibrate(60); onDone(); return; }
    raf = requestAnimationFrame(frame);
  };
  target.addEventListener("pointerdown", e => { e.preventDefault(); done = false; t0 = performance.now(); raf = requestAnimationFrame(frame); });
  for (const n of ["pointerup", "pointercancel", "pointerleave"]) target.addEventListener(n, () => { if (!done) reset(); });
  target.addEventListener("contextmenu", e => e.preventDefault());
}

/** Anneau SVG (cercle + progression) + icône au centre. */
export function ringBadge(iconName) {
  const wrap = h("div", { class: "ringwrap" });
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 52 52"); svg.setAttribute("class", "ring");
  const bg = document.createElementNS(SVGNS, "circle");
  for (const [k, v] of Object.entries({ cx: 26, cy: 26, r: 22, fill: "none", stroke: "#E6D3B3", "stroke-width": 6 })) bg.setAttribute(k, v);
  const ring = document.createElementNS(SVGNS, "circle");
  for (const [k, v] of Object.entries({ cx: 26, cy: 26, r: 22, fill: "none", stroke: "var(--teal)", "stroke-width": 6, "stroke-linecap": "round", transform: "rotate(-90 26 26)" })) ring.setAttribute(k, v);
  svg.append(bg, ring);
  wrap.append(svg, h("div", { class: "lockic" }, icon(iconName, 22, "var(--muted)")));
  return { wrap, ring };
}

/* Voix : on cherche une voix française FÉMININE (l'héroïne est une fille). Les téléphones ne donnent pas le genre d'une voix,
   donc on la reconnaît à son prénom ; les voix masculines connues sont écartées. */
const FEMININES = /am[ée]lie|audrey|aur[ée]lie|marie|julie|hortense|denise|eloise|éloïse|brigitte|vivienne|louise|chantal|claire|florence|female|femme/i;
const MASCULINES = /thomas|daniel|nicolas|jacques|paul|claude|henri|remy|rémy|antoine|guillaume|male\b|homme/i;
function voixFeminine() {
  const fr = speechSynthesis.getVoices().filter(x => x.lang && /^fr/i.test(x.lang.replace("_", "-")));
  const score = v => (FEMININES.test(v.name) ? 4 : 0) - (MASCULINES.test(v.name) ? 4 : 0)
    + (/^fr[-_]fr/i.test(v.lang) ? 1 : 0) + (/enhanced|premium|natural|online/i.test(v.name) ? 1 : 0);
  return fr.sort((a, b) => score(b) - score(a))[0] || null;
}
if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", () => voixFeminine());

/** Lecture à voix haute avec la voix du téléphone (français, voix féminine si le téléphone en a une). */
export function speak(text) {
  if (!("speechSynthesis" in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  const v = voixFeminine();
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.95;
  u.pitch = v && FEMININES.test(v.name) ? 1 : 1.15;   // voix de genre inconnu : un peu plus aiguë
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}

/** Case d'inventaire (à la Minecraft) : fond de la couleur de l'objet, icône par-dessus. */
export function objSlot(o, size = 48) {
  const s = h("div", { class: "slot", style: `width:${size}px;height:${size}px;background:${o.couleur}${o.rim ? `;box-shadow:inset 0 0 0 ${Math.max(3, Math.round(size / 12))}px ${o.rim}` : ""}`, role: "img", "aria-label": o.nom, title: o.nom });
  s.append(icon(o.icone, size * 0.56, inkOn(o.couleur), 2.4));
  return s;
}

/** Case vide en pointillés (place réservée, par exemple pour un compagnon). */
export function emptySlot(iconName = "paw", size = 48) {
  const s = h("div", { class: "slot empty", style: `width:${size}px;height:${size}px`, "aria-hidden": "true" });
  s.append(icon(iconName, size * 0.5, "var(--dash)", 2));
  return s;
}
