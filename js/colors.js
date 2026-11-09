// Codes couleur des objets (règle R18). Ajouter un objet = une entrée ici ; l'application l'affiche partout avec sa couleur et son icône.
//   couleur : couleur fixe de l'objet        icone : nom d'icône du kit (js/icons.js)
//   emojis  : emoji(s) utilisés dans les fichiers, remplacés à l'écran par l'icône colorée
//   match   : reconnaît l'objet dans l'inventaire de la fiche de l'héroïne     equip : porté sur elle (affiché dans le cadre d'équipement)
export const OBJETS = {
  potion_vie: { nom: "Potion de vie", couleur: "#C23B2E", icone: "potion", emojis: ["🧪"], match: /potion de vie/i },
  epee: { nom: "Épée", couleur: "#B4BBC3", icone: "sword", emojis: ["⚔️", "⚔"], match: /[ée]p[ée]e/i, equip: true },
  bouclier: { nom: "Bouclier", couleur: "#D9A66B", rim: "#98A2AB", icone: "buckler", emojis: ["🛡️", "🛡"], match: /bouclier/i, equip: true },   // bois classique clair ; rim = cerclage de métal poli un peu usé, dessiné autour de la case (Florian, 6 novembre 2026)
  casque: { nom: "Casque en fer", couleur: "#7F95AB", icone: "helmet", emojis: ["🪖"], match: /casque/i, equip: true },
  piece: { nom: "Pièce de la Petite Feuille", couleur: "#F2B81C", icone: "coin", emojis: ["🪙"], match: /^\s*[-*]?\s*(🪙\s*)?pi[èe]ce de la petite feuille/i },
  lettre_magalie: { nom: "Lettre de Magalie", couleur: "#E8C766", icone: "note", emojis: ["💌"], match: /lettre/i }
};

/** Retrouve un objet à partir d'une ligne d'inventaire ("⚔️ Épée", "Casque en fer : porté"). */
export function findObjet(text) {
  for (const [id, o] of Object.entries(OBJETS)) if (o.match.test(text)) return { id, ...o };
  return null;
}

/** Texte lisible (ink) ou blanc sur la couleur de l'objet, selon sa luminosité. */
export function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58 ? "#3A2618" : "#FFFFFF";
}

/** Remplace les emoji d'objets (dont la couleur varie selon le téléphone) par leur icône colorée. */
export function emojiToIcon(html, iconSvg) {
  let out = html;
  for (const o of Object.values(OBJETS)) {
    for (const e of o.emojis || []) if (out.includes(e)) out = out.split(e).join(iconSvg(o));
  }
  return out;
}
