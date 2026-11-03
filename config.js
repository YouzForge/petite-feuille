// Configuration de l'application. L'identifiant client Microsoft est public (ce n'est pas un secret).
// Le dossier du projet n'est PAS écrit ici : l'application le retrouve toute seule dans OneDrive à la première ouverture.
window.PF_CONFIG = {
  clientId: "eeb8d353-3cb5-4120-82fb-c88bb55fa287",
  authority: "https://login.microsoftonline.com/common",
  scopes: ["User.Read", "Files.ReadWrite"],
  // Comptes autorisés à ouvrir l'application : empreintes SHA-256 de "pf1:" + adresse en minuscules (pas les adresses, le dépôt est public).
  allowedHashes: [
    "823578ce4478ba71167f938de64dc7004b9fe68cc572c5df835032185508ec8b",
    "5197f360373eb9d70a94086ab043c8031cb5fca46ba683d91ec5921243bfc1ad"
  ]
};
