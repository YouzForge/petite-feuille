import { ICONS } from "./icons.js";
import { emojiToIcon } from "./colors.js";

// Lecture des fichiers Markdown du projet : en-tête de champs (R16) OU ancien format « - **Champ :** valeur ».

const norm = s => s.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function scalar(v) {
  v = v.trim().replace(/^["']|["']$/g, "");
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function parseDoc(text) {
  text = (text || "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  let meta = {}, body = text, structured = false;
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    structured = true;
    body = text.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const k = line.match(/^([A-Za-z_À-ÿ0-9]+)\s*:\s*(.*)$/);
      if (k) meta[norm(k[1])] = scalar(k[2]);
    }
  } else {
    // ancien format : « - **Cœurs :** 2 (monstre faible) » dans l'introduction (avant la 1re section « ## »)
    const intro = body.split(/\n## /)[0];
    for (const line of intro.split("\n")) {
      const k = line.match(/^\s*[-*]\s+\*\*(.+?)\s*:?\s*\*\*\s*:?\s*(.+)$/);
      if (k) meta[norm(k[1])] = k[2].trim();
    }
  }
  const t = body.match(/^#\s+(.+)$/m);
  return { meta, body, title: t ? t[1].trim() : null, structured };
}

/** Premier entier d'une valeur ("2 (monstre faible)" → 2). */
export const intOf = v => {
  if (typeof v === "number") return v;
  const m = String(v ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
export const isTrue = v => v === true || /^(oui|true|vrai|yes)$/i.test(String(v ?? "").trim());

export function humanize(file) {
  return file.replace(/\.md$/i, "").replace(/^\d+_/, "").replace(/_/g, " ");
}

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const objSvg = o => `<svg class="obj" width="20" height="20" viewBox="0 0 24 24" fill="${o.couleur}" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${o.nom}"><g stroke="#3A2618" stroke-width="4.2">${ICONS[o.icone]}</g><g stroke="${o.couleur}" stroke-width="2.2">${ICONS[o.icone]}</g></svg>`;
export function inline(s) {
  return emojiToIcon(esc(s), objSvg)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

/** Gras, italique et code d'une ligne, en HTML sûr (pour les puces du mode Jouer). */
export const inlineMd = inline;

/** Markdown → HTML sûr (tout est échappé). Gère titres, listes, tableaux, citations, séparateurs. */
export function renderMd(body, { dropTitle = true } = {}) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0, list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^\s*```/.test(line)) {                                   // bloc de code : plans, schémas (alignement conservé)
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*$/.test(line)) { closeList(); i++; continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      closeList();
      if (m[1].length === 1) { if (!dropTitle) out.push(`<h2>${inline(m[2])}</h2>`); dropTitle = false; }
      else out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++; continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(line) && !/^\s*[-*]\s/.test(line)) { closeList(); out.push("<hr>"); i++; continue; }
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      closeList();
      const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push("<div class=\"tw\"><table><thead><tr>" + head.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + r.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>");
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); i++; continue; }
    if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/))) {
      const tag = /\d/.test(m[1]) ? "ol" : "ul";
      if (list !== tag) { closeList(); out.push(`<${tag}>`); list = tag; }
      out.push(`<li>${inline(m[2])}</li>`);
      i++; continue;
    }
    closeList();
    out.push(`<p>${inline(line.trim())}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}

/** Texte brut (pour la lecture à voix haute). */
export function plain(md) {
  return md.replace(/^#+\s*/gm, "").replace(/[*_`>|]/g, "").replace(/^\s*[-]\s+/gm, "").replace(/\n{2,}/g, ". ").replace(/\n/g, " ").trim();
}

/** Découpe un corps en sections « ## Titre ». → [{title, text}] (la 1re, sans titre, est l'introduction). */
export function sections(body) {
  const parts = body.split(/\n(?=## )/);
  return parts.map((p, i) => {
    const m = p.match(/^## (.+)\n?([\s\S]*)$/);
    return m ? { title: m[1].trim(), text: m[2] } : { title: "", text: p };
  });
}

/** Titre de la section des étapes : « Étapes de jeu », avec ou sans remarque entre parenthèses (« Étapes de jeu (lues par le mode Jouer…) »). */
export const isStepsTitle = t => /^[ée]tapes?(\s+de\s+jeu)?(\s*[(:\-–—].*)?\s*$/i.test((t || "").trim());

/**
 * Étapes de jeu d'une histoire : section « ## Étapes de jeu », une « ### Étape N — Titre » par étape.
 * Chaque étape : lignes « - **Libellé :** texte » suivies de sous-puces. Une ligne libre (remarque en italique, par ex.
 * « *(Seulement pour la fin B.)* ») est gardée comme note. → [{title, fields:[{label, text, items[], note?}]}]
 */
export function parseSteps(body) {
  const sec = sections(body).find(s => isStepsTitle(s.title));
  if (!sec) return [];
  return sec.text.split(/\n(?=### )/).filter(t => /^### /.test(t)).map(t => {
    const lines = t.split("\n");
    const title = lines[0].replace(/^###\s*/, "").replace(/^[ée]tape\s*\d+\s*[—–:-]\s*/i, "").trim();
    const fields = [];
    for (const raw of lines.slice(1)) {
      if (!raw.trim()) continue;
      const top = raw.match(/^[-*]\s+\*\*(.+?)\s*:?\s*\*\*\s*:?\s*(.*)$/);
      const sub = raw.match(/^\s{2,}[-*]\s+(.*)$/);
      if (top) fields.push({ label: top[1].trim(), text: top[2].trim(), items: [] });
      else if (sub && fields.length) fields[fields.length - 1].items.push(sub[1].trim());
      else if (/^\s{2,}\S/.test(raw) && fields.length) {          // suite d'une ligne qui passe à la ligne
        const f = fields[fields.length - 1];
        if (f.items.length) f.items[f.items.length - 1] += " " + raw.trim(); else f.text = (f.text + " " + raw.trim()).trim();
      } else {
        const note = raw.trim().replace(/^[*_]+|[*_]+$/g, "").trim();
        if (note) fields.push({ label: "", text: note, items: [], note: true });
      }
    }
    return { title, fields };
  });
}

/** Sections « ### 4.x » du fichier de règles, pour l'aide « Règles en bref » (une seule source : le fichier maître). */
export function ruleSections(text, wanted) {
  return text.split(/\n(?=### )/).filter(p => wanted.some(w => p.startsWith("### " + w + " ") || p === "### " + w));
}

/* ------------------------------------------------------------------ écriture (formulaires de fiches) */
const flat = v => String(v ?? "").replace(/\s*\n\s*/g, " ").trim();

/** Remet un en-tête de champs (R16) devant un corps de texte. L'ordre des champs est celui de l'objet. */
export function serializeDoc(meta, body) {
  const head = Object.entries(meta).map(([k, v]) => {
    const val = typeof v === "boolean" || typeof v === "number" ? String(v) : flat(v);
    return val === "" ? `${k}:` : `${k}: ${val}`;
  }).join("\n");
  return `---\n${head}\n---\n${body.replace(/^\n+/, "")}`;
}

/** Texte d'une section « ## Titre » du corps (sans le titre). */
export function getSection(body, title) {
  const re = new RegExp(`^## ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n## |(?![\\s\\S]))`, "m");
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

/** Remplace (ou ajoute à la fin) la section « ## Titre » ; texte vide = section retirée. */
export function setSection(body, title, text) {
  const re = new RegExp(`^## ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n[\\s\\S]*?(?=\\n## |(?![\\s\\S]))`, "m");
  const block = text.trim() ? `## ${title}\n${text.trim()}\n` : "";
  if (re.test(body)) return body.replace(re, block).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return block ? body.trimEnd() + "\n\n" + block : body;
}
