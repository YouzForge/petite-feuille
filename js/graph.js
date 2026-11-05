// Accès au dossier du projet sur OneDrive (Microsoft Graph), avec copie locale pour le hors-ligne.
import { getToken } from "./auth.js";

const G = "https://graph.microsoft.com/v1.0";
const enc = p => p.split("/").map(encodeURIComponent).join("/");

/* ---- dossier du projet : jamais écrit dans le code (le dépôt est public) ; trouvé à la première ouverture puis gardé sur le téléphone ---- */
const FOLDER_KEY = "pf:folder";
const MARKER = "00_REGLES_PROJET.md";            // fichier maître présent à la racine du dossier du projet
const folderCfg = () => { try { return JSON.parse(localStorage.getItem(FOLDER_KEY)); } catch { return null; } };
export const hasFolder = () => !!folderCfg();
export const forgetFolder = () => localStorage.removeItem(FOLDER_KEY);
export function setFolderRemote(driveId, itemId) { localStorage.setItem(FOLDER_KEY, JSON.stringify({ driveId, itemId })); }
export function setFolderPath(path) { localStorage.setItem(FOLDER_KEY, JSON.stringify({ path: path.trim().replace(/^\/+|\/+$/g, "") })); }

/* Le dossier du journal porte le prénom de l'enfant : le code ne connaît que « 05_Journal », le vrai nom est retrouvé dans la racine du projet. */
const ALIAS_KEY = "pf1:alias";
let ALIAS = (() => { try { return JSON.parse(localStorage.getItem(ALIAS_KEY)) || {}; } catch { return {}; } })();
const applyAlias = rel => { const i = rel.indexOf("/"); const head = i < 0 ? rel : rel.slice(0, i); return ALIAS[head] ? ALIAS[head] + (i < 0 ? "" : rel.slice(i)) : rel; };
export async function resolveAliases() {
  try {
    const r = await req(itemUrl("") + "/children?$select=name,folder&$top=200");
    const j = await r.json();
    const jr = (j.value || []).find(x => x.folder && /^05_Journal/i.test(x.name));
    ALIAS = jr && jr.name !== "05_Journal" ? { "05_Journal": jr.name } : {};
    localStorage.setItem(ALIAS_KEY, JSON.stringify(ALIAS));
  } catch { /* hors ligne : on garde le dernier alias connu */ }
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

/* ---- copie locale (lecture hors connexion) ---- */
const P = "pf1:";
const cacheGet = k => { try { const v = localStorage.getItem(P + k); return v == null ? null : JSON.parse(v); } catch { return null; } };
const cacheSet = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* plein : tant pis */ } };
const isOffline = e => !e.status; // pas de code HTTP = réseau coupé

/** Liste d'un dossier. → { data:[{name,dir,size}], stale, missing } */
export async function listDir(rel) {
  const key = "ls:" + rel;
  try {
    const r = await req(itemUrl(rel) + "/children?$select=name,size,folder&$top=200");
    const j = await r.json();
    const data = j.value.map(x => ({ name: x.name, dir: !!x.folder, size: x.size || 0 }));
    cacheSet(key, data);
    return { data, stale: false };
  } catch (e) {
    if (e.status === 404) return { data: [], stale: false, missing: true };
    const c = cacheGet(key);
    if (c && (isOffline(e) || e.status >= 500)) return { data: c, stale: true };
    throw e;
  }
}

/** Lit un fichier texte. → { text, stale } (text = null si le fichier n'existe pas) */
export async function readText(rel) {
  const key = "tx:" + rel;
  try {
    const r = await req(itemUrl(rel) + "/content");
    const text = await r.text();
    cacheSet(key, text);
    return { text, stale: false };
  } catch (e) {
    if (e.status === 404) return { text: null, stale: false };
    const c = cacheGet(key);
    if (c != null && (isOffline(e) || e.status >= 500)) return { text: c, stale: true };
    throw e;
  }
}

export async function writeText(rel, text) {
  await req(itemUrl(rel) + "/content", { method: "PUT", headers: { "Content-Type": "text/markdown" }, body: text });
  cacheSet("tx:" + rel, text);
}

export async function uploadBlob(rel, blob, type) {
  await req(itemUrl(rel) + "/content", { method: "PUT", headers: { "Content-Type": type }, body: blob });
}

/** Supprime un fichier (il va dans la corbeille OneDrive, récupérable 93 jours). Déjà absent = réussi. */
export async function deleteFile(rel) {
  try { await req(itemUrl(rel), { method: "DELETE" }); }
  catch (e) { if (e.status !== 404) throw e; }
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  try { localStorage.removeItem(P + "ls:" + dir); localStorage.removeItem(P + "tx:" + rel); } catch { /* ok */ }
}

export async function fetchBlob(rel) {
  const r = await req(itemUrl(rel) + "/content");
  return r.blob();
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
