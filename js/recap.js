// Récap du soir : une seule page qui défile, brouillon gardé sur le téléphone, enregistré dans OneDrive (01_Histoires_Jouees/Recap_….md).
import { h, icon } from "./ui.js";
import { getSession, clearSession } from "./jouer.js";
import { writeText } from "./graph.js";
import { heroName } from "./collections.js";
import { soinsText, gagneesText, utiliseesText } from "./potions.js";

const DRAFT = "pf:recap";
const pad = n => String(n).padStart(2, "0");
const dateOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const slug = s => (s || "histoire").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "histoire";
const lines = t => String(t || "").split("\n").map(x => x.trim()).filter(Boolean);
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT)); } catch { return null; } };
const saveDraft = r => { try { localStorage.setItem(DRAFT, JSON.stringify(r)); } catch { /* plein */ } };

/** La fin choisie pendant la partie, en une ligne. */
function finText(s) {
  if (!s || !s.fin) return "";
  return s.fin.code === "autre" ? `Autre fin imaginée par ${heroName()} : ${s.fin.texte}` : `Fin ${s.fin.code} : ${s.fin.texte}`;
}

function fresh(s) {
  const r = { sid: s ? s.started : "manuel", at: s ? s.started : Date.now(), titre: s ? s.titre : "", mj: "Papa", joueurs: heroName(), duree: "", resume: "",
    etapes: "", fin: "", phrases: "", des: "", coeursPerdus: "", armure: "", soins: "", tombee: "Non", gagnes: "", perdus: "", pouvoir: "", compagnons: "",
    lieux: "", personnages: "", creatures: "", regles: "", fils: "", prochaine: "", ressenti: "" };
  if (s) {
    r.duree = String(Math.max(1, Math.round((Date.now() - s.started) / 60000)));
    r.etapes = (s.etapes || []).join("\n");
    r.fin = finText(s);
    r.phrases = (s.phrases || []).map(p => `« ${p.t} »`).join("\n");
    r.des = (s.jets || []).map(j => `${j.a} + ${j.b} : ${j.ok ? "réussite" : "raté"}${j.a === j.b ? " (double)" : ""}`).join("\n");
    if (s.coeurs0 != null) r.coeursPerdus = String(Math.max(0, s.coeurs0 - s.coeurs));
    r.armure = String(s.armure);
    r.tombee = s.coeurs === 0 ? "Oui" : "Non";
    r.soins = soinsText(s); r.gagnes = gagneesText(s); r.perdus = utiliseesText(s);
  }
  return r;
}

/** Le fichier Markdown du récap, selon le modèle 99_Modeles/Modele_Recap_du_soir.md. */
export function recapMarkdown(r) {
  const L = (t, ordered) => { const l = lines(t); return l.length ? l.map((x, i) => (ordered ? `${i + 1}. ` : "- ") + x).join("\n") : (ordered ? "1." : "-"); };
  const date = dateOf(r.at);
  return `---
type: recap
date: ${date}
titre: ${r.titre.replace(/\n/g, " ")}
mj: ${r.mj}
statut: brouillon
---
# Récap du soir — ${r.titre || "sans titre"}

## L'essentiel
- **Date :** ${date}
- **Titre de l'histoire (même provisoire) :** ${r.titre}
- **Qui a joué :** ${r.joueurs}
- **MJ :** ${r.mj}
- **Durée environ :** ${r.duree ? r.duree + " min" : ""}
- **Résumé en 3 lignes :** ${r.resume.replace(/\n/g, " ")}

## Ce qui s'est passé (dans l'ordre)
${L(r.etapes, true)}

## Comment l'histoire s'est terminée
${(r.fin || "").trim() ? (r.fin || "").trim() : "-"}

## Les idées et les phrases de ${heroName()}
${L(r.phrases)}

## Les jets de dés marquants
${L(r.des)}

## Cœurs, armure et soins
- Cœurs perdus : ${r.coeursPerdus}
- Armure : ${r.armure}
- Potions ou soins : ${r.soins}
- Est-elle tombée dans les pommes ? ${r.tombee}

## Ce qu'elle a gagné ou perdu
- Objets gagnés : ${lines(r.gagnes).join(", ")}
- Objets perdus ou utilisés : ${lines(r.perdus).join(", ")}
- Nouveau pouvoir ou progression : ${r.pouvoir}

## Compagnon(s) parti(s) avec elle
${L(r.compagnons)}

## Lieux visités
${L(r.lieux)}

## Personnages rencontrés
${L(r.personnages)}

## Créatures rencontrées
${L(r.creatures)}

## Règles improvisées
${L(r.regles)}

## Fils ouverts
${L(r.fils)}

## Pour la prochaine fois
${L(r.prochaine)}

## Mon ressenti de MJ
${L(r.ressenti)}
`;
}

