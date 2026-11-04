// Photos : réduction avant envoi, envoi dans 08_Photos/, vignette lue depuis OneDrive.
import { h, icon } from "./ui.js";
import { uploadBlob, fetchBlob } from "./graph.js";

export function resize(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? res({ blob: b, url: c.toDataURL("image/jpeg", .5) }) : rej(new Error("Photo illisible")), "image/jpeg", .82);
    };
    img.onerror = () => rej(new Error("Photo illisible"));
    img.src = URL.createObjectURL(file);
  });
}
export const stamp = () => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Réduit une photo et l'envoie dans 08_Photos/. → nom du fichier. */
export async function sendPhoto(file) {
  const r = await resize(file);
  const name = stamp() + ".jpg";
  await uploadBlob("08_Photos/" + name, r.blob, "image/jpeg");
  return { name, url: r.url };
}

/** Zone photo : l'image d'un fichier de 08_Photos/ (ou une icône tant qu'elle n'est pas là). */
export function photoBox(rel, cls = "photo", ic = "image") {
  const box = h("div", { class: cls }, icon(ic, 40, "var(--muted)"));
  if (rel) fetchBlob(rel).then(b => { box.innerHTML = ""; box.append(h("img", { src: URL.createObjectURL(b), alt: "" })); }).catch(() => { /* garde l'icône */ });
  return box;
}

/** Champ photo d'un formulaire : aperçu + « Photo » (appareil) + « Choisir » (galerie). onChange(nom) à chaque nouvelle photo envoyée. */
export function photoControl(current, ic, onChange) {
  const holder = h("div", null, photoBox(current ? "08_Photos/" + current : null, "photo", ic));
  const msg = h("div", { class: "muted center", style: "font-size:14px" });
  const mk = capture => {
    const input = h("input", { type: "file", accept: "image/*", ...(capture ? { capture: "environment" } : {}), style: "display:none" });
    input.addEventListener("change", async () => {
      const f = input.files[0]; if (!f) return;
      msg.className = "muted center"; msg.textContent = "Envoi de la photo…";
      try {
        const r = await sendPhoto(f);
        holder.replaceChildren(h("div", { class: "photo" }, h("img", { src: r.url, alt: "" })));
        msg.className = "ok center"; msg.textContent = "Photo rangée dans 08_Photos. Pense à enregistrer la fiche.";
        onChange(r.name);
      } catch (e) {
        msg.className = "ko center";
        msg.textContent = e.status ? "La photo n'a pas pu être envoyée (" + e.message + ")." : "Pas de réseau : la photo n'a pas été envoyée.";
      }
      input.value = "";
    });
    return input;
  };
  const cam = mk(true), gal = mk(false);
  return h("div", { class: "list", style: "gap:10px" }, holder,
    h("div", { class: "row", style: "gap:10px" },
      h("button", { type: "button", class: "btn primary grow", onclick: () => cam.click() }, icon("camera", 22, "#fff"), "Photo"),
      h("button", { type: "button", class: "btn grow", onclick: () => gal.click() }, icon("image", 22), "Choisir")),
    msg, cam, gal);
}
