// Mode Jouer : l'aide-mémoire de la partie, téléphone posé sur la table.
import { h, icon, hearts, spinner } from "./ui.js";
import { COLLECTIONS, loadItem, loadHeroState, heroName } from "./collections.js";
import { parseSteps, ruleSections, renderMd, inlineMd } from "./md.js";
import { readText } from "./graph.js";
import { parseVoie, MAX_VOIES } from "./voies.js";
import { controleHistoire } from "./controle.js";
import { POTIONS, addPotion, drink, undo, canUndo, coeursMax } from "./potions.js";

const go = path => { location.hash = "#" + path; };

/* ------------------------------------------------------------------ séance en cours (gardée sur le téléphone, lue par le récap) */
const KEY = "pf:jouer";
export const getSession = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const saveSession = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* plein */ } };
export const clearSession = () => localStorage.removeItem(KEY);

/* ------------------------------------------------------------------ dés */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const rand6 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 6) + 1; };
/** Règle 4.2 : réussite si au moins un 5 ou un 6, ou un double. */
export const isSuccess = (a, b) => a >= 5 || b >= 5 || a === b;

function die(n) {
  const d = h("div", { class: "die", role: "img", "aria-label": `dé : ${n}` });
  for (let i = 0; i < 9; i++) d.append(h("span", { class: PIPS[n].includes(i) ? "pip on" : "pip" }));
  return d;
}

/* ------------------------------------------------------------------ fenêtre qui monte du bas */
function openSheet(title, body) {
  const back = h("div", { class: "sheet-back" });
  const close = () => back.remove();
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-label": title },
    h("div", { class: "sheet-grip" }),
    h("div", { class: "row", style: "justify-content:space-between;margin-bottom:10px" },
      h("h2", null, title), h("button", { class: "iconbtn", "aria-label": "Fermer", onclick: close }, icon("x", 24))),
    body);
  back.addEventListener("click", e => { if (e.target === back) close(); });
  back.append(sheet);
  document.body.append(back);
  return close;
}

/* ------------------------------------------------------------------ Outils : dés + règles en bref */
function toolsBody(session, onRoll) {
  const tabs = h("div", { class: "tabs" });
  const pane = h("div");
  const diceBtn = h("button", { class: "tab on" }, "Dés");
  const rulesBtn = h("button", { class: "tab" }, "Règles en bref");
  tabs.append(diceBtn, rulesBtn);

  const showDice = () => {
    diceBtn.className = "tab on"; rulesBtn.className = "tab";
    const faces = h("div", { class: "dice" }, die(session.jets.length ? session.jets.at(-1).a : 6), die(session.jets.length ? session.jets.at(-1).b : 3));
    const verdict = h("div", { class: "verdict" });
    const hint = h("div", { class: "card" }, "Réussite : au moins un 5 ou un 6, ou un double.");
    const btn = h("button", { class: "btn red block", style: "font-size:22px;padding:16px" }, "Lancer 2d6");
    const show = (a, b) => {
      faces.replaceChildren(die(a), die(b));
      const ok = isSuccess(a, b);
      verdict.className = "verdict " + (ok ? "win" : "miss");
      verdict.textContent = ok ? "Réussite !" : "Pas cette fois";
      const fails = session.jets.slice(-2).filter(j => !j.ok).length;
      hint.textContent = ok ? "Réussite : au moins un 5 ou un 6, ou un double."
        : (fails >= 2 ? "Deux ratés de suite : propose un indice ou un allié (plan B). Pas d'accumulation d'échecs." : "Propose-lui une autre idée ou un petit coup de pouce.");
    };
    if (session.jets.length) show(session.jets.at(-1).a, session.jets.at(-1).b);
    btn.addEventListener("click", () => {
      btn.disabled = true;
      let n = 0;
      const t = setInterval(() => { faces.replaceChildren(die(rand6()), die(rand6())); if (++n >= 7) { clearInterval(t); const a = rand6(), b = rand6(); session.jets.push({ a, b, ok: isSuccess(a, b), at: Date.now() }); onRoll(); show(a, b); btn.disabled = false; } }, 80);
    });
    pane.replaceChildren(h("div", { class: "card center" }, faces, verdict), hint, btn);
  };

  const showRules = async () => {
    rulesBtn.className = "tab on"; diceBtn.className = "tab";
    pane.replaceChildren(spinner("Chargement des règles…"));
    try {
      const r = await readText("00_REGLES_PROJET.md");
      const parts = r.text ? ruleSections(r.text, ["4.1", "4.2", "4.3", "4.4", "4.5", "4.9", "4.10"]) : [];
      pane.replaceChildren(h("div", { class: "card md", html: parts.length ? renderMd(parts.join("\n\n")) : "<p>Règles introuvables.</p>" }));
    } catch (e) { pane.replaceChildren(h("div", { class: "card ko" }, "Impossible de lire les règles : " + (e.message || e))); }
  };
  diceBtn.addEventListener("click", showDice);
  rulesBtn.addEventListener("click", showRules);
  showDice();
  return h("div", { class: "list" }, tabs, pane);
}

