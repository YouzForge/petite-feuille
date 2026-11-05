// Contrôle d'une histoire avant de la jouer : dit si le mode Jouer pourra la lire, et ce qui manque sinon.
// Utile quand une histoire est écrite hors de l'application (autre conversation, tâche automatique, à la main).
import { parseSteps, sections } from "./md.js";
import { parseVoie, MAX_VOIES } from "./voies.js";

const FIN = /^fin\s*[a-z0-9]*\s*$/i;

/** → { etapes, voies, fins, problemes: [texte], bloquant } */
export function controleHistoire(body) {
  const steps = parseSteps(body);
  const problemes = [];
  if (!steps.length) {
    const titres = sections(body).map(s => s.title).filter(Boolean);
    problemes.push("Aucune section « ## Étapes de jeu » avec des « ### Étape N — Titre » n'a été trouvée." + (titres.length ? " Sections présentes : " + titres.join(" · ") + "." : ""));
    return { etapes: 0, voies: 0, fins: 0, problemes, bloquant: true };
  }
  let voies = 0, fins = 0;
  steps.forEach((s, i) => {
    const n = i + 1;
    const vs = s.fields.map(f => parseVoie(f.label)).filter(Boolean);
    voies += vs.length;
    fins += s.fields.filter(f => FIN.test(f.label)).length;
    if (!s.fields.some(f => /^[àa] trouver/i.test(f.label))) problemes.push(`Étape ${n} : pas de ligne « À trouver ».`);
    if (!vs.length) problemes.push(`Étape ${n} : aucune voie (« - **Voie <type> · Titre :** »).`);
    if (vs.length > MAX_VOIES) problemes.push(`Étape ${n} : ${vs.length} voies, c'est beaucoup pour une enfant de 5 ans (R19).`);
    vs.filter(v => v.type.cle === "autre").forEach(v => problemes.push(`Étape ${n} : le type de la voie « ${v.titre} » n'est pas reconnu (icône par défaut).`));
  });
  if (!fins) problemes.push("Aucune « Fin A / Fin B » dans les étapes : l'écran de la partie n'aura pas de bouton de fin.");
  return { etapes: steps.length, voies, fins, problemes, bloquant: false };
}
