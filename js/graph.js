// Accès au dossier du projet sur OneDrive (Microsoft Graph), avec copie locale pour le hors-ligne.
import { getToken } from "./auth.js";

const G = "https://graph.microsoft.com/v1.0";
const enc = p => p.split("/").map(encodeURIComponent).join("/");

/* ---- dossier du projet : jamais écrit dans le code (le dépôt est public) ; trouvé à la première ouverture puis gardé sur le téléphone ---- */
const FOLDER_KEY = "pf:folder";
const MARKER = "00_REGLES_PROJET.md";            // fichier maître présent à la racine du dossier du projet
const folderCfg = () => { try { return JSON.parse(localStorage.getItem(FOLDER_KEY)); } catch { return null; } };
export const hasFolder = () => !!folderCfg();
export const forgetFolder = () => { localStorage.removeItem(FOLDER_KEY); clearLocalCopies(); };
export function setFolderRemote(driveId, itemId) { clearLocalCopies(); localStorage.setItem(FOLDER_KEY, JSON.stringify({ driveId, itemId })); }
export function setFolderPath(path) { clearLocalCopies(); localStorage.setItem(FOLDER_KEY, JSON.stringify({ path: path.trim().replace(/^\/+|\/+$/g, "") })); }

/* Le dossier du journal porte le prénom de l'enfant : le code ne connaît que « 05_Journal », le vrai nom est retrouvé dans la racine du projet. */
const ALIAS_KEY = "pf1:alias";
let ALIAS = (() => { try { return JSON.parse(localStorage.getItem(ALIAS_KEY)) || {}; } catch { return {}; } })();
const applyAlias = rel => { const i = rel.indexOf("/"); const head = i < 0 ? rel : rel.slice(0, i); return ALIAS[head] ? ALIAS[head] + (i < 0 ? "" : rel.slice(i)) : rel; };
let aliasP = null;
export async function resolveAliases() {
  const known = localStorage.getItem(ALIAS_KEY) != null;          // déjà trouvé une fois : l'écran n'attend pas, on vérifie en arrière-plan (une fois par lancement)
  if (!aliasP) aliasP = (async () => {
    try {
      perf.req++; perf.list++;
      const r = await req(itemUrl("") + "/children?$select=name,folder&$top=200");
      const j = await r.json();
      const jr = (j.value || []).find(x => x.folder && /^05_Journal/i.test(x.name));
      const next = jr && jr.name !== "05_Journal" ? { "05_Journal": jr.name } : {};
      const changed = JSON.stringify(next) !== JSON.stringify(ALIAS);
      ALIAS = next;
      localStorage.setItem(ALIAS_KEY, JSON.stringify(ALIAS));
      if (changed && known) onBackground({ changed: true });
    } catch { /* hors ligne : on garde le dernier alias connu */ }
  })();
  if (!known) await aliasP;
}

/** Adresse Graph d'un élément du dossier projet. rel = chemin relatif ("04_Bestiaire/Squelette.md"), "" = la racine. */
function itemUrl(rel) {
  rel = applyAlias(rel);
  const f = folderCfg();
  if (!f) { const e = new Error("Dossier du projet non configuré"); e.noFolder = true; throw e; }
  if (f.driveId) {
    const base = `${G}/drives/${f.driveId}/items/${f.itemId}`;
    return rel ? `${base}:/${enc(rel)}:` : base;
  }
  return `${G}/me/drive/root:/${enc(rel ? f.path + "/" + rel : f.path)}:`;
}

/* ---- retrouver le dossier tout seul : on parcourt des emplacements neutres et on cherche le fichier maître ---- */
const SCAN_ROOTS = ["Documents/JDR", "Documents", ""];
const pathUrl = p => p ? `${G}/me/drive/root:/${enc(p)}:` : `${G}/me/drive/root`;

/* ---- parcours des dossiers (sélecteur) ----
   Un « nœud » est l'un de :  { path }  dossier de Mes fichiers ("" = racine)
                              { driveId, itemId }  dossier d'un autre OneDrive (dossier partagé, ou raccourci vers un dossier partagé)
                              { shared:true }  la liste « Partagés avec moi » */