export function recapScreen() {
  const s = getSession();
  let r = loadDraft();
  if (!r || r.sid !== (s ? s.started : "manuel")) { r = fresh(s); r.finSrc = finText(s); saveDraft(r); }
  else if (s && finText(s) !== (r.finSrc || "")) { r.fin = finText(s); r.finSrc = r.fin; saveDraft(r); }   // la fin a changé depuis l'ouverture du brouillon
  const status = h("span", { class: "chip", style: "background:#E2EEE9" }, "Brouillon gardé sur ce téléphone");
  let timer = 0;
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => { saveDraft(r); status.textContent = "Brouillon gardé sur ce téléphone"; }, 400); status.textContent = "…"; };

  const sec = t => h("h2", { style: "color:var(--red);margin-top:10px" }, t);
  const lab = t => h("label", { class: "kicker", style: "text-transform:none;letter-spacing:0;font-size:15px" }, t);
  const inp = (key, label, { area = false, ph = "", num = false } = {}) => {
    const el = area ? h("textarea", { class: "field", placeholder: ph || "À dicter ou écrire (le micro du clavier marche partout)", style: "min-height:96px" })
      : h("input", { class: "field", placeholder: ph, ...(num ? { inputmode: "numeric" } : {}) });
    el.value = r[key] || "";
    el.addEventListener("input", () => { r[key] = el.value; touch(); });
    return h("div", { class: "list", style: "gap:6px" }, lab(label), el);
  };
  const choice = (key, label, opts) => {
    const wrap = h("div", { class: "row", style: "gap:10px" });
    const draw = () => wrap.replaceChildren(...opts.map(o => h("button", { class: "tab" + (r[key] === o ? " on" : ""), onclick: () => { r[key] = o; touch(); draw(); } }, o)));
    draw();
    return h("div", { class: "list", style: "gap:6px" }, lab(label), wrap);
  };

  const msg = h("div", { class: "muted center" }, "Rien n'est perdu si tu t'endors avant : le brouillon est gardé.");
  const save = h("button", { class: "btn primary block", style: "font-size:20px;padding:16px" }, "Enregistrer dans OneDrive");
  const closeBox = h("div");
  save.addEventListener("click", async () => {
    saveDraft(r);
    save.disabled = true; msg.className = "muted center"; msg.textContent = "Enregistrement…";
    const name = `Recap_${dateOf(r.at)}_${slug(r.titre)}.md`;
    try {
      await writeText("01_Histoires_Jouees/" + name, recapMarkdown(r));
      msg.className = "ok center"; msg.textContent = `Enregistré : 01_Histoires_Jouees/${name}`;
      closeBox.replaceChildren(h("button", { class: "btn block", style: "margin-top:10px", onclick: () => { clearSession(); localStorage.removeItem(DRAFT); location.hash = "#/mj/ce-soir"; } }, "La partie est terminée : fermer la séance"));
    } catch (e) { msg.className = "ko center"; msg.textContent = e.status ? "Échec de l'enregistrement (" + e.message + "). Le brouillon est gardé." : "Pas de réseau : le brouillon est gardé, réessaie plus tard."; }
    save.disabled = false;
  });

  const node = h("div", { class: "page with-nav" },
    h("div", { class: "row", style: "justify-content:space-between" }, status),
    h("div", { class: "muted" }, "Fais défiler et remplis ce que tu veux. Les champs vides ne sont pas grave."),
    sec("L'essentiel"), inp("titre", "Titre de l'histoire"), choice("mj", "Qui a mené la partie", ["Papa", "Maman"]),
    inp("joueurs", "Qui a joué"), inp("duree", "Durée (minutes)", { num: true }), inp("resume", "Résumé en 3 lignes", { area: true }),
    sec("Ce qui s'est passé, dans l'ordre"), inp("etapes", "Une ligne par moment", { area: true }),
    sec("Comment l'histoire s'est terminée"), inp("fin", "La fin choisie par "+heroName()+" (ou imaginée par elle)", { area: true }),
    sec(`Les phrases de ${heroName()}`), inp("phrases", "Captées pendant la partie (une par ligne)", { area: true }),
    sec("Les jets de dés marquants"), inp("des", "Réussites folles, échecs, doubles", { area: true }),
    sec("Cœurs, armure et soins"), inp("coeursPerdus", "Cœurs perdus", { num: true }), inp("armure", "Armure restante", { num: true }), inp("soins", "Potions ou soins"), choice("tombee", "Est-elle tombée dans les pommes ?", ["Non", "Oui"]),
    sec("Ce qu'elle a gagné ou perdu"), inp("gagnes", "Objets gagnés (un par ligne)", { area: true }), inp("perdus", "Objets perdus ou utilisés", { area: true }), inp("pouvoir", "Nouveau pouvoir ou progression"),
    sec("Compagnon(s) parti(s) avec elle"), inp("compagnons", `Qui ${heroName()} a choisi d'emmener`, { area: true, ph: "Aucun pour l'instant" }),
    sec("Lieux visités"), inp("lieux", "Un par ligne", { area: true }),
    sec("Personnages rencontrés"), inp("personnages", "Nouveaux ou récurrents : ce qu'ils ont dit, ce qu'ils veulent", { area: true }),
    sec("Créatures rencontrées"), inp("creatures", "Nom, cœurs, ce qui s'est passé, version carton fabriquée ?", { area: true }),
    sec("Règles improvisées"), inp("regles", "Ce que tu as tranché et qu'il faut garder", { area: true }),
    sec("Fils ouverts"), inp("fils", "Ce qui reste à découvrir, ce que l'héroïne a laissé de côté", { area: true }),
    sec("Pour la prochaine fois"), inp("prochaine", "Une idée de suite, un objet à reprendre, une envie de l'héroïne", { area: true }),
    sec("Mon ressenti de MJ"), inp("ressenti", "Ce qui a bien marché, ce qu'elle a préféré, ce que je changerais", { area: true }),
    h("div", { class: "card" }, h("strong", null, "Où ça va : "), "le récap est écrit dans 01_Histoires_Jouees/ (fichier Recap_date_titre.md). Claude le transforme ensuite en fichier d'histoire propre et met à jour le journal, la fiche de l'héroïne et le bestiaire."),
    save, closeBox, msg);
  return { title: "Récap du soir", back: "/mj/ce-soir", nav: "ce-soir", node };
}
