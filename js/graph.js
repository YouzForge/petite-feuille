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
export function setFolderPath(path) { localStorage.setItem(FOLDER_KEY, JSON.stringify({ path: path.trim().replace(/^\/+|\/+$/g, "") })); }

/** Adresse Graph d'un élément du dossier projet. rel = chemin relatif ("04_Bestiaire/Squelette.md"), "" = la racine. */
function itemUrl(rel) {
  const f = folderCfg();
  if (!f) { const e = new Error("Dossier du projet non configuré"); e.noFolder = true; throw e; }
  if (f.driveId) {
    const base = `${G}/drives/${f.driveId}/items/${f.itemId}`;
    return rel ? `${base}:/${enc(rel)}:` : base;
  }
  return `${G}/me/drive/root:/${enc(rel ? f.path + "/" + rel : f.path)}:`;
}

/** Cherche le fichier maître dans OneDrive et en déduit le dossier du projet. → true si trouvé. */
export async function discoverFolder() {
  const r = await req(`${G}/me/drive/search(q='${encodeURIComponent(MARKER.replace(/\.md$/, ""))}')?$select=name,id,file,parentReference,remoteItem&$top=25`);
  const j = await r.json();
  for (const x of j.value || []) {
    if (x.name !== MARKER) continue;
    const pr = (x.remoteItem && x.remoteItem.parentReference) || x.parentReference;
    if (pr && pr.driveId && pr.id) {
      localStorage.setItem(FOLDER_KEY, JSON.stringify({ driveId: pr.driveId, itemId: pr.id }));
      return true;
    }
  }
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