const nodeOfChild = (x, parentPath) => {
  if (x.remoteItem) {                                   // raccourci OneDrive ou dossier partagé : le contenu est dans un autre OneDrive
    const ri = x.remoteItem;
    const driveId = ri.parentReference && ri.parentReference.driveId;
    if (!ri.folder || !driveId || !ri.id) return null;
    return { name: x.name, driveId, itemId: ri.id };
  }
  if (!x.folder) return null;
  return { name: x.name, path: parentPath == null ? undefined : (parentPath ? parentPath + "/" + x.name : x.name) };
};
const byName = (a, b) => a.name.localeCompare(b.name, "fr");

/** Sous-dossiers d'un nœud. → [{ name, path } | { name, driveId, itemId }] triés. */
export async function listFolderNodes(node) {
  let url;
  if (node.shared) {
    const r = await req(`${G}/me/drive/sharedWithMe?$top=200`);
    const j = await r.json();
    return (j.value || []).map(x => nodeOfChild({ name: x.name || (x.remoteItem && x.remoteItem.name), remoteItem: x.remoteItem }, null)).filter(Boolean).sort(byName);
  }
  if (node.driveId) url = `${G}/drives/${node.driveId}/items/${node.itemId}/children?$select=name,folder,remoteItem&$top=200`;
  else url = pathUrl(node.path || "") + "/children?$select=name,folder,remoteItem&$top=200";
  const r = await req(url);
  const j = await r.json();
  return (j.value || []).map(x => nodeOfChild(x, node.driveId ? null : (node.path || ""))).filter(Boolean).sort(byName);
}

/** Sous-dossiers d'un dossier de Mes fichiers (compatibilité). */
export async function listFolders(path) { return (await listFolderNodes({ path })).map(x => x.name); }

/** Ce dossier contient-il le fichier maître du projet ? (nœud { path } ou { driveId, itemId }) */
export async function isProjectFolder(node) {
  if (typeof node === "string") node = { path: node };
  const url = node.driveId
    ? `${G}/drives/${node.driveId}/items/${node.itemId}:/${enc(MARKER)}:?$select=id`
    : `${G}/me/drive/root:/${enc((node.path ? node.path + "/" : "") + MARKER)}:?$select=id`;
  try { await req(url); return true; }
  catch (e) { if (e.status === 404) return false; throw e; }
}

/** Retrouve un dossier à partir d'un lien de partage OneDrive collé par l'utilisateur. → { driveId, itemId } ou lève une erreur lisible. */
export async function resolveShareLink(link) {
  link = (link || "").trim();
  if (!/^https?:\/\//i.test(link)) throw new Error("Ce n'est pas un lien.");
  const b64 = btoa(unescape(encodeURIComponent(link))).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  const r = await req(`${G}/shares/u!${b64}/driveItem?$select=id,name,folder,parentReference,remoteItem`);
  const j = await r.json();
  const ri = j.remoteItem || j;
  const driveId = (ri.parentReference && ri.parentReference.driveId) || (j.parentReference && j.parentReference.driveId);
  const itemId = ri.id || j.id;
  if (!driveId || !itemId) throw new Error("Lien non reconnu.");
  if (!(ri.folder || j.folder)) throw new Error("Ce lien ne mène pas à un dossier.");
  return { driveId, itemId };
}

/** Cherche le dossier du projet dans OneDrive. → true si trouvé (et mémorisé). */
/** Comme isProjectFolder, mais un dossier illisible (accès refusé…) compte pour « non » ; seule une déconnexion remonte. */
const safeIsProject = async n => { try { return await isProjectFolder(n); } catch (e) { if (e.status === 401 || e.auth) throw e; return false; } };

export async function discoverFolder() {
  for (const root of SCAN_ROOTS) {
    let nodes;
    try { nodes = await listFolderNodes({ path: root }); } catch (e) { if (e.status === 404) continue; throw e; }
    const hits = await pool(nodes, async n => (await safeIsProject(n)) ? n : null, 6);
    const hit = hits.find(Boolean);
    if (hit) { if (hit.driveId) setFolderRemote(hit.driveId, hit.itemId); else setFolderPath(hit.path); return true; }
  }
  // dossier partagé par quelqu'un d'autre (seulement si cet appareil a l'accès élargi ; sinon Microsoft répond 403 et on passe)
  try {
    const shared = await listFolderNodes({ shared: true });
    const hits = await pool(shared, async n => (await safeIsProject(n)) ? n : null, 4);
    const hit = hits.find(Boolean);
    if (hit) { setFolderRemote(hit.driveId, hit.itemId); return true; }
  } catch (e) { if (e.status === 401) throw e; /* 403, 404… : pas de dossier partagé accessible */ }
  return false;
}

async function req(url, opt = {}) {
  const token = await getToken();
  const r = await fetch(url, { ...opt, headers: { Authorization: "Bearer " + token, ...(opt.headers || {}) } });
  if (!r.ok) { const e = new Error("OneDrive : erreur " + r.status); e.status = r.status; throw e; }
  return r;
}

/* ---- copie locale d'abord, vérification ensuite ----
   Chaque dossier lu est gardé sur le téléphone (liste + textes). Un écran s'ouvre tout de suite avec cette copie ; en arrière-plan
   UNE requête compare la « signature » (eTag, taille, date) de chaque fichier et ne retélécharge que ceux qui ont changé.
   Si quelque chose a changé, l'écran se redessine tout seul (main.js, jamais pendant une saisie).
   Avant d'écrire, on relit toujours en direct : readText(rel, { fresh: true }) (règle R22). */
const P = "pf1:";
const cacheGet = k => { try { const v = localStorage.getItem(P + k); return v == null ? null : JSON.parse(v); } catch { return null; } };
const cacheSet = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* plein : tant pis */ } };
const cacheDel = k => { try { localStorage.removeItem(P + k); } catch { /* ok */ } };
const isOffline = e => !e.status; // pas de code HTTP = réseau coupé