/* ------------------------------------------------------------------ les fins : un bouton par fin prévue + « Autre fin » */
/** Les fins prévues (champs « Fin A », « Fin B »…) d'une étape. */
function endingsOf(fields) {
  return fields.map(f => {
    const code = (f.label.match(/^fin\s*([a-z0-9]*)/i) || [, ""])[1].toUpperCase();
    return { code: code || String(1), texte: [f.text, ...f.items].filter(Boolean).join(" · ").replace(/\*\*|\*|`/g, "") };
  });
}
function endingsBox(fields, fin, onFin) {
  const ends = endingsOf(fields);
  const mark = on => on ? icon("check", 26, "#fff", 3) : null;
  const buttons = ends.map(e => {
    const on = fin && fin.code === e.code;
    return h("button", { class: "fin-btn" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", onclick: () => onFin(on ? null : { code: e.code, texte: e.texte }) },
      h("span", { class: "fin-code" }, on ? icon("check", 24, "#fff", 3) : "Fin " + e.code),
      h("span", { class: "fin-text" }, on ? "Fin " + e.code + " : " + e.texte : e.texte));
  });
  const autreOn = fin && fin.code === "autre";
  buttons.push(h("button", { class: "fin-btn autre" + (autreOn ? " on" : ""), "aria-pressed": autreOn ? "true" : "false", onclick: () => onFin("autre") },
    h("span", { class: "fin-code" }, autreOn ? icon("check", 24, "#fff", 3) : icon("plus", 22, "currentColor", 3)),
    h("span", { class: "fin-text" }, autreOn ? "Autre fin : " + fin.texte : "Autre fin")));
  return h("div", { class: "fins" },
    h("div", { class: "kicker" }, "Comment l'histoire se termine ?"),
    h("div", { style: "font-size:15px;color:var(--muted)" }, "Touche la fin choisie : elle sera dans le récap du soir."),
    buttons);
}

/* ------------------------------------------------------------------ une étape */
function stepCard(step, onAsk, fin, onFin) {
  const kids = [h("h2", { style: "font-size:30px" }, step.title)];
  let nbVoies = 0, finDone = false;
  for (const f of step.fields) {
    if (f.note) { kids.push(h("div", { class: "muted", style: "font-style:italic" }, f.text)); continue; }
    const key = f.label.toLowerCase();
    const list = f.items.length ? h("ul", { class: "steplist" }, f.items.map(i => h("li", { html: inlineMd(i) }))) : null;
    const text = f.text ? h("div", { html: inlineMd(f.text) }) : null;
    let v;
    if (/^[àa] trouver/.test(key)) {
      kids.push(h("div", { style: "font-size:19px" }, h("span", { style: "color:var(--red);font-weight:800" }, "À trouver : "), h("span", { html: inlineMd(f.text) })));
    } else if ((v = parseVoie(f.label))) {
      nbVoies++;
      const pill = v.verrou ? "Pas encore" + (v.pouvoir ? " · " + v.pouvoir : "")
        : v.pouvoir ? v.pouvoir + (/loup|[ée]p[ée]e|combat|pouvoir/i.test(v.pouvoir) ? " · 2d6" : "")
        : "Automatique";
      kids.push(h("div", { class: "voie vt-" + v.type.cle + (v.verrou ? " verrou" : "") },
        h("div", { class: "voie-head" },
          icon(v.verrou ? "lock" : v.type.icone, 24, "currentColor"),
          h("strong", null, v.titre),
          v.type.nom ? h("span", { class: "vtype" }, v.type.nom) : null,
          h("span", { class: "pill" + (v.verrou ? " pill-lock" : "") }, pill)),
        text, list));
    } else if (/^fin\s*[a-z0-9]*\s*$/i.test(key)) {
      if (finDone) continue;               // toutes les fins sont regroupées au premier « Fin … »
      finDone = true;
      kids.push(endingsBox(step.fields.filter(x => /^fin\s*[a-z0-9]*\s*$/i.test(x.label)), fin, onFin));
    } else if (/^si elle h[ée]site/.test(key)) {
      kids.push(h("div", { class: "tip" }, h("strong", null, "Si elle hésite : "), h("span", { html: inlineMd(f.text) }), list));
    } else {
      kids.push(h("div", { class: "card" }, h("strong", null, f.label), text, list));
    }
  }
  if (nbVoies > MAX_VOIES) kids.push(h("div", { style: "font-size:15px;color:var(--muted)" }, "Plus de " + MAX_VOIES + " voies dans cette étape : c'est beaucoup pour une enfant de 5 ans (à alléger)."));
  kids.push(h("button", { class: "ask", onclick: onAsk }, "Que fais-tu ?"));
  return h("div", { class: "card stepcard" }, kids);
}

/* ------------------------------------------------------------------ l'écran Jouer */
export async function jouerScreen(file) {
  file = decodeURIComponent(file);
  const { item } = await loadItem(COLLECTIONS.prochaine, file);
  const steps = parseSteps(item.body);
  let s = getSession();
  if (!s || s.file !== file) {
    let st = { coeurs: 3, armure: 1 };
    try { st = await loadHeroState(); } catch (e) { if (e.auth) throw e; }
    s = { file, titre: item.name, step: 0, coeurs: st.coeurs, armure: st.armure, coeurs0: st.coeurs, coeursMax: st.coeurs, armure0: st.armure, potions: [], bus: [], ajoutees: [], etapes: steps.map(x => x.title), phrases: [], jets: [], started: Date.now() };
    saveSession(s);
  }
  const save = () => saveSession(s);

  let wake = null;
  const keepAwake = async () => { try { if ("wakeLock" in navigator && document.visibilityState === "visible") wake = await navigator.wakeLock.request("screen"); } catch { /* pas grave */ } };
  keepAwake();
  const onVis = () => keepAwake();
  document.addEventListener("visibilitychange", onVis);
  const closers = [];
  let flash = "";

  const root = h("div", { class: "jouer" });
  const draw = () => {
    s.step = Math.max(0, Math.min(s.step, Math.max(steps.length - 1, 0)));
    const head = h("div", { class: "jhead" },
      h("div", { class: "grow" },
        h("div", { class: "muted", style: "font-size:15px" }, item.name),
        h("div", { style: "font-size:19px;font-weight:800" }, steps.length ? `Étape ${s.step + 1} sur ${steps.length}` : "Aucune étape")),
      h("button", { class: "btn", onclick: () => closers.push(openSheet("Outils", toolsBody(s, save))) }, icon("dice", 24), "Outils"));
    const bars = h("div", { class: "bars" }, steps.map((_, i) => h("button", { class: "bar" + (i <= s.step ? " on" : ""), "aria-label": `Étape ${i + 1}`, onclick: () => { s.step = i; save(); draw(); } })));
    const stepNode = steps.length
      ? stepCard(steps[s.step], () => ask(), s.fin, v => chooseEnding(v))
      : h("div", { class: "card md" }, h("h3", null, "Cette histoire n'a pas d'étapes de jeu lisibles"),
          h("div", { class: "muted" }, controleHistoire(item.body).problemes.join(" ") + " Voir le modèle d'histoire (99_Modeles). En attendant, voici son contenu :"), h("div", { html: renderMd(item.body) }));
    const nav = steps.length > 1 ? h("div", { class: "row", style: "gap:10px" },
      h("button", { class: "btn grow", disabled: s.step === 0, onclick: () => { s.step--; save(); draw(); window.scrollTo(0, 0); } }, icon("back", 22), "Précédente"),
      h("button", { class: "btn grow", disabled: s.step >= steps.length - 1, onclick: () => { s.step++; save(); draw(); window.scrollTo(0, 0); } }, "Suivante", icon("next", 22))) : null;

    const counter = (label, ic, val, set, max, fill) => h("div", { class: "counter" },
      h("button", { class: "iconbtn big", "aria-label": `Moins de ${label}`, onclick: () => { set(Math.max(0, val - 1)); save(); draw(); } }, icon("minus", 30)),
      h("div", { class: "cval", role: "status", "aria-label": `${val} ${label}` },
        val > 0 && fill === "hearts" ? hearts(val, 34, 150) : null,
        fill === "shield" ? [icon("shield", 38, "var(--ink)", 1.6, "#A9BDD1"), h("span", { style: "font:600 34px Fredoka" }, String(val))] : null,
        val === 0 && fill === "hearts" ? h("span", { class: "muted" }, "0 cœur") : null),
      h("button", { class: "iconbtn big", "aria-label": `Plus de ${label}`, onclick: () => { set(Math.min(max, val + 1)); save(); draw(); } }, icon("plus", 30)));
    const potionBtn = p => h("button", { class: "potion" + (p.reste === 1 ? " half" : ""),
        "aria-label": p.reste === 2
          ? `${p.nom} : boire la moitié (${p.moitie} cœur${p.moitie > 1 ? "s" : ""})`
          : `${p.nom} : finir la potion (${p.entiere - p.moitie} cœur${p.entiere - p.moitie > 1 ? "s" : ""})`,
        onclick: () => {
          const r = drink(s, p.id); save();
          flash = r.ok ? `+${r.gain} cœur${r.gain > 1 ? "s" : ""}` + (r.fini ? " : potion finie !" : " : il reste la moitié.")
            : r.raison === "pleins" ? `Les cœurs de ${heroName()} sont déjà pleins : la potion reste pour plus tard.` : "";
          draw();
        } },
      icon("potion", 40, "var(--ink)", 1.8, p.reste === 2 ? "#C23B2E" : "#E9A9A2"),
      h("span", { class: "plabel" }, p.reste === 2 ? "Boire ½" : "Finir ½"));
    const addP = h("button", { class: "potion add", "aria-label": "Ajouter une potion",
        onclick: () => {
          const types = Object.keys(POTIONS);
          const add = t => { addPotion(s, t); save(); flash = ""; draw(); };
          if (types.length === 1) return add(types[0]);
          let close;
          close = openSheet("Ajouter une potion", h("div", { class: "list" }, types.map(t => h("button", { class: "btn block", onclick: () => { close(); add(t); } }, POTIONS[t].nom))));
          closers.push(close);
        } },
      icon("plus", 26), h("span", { class: "plabel" }, "Potion"));
    const potionsRow = h("div", { class: "potions" },
      h("div", { class: "kicker" }, "Potions"),
      h("div", { class: "row", style: "gap:10px;flex-wrap:wrap" }, (s.potions || []).map(potionBtn), addP,
        canUndo(s) ? h("button", { class: "linkbtn", onclick: () => { undo(s); save(); flash = ""; draw(); } }, "Annuler") : null),
      flash ? h("div", { class: "pflash", role: "status" }, flash) : null);
    const state = h("div", { class: "card" },
      counter("cœurs", "heart", s.coeurs, v => s.coeurs = v, 30, "hearts"),
      potionsRow,
      counter("armure", "shield", s.armure, v => s.armure = v, 5, "shield"),
      s.coeurs === 0 ? h("div", { class: "tip" }, `${heroName()} tombe dans les pommes : elle va se reposer, puis elle repart. Rien de grave !`) : null);

    const phrase = h("button", { class: "btn primary block", style: "font-size:20px;padding:16px", onclick: () => notePhrase() }, icon("mic", 26, "#fff"), `Noter une phrase de ${heroName()}` + (s.phrases.length ? ` (${s.phrases.length})` : ""));
    const finish = h("button", { class: "btn block", style: "background:var(--ink);color:#fff;font-size:20px;padding:16px", onclick: () => { save(); go("/mj/recap"); } }, "Terminer et faire le récap", icon("next", 24, "#fff"));
    const quit = h("a", { class: "muted center", href: "#/mj/ce-soir", style: "font-size:15px;text-decoration:underline" }, "Quitter sans terminer (la partie est gardée)");
    root.replaceChildren(head, bars, stepNode, nav, state, phrase, finish, quit);
  };

  const ask = () => {
    const ov = h("div", { class: "ask-overlay", onclick: () => ov.remove() },
      h("div", { style: "font:600 56px/1.1 Fredoka" }, "Que fais-tu ?"),
      h("div", { style: "font-size:20px;max-width:22em" }, "Accepte son idée, puis demande : « D'accord, mais comment tu fais ? »"));
    document.body.append(ov);
    closers.push(() => ov.remove());
  };

  const chooseEnding = v => {
    if (v === "autre") {
      const field = h("textarea", { class: "field", placeholder: `La fin imaginée par ${heroName()}… (le micro du clavier fonctionne ici)`, "aria-label": "Autre fin" });
      if (s.fin && s.fin.code === "autre") field.value = s.fin.texte;
      let close;
      const btn = h("button", { class: "btn primary block", onclick: () => {
        const t = field.value.trim(); if (!t) return;
        s.fin = { code: "autre", texte: t }; save(); close(); draw();
      } }, "Enregistrer cette fin");
      close = openSheet("Autre fin", h("div", { class: "list" }, h("div", { class: "muted" }, `Note la fin que ${heroName()} a imaginée.`), field, btn));
      closers.push(close);
      setTimeout(() => field.focus(), 50);
      return;
    }
    if (v) s.fin = v; else delete s.fin;
    save(); draw();
  };

  const notePhrase = () => {
    const field = h("textarea", { class: "field", placeholder: `Ce que ${heroName()} vient de dire ou d'inventer… (le micro du clavier fonctionne ici)`, "aria-label": "Phrase de l'enfant" });
    const list = h("div", { class: "list" });
    const drawList = () => list.replaceChildren(...s.phrases.slice().reverse().map(p => h("div", { class: "card" }, p.t)));
    drawList();
    let close;
    const btn = h("button", { class: "btn primary block", onclick: () => {
      const t = field.value.trim(); if (!t) return;
      s.phrases.push({ t, at: Date.now() }); save(); field.value = ""; drawList(); draw();
    } }, "Enregistrer la phrase");
    close = openSheet(`Phrase de ${heroName()}`, h("div", { class: "list" }, field, btn, s.phrases.length ? h("div", { class: "kicker" }, "Déjà notées") : null, list));
    closers.push(close);
    setTimeout(() => field.focus(), 50);
  };

  draw();
  return {
    bare: true,
    node: root,
    cleanup: () => { document.removeEventListener("visibilitychange", onVis); try { wake && wake.release(); } catch { /* ok */ } closers.forEach(c => { try { c(); } catch { /* ok */ } }); }
  };
}
