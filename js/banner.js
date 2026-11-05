// Bandeau « Hors connexion » : dit pourquoi, et propose de réessayer ou de se reconnecter.
import { h } from "./ui.js";
import { getLastIssue } from "./graph.js";
import { login } from "./auth.js";

export function staleBanner(isStale = true) {
  if (!isStale) return null;
  const cause = navigator.onLine === false
    ? "Le téléphone n'a pas de réseau pour le moment."
    : getLastIssue() ? "Cause relevée : " + getLastIssue() + "."
    : "Le téléphone n'a pas pu joindre OneDrive.";
  const why = h("div", { class: "banner-why", style: "display:none" },
    h("p", null, cause),
    h("p", null, "Ce qui aide, dans l'ordre : (1) « Réessayer » ; (2) « Se reconnecter » (Microsoft redemande parfois la connexion) ; (3) fermer complètement l'application puis la rouvrir."),
    h("p", null, "En dernier recours : retirer l'icône de l'écran d'accueil, la remettre depuis Safari, puis se reconnecter. Attention : une partie en cours ou un récap en brouillon, gardés sur ce téléphone, seraient perdus ; termine-les d'abord si possible."),
    h("div", { class: "row", style: "gap:10px;flex-wrap:wrap" },
      h("button", { class: "btn small", onclick: () => location.reload() }, "Réessayer"),
      h("button", { class: "btn small", onclick: () => { login().catch(() => {}); } }, "Se reconnecter")));
  const toggle = h("button", { class: "linkbtn", "aria-expanded": "false", onclick: () => {
    const open = why.style.display === "none";
    why.style.display = open ? "" : "none"; toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Masquer" : "Pourquoi ?";
  } }, "Pourquoi ?");
  return h("div", { class: "banner" }, h("div", null, "Hors connexion : dernière version enregistrée sur ce téléphone. ", toggle), why);
}