/** Efface toutes les copies locales (autre dossier, autre compte, accès retiré). */
export function clearLocalCopies() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(P + "ls:") || k.startsWith(P + "tx:") || k.startsWith(P + "sg:")) localStorage.removeItem(k);
  } catch { /* ok */ }
  IMG_MEM.clear(); refreshedAt.clear(); dirty.clear();
  try { if ("caches" in self) caches.delete("pf-img"); } catch { /* ok */ }
  imgCache = null;
}

/* Dernière raison pour laquelle l'application a dû se rabattre sur la copie du téléphone (affichée dans le bandeau « Hors connexion »). */
let lastIssue = null;
export const getLastIssue = () => lastIssue;
const noteIssue = e => {
  lastIssue = e.status ? "OneDrive a répondu « erreur " + e.status + " »"
    : e.detail ? "la connexion Microsoft n'a pas pu être renouvelée (" + e.detail + ")"
    : "le téléphone n'a pas pu joindre OneDrive (" + (e.message || "réseau") + ")";
};

/* ---- mesure (?perf=1) : nombre de requêtes et durée par écran ---- */
export const perf = { on: false, req: 0, list: 0, content: 0, bg: 0 };
try { perf.on = /[?&]perf=1/.test(location.search + location.hash); } catch { /* ok */ }

const sigOf = x => `${x.eTag || ""}|${x.size || 0}|${x.lastModifiedDateTime || ""}`;
const dirOf = rel => rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
const baseOf = rel => rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel;
const joinRel = (dir, name) => dir ? dir + "/" + name : name;
const isMd = n => /\.md$/i.test(n);
const isImg = n => /\.(jpe?g|png|webp|heic)$/i.test(n);

const REFRESH_EVERY = 45000;        // une même liste n'est pas revérifiée plus d'une fois par 45 s (changer d'onglet = 0 requête)
const refreshedAt = new Map();      // dossier -> dernière vérification réussie ce lancement
const dirty = new Set();            // dossiers que NOUS venons de modifier : la prochaine liste est lue en direct
const running = new Map();          // dossier -> vérification en cours
const downloads = new Map();        // fichier -> téléchargement en cours (évite les doublons)
perf.state = () => ({ refreshed: [...refreshedAt].map(([k, v]) => k + "@" + Math.round((Date.now() - v) / 1000) + "s"), running: [...running.keys()], dirty: [...dirty] });
let onBackground = () => {};
/** main.js s'abonne : info = { changed } | { offline } | { auth } | { revoked } */
export const setBackgroundHandler = fn => { onBackground = fn; };

/** Signature réseau d'un fichier, d'après la dernière liste connue de son dossier. */
const knownSig = (dir, name) => { const ls = cacheGet("ls:" + dir); const x = ls && ls.find(y => y.name === name); return x && x.sig !== undefined ? x.sig : undefined; };

async function fetchListing(rel) {
  let url = itemUrl(rel) + "/children?$select=name,size,folder,eTag,lastModifiedDateTime&$top=200";
  const out = [];
  for (let n = 0; url && n < 10; n++) {
    perf.req++; perf.list++;
    const r = await req(url);
    const j = await r.json();
    for (const x of j.value || []) out.push({ name: x.name, dir: !!x.folder, size: x.size || 0, sig: sigOf(x) });
    url = j["@odata.nextLink"] || null;
  }
  return out;
}

/** Télécharge un fichier texte et le garde, avec sa signature. → { text, diff } */
function download(rel) {
  if (downloads.has(rel)) return downloads.get(rel);
  const p = (async () => {
    const sig = knownSig(dirOf(rel), baseOf(rel));                   // plus ancienne ou égale à la version reçue : sans danger
    perf.req++; perf.content++;
    const r = await req(itemUrl(rel) + "/content");
    const text = await r.text();
    const prev = cacheGet("tx:" + rel);
    cacheSet("tx:" + rel, text); cacheSet("sg:" + rel, sig === undefined ? null : sig);
    return { text, diff: prev !== text };
  })().finally(() => downloads.delete(rel));
  downloads.set(rel, p);
  return p;
}

/** Range la liste reçue du réseau : efface les copies orphelines, retélécharge ce qui a changé. → true si quelque chose a changé. */
async function reconcile(dir, old, data) {
  const oldMap = new Map((old || []).map(x => [x.name, x]));
  const names = new Set(data.map(x => x.name));
  cacheSet("ls:" + dir, data); refreshedAt.set(dir, Date.now()); dirty.delete(dir);
  let changed = false;
  for (const o of old || []) if (!names.has(o.name)) { cacheDel("tx:" + joinRel(dir, o.name)); cacheDel("sg:" + joinRel(dir, o.name)); forgetImg(joinRel(dir, o.name)); changed = true; }
  if (old && data.some(x => !oldMap.has(x.name))) changed = true;
  for (const x of data) {                                           // images modifiées : on oublie la copie
    const o = oldMap.get(x.name);
    if (!x.dir && isImg(x.name) && o && o.sig !== undefined && o.sig !== x.sig) { forgetImg(joinRel(dir, x.name)); changed = true; }
  }
  const todo = data.filter(x => !x.dir && isMd(x.name) && cacheGet("tx:" + joinRel(dir, x.name)) != null && cacheGet("sg:" + joinRel(dir, x.name)) !== x.sig);
  await pool(todo, async x => { try { const r = await download(joinRel(dir, x.name)); if (r.diff) changed = true; } catch { /* on retentera */ } }, 4);
  return changed;
}

/** Vérifie un dossier en arrière-plan (au plus une fois par 45 s). */
function refreshSoon(dir) {
  if (running.has(dir)) return;
  const t = refreshedAt.get(dir);
  if (t && Date.now() - t < REFRESH_EVERY) return;
  const p = (async () => {
    perf.bg++;
    const old = cacheGet("ls:" + dir);
    let data;
    try { data = await fetchListing(dir); }
    catch (e) {
      console.debug("Vérification en arrière-plan", dir, e && (e.status || e.message));
      if (e.status === 403) { clearLocalCopies(); onBackground({ revoked: true }); return; }          // accès retiré : on efface tout
      if (e.status === 404) { if (dir === "") { clearLocalCopies(); onBackground({ revoked: true }); return; } cacheDel("ls:" + dir); refreshedAt.set(dir, Date.now()); if (old && old.length) onBackground({ changed: true }); return; }
      if (e.status === 401 || e.auth) { onBackground({ auth: true }); return; }
      noteIssue(e); onBackground({ offline: true }); return;
    }
    onBackground({ online: true });
    if (await reconcile(dir, old, data)) onBackground({ changed: true });
  })().catch(e => console.debug("Vérification en arrière-plan : erreur", dir, e && e.message)).finally(() => running.delete(dir));
  running.set(dir, p);
}

/** Liste d'un dossier. → { data:[{name,dir,size,sig}], stale, missing, cached }
    La copie locale est rendue tout de suite (et vérifiée en arrière-plan) sauf si opt.fresh ou si on vient d'écrire dans ce dossier. */
export async function listDir(rel, opt = {}) {
  const cached = cacheGet("ls:" + rel);
  if (cached && !opt.fresh && !dirty.has(rel)) { refreshSoon(rel); return { data: cached, stale: false, cached: true }; }
  try {
    const data = await fetchListing(rel);
    await reconcile(rel, cached, data);
    return { data, stale: false };
  } catch (e) {
    if (e.status === 404) { cacheDel("ls:" + rel); return { data: [], stale: false, missing: true }; }
    if (cached && (isOffline(e) || e.status >= 500)) { noteIssue(e); return { data: cached, stale: true }; }
    throw e;
  }
}

/** Lit un fichier texte. → { text, stale, cached } (text = null si le fichier n'existe pas)
    Copie locale d'abord ; opt.fresh = lecture en direct (obligatoire juste avant d'écrire, R22). */
export async function readText(rel, opt = {}) {
  const key = "tx:" + rel, dir = dirOf(rel);
  const have = opt.fresh ? null : cacheGet(key);
  if (have != null) {
    const known = refreshedAt.has(dir) ? knownSig(dir, baseOf(rel)) : undefined;      // signature lue sur le réseau CE lancement
    if (known === undefined || known === cacheGet("sg:" + rel)) {                      // aucune preuve que le fichier a changé
      if (known === undefined) refreshSoon(dir);
      return { text: have, stale: false, cached: true };
    }
  }
  try {
    const r = await download(rel);
    return { text: r.text, stale: false };
  } catch (e) {
    if (e.status === 404) { cacheDel(key); cacheDel("sg:" + rel); return { text: null, stale: false }; }
    const c = cacheGet(key);
    if (c != null && (isOffline(e) || e.status >= 500)) { noteIssue(e); return { text: c, stale: true }; }
    throw e;
  }
}

export async function writeText(rel, text) {
  const r = await req(itemUrl(rel) + "/content", { method: "PUT", headers: { "Content-Type": "text/markdown" }, body: text });
  let sig = null; try { const j = await r.json(); if (j && j.eTag) sig = sigOf(j); } catch { /* pas de réponse lisible */ }
  cacheSet("tx:" + rel, text); cacheSet("sg:" + rel, sig);
  dirty.add(dirOf(rel)); refreshedAt.delete(dirOf(rel));
}

export async function uploadBlob(rel, blob, type) {
  await req(itemUrl(rel) + "/content", { method: "PUT", headers: { "Content-Type": type }, body: blob });
  forgetImg(rel); dirty.add(dirOf(rel)); refreshedAt.delete(dirOf(rel));
}

/** Supprime un fichier (il va dans la corbeille OneDrive, récupérable 93 jours). Déjà absent = réussi. */
export async function deleteFile(rel) {
  try { await req(itemUrl(rel), { method: "DELETE" }); }
  catch (e) { if (e.status !== 404) throw e; }
  const dir = dirOf(rel);
  cacheDel("ls:" + dir); cacheDel("tx:" + rel); cacheDel("sg:" + rel); forgetImg(rel);
  dirty.add(dir); refreshedAt.delete(dir);
}

/* ---- images : gardées sur l'appareil (Cache Storage), oubliées si le fichier change ---- */
const IMG_MEM = new Map();
let imgCache = null;
const imgs = () => imgCache || (imgCache = ("caches" in self ? caches.open("pf-img") : Promise.resolve(null)).catch(() => null));
const imgKey = rel => new Request("https://pf.invalid/" + encodeURI(rel));
function forgetImg(rel) { IMG_MEM.delete(rel); imgs().then(c => c && c.delete(imgKey(rel))).catch(() => {}); }

export async function fetchBlob(rel) {
  if (IMG_MEM.has(rel)) { refreshSoon(dirOf(rel)); return IMG_MEM.get(rel); }
  const c = await imgs();
  if (c) { try { const hit = await c.match(imgKey(rel)); if (hit) { const b = await hit.blob(); IMG_MEM.set(rel, b); refreshSoon(dirOf(rel)); return b; } } catch { /* ok */ } }
  perf.req++; perf.content++;
  const r = await req(itemUrl(rel) + "/content");
  const b = await r.blob();
  IMG_MEM.set(rel, b);
  if (c) { try { await c.put(imgKey(rel), new Response(b)); } catch { /* ok */ } }
  return b;
}

/** Exécute fn sur chaque élément, `n` à la fois. */
export async function pool(items, fn, n = 4) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
