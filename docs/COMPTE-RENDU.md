# Compte rendu — Los Asetinos, de M0 à M6

> Bilan complet du projet, du premier commit à la fin de la roadmap.
> État au 12 juillet 2026 · branche `main` · 10 commits · roadmap M0 → M6 terminée.

## 1. Le projet en une phrase

**Los Asetinos** est un bac-à-sable open-world façon GTA, jouable dans le navigateur,
qui reproduit le parcours d'itérations de la vidéo « J'ai laissé 24 h à Claude pour
créer GTA 6 » (ville → conduite → PNJ → police/armes → mission → avion → cinématique),
mais construit comme une vraie production : TypeScript strict, architecture en couches,
simulation à pas fixe, génération procédurale déterministe.

**Chiffres clés**

| | |
|---|---|
| Code | 47 fichiers TypeScript · ~5 100 lignes de code (+1 000 lignes de commentaires) · 380 lignes de CSS |
| Stack | Three.js · TypeScript strict · Vite — zéro dépendance réseau au runtime |
| Qualité | `typecheck`, `eslint`, `build` verts à chaque milestone ; chaque feature prouvée par des probes headless avant push |
| Perf | 1 044 → 435 draw calls (−58 %) sur la vue de spawn après la passe d'instancing |

## 2. Architecture

Couches à dépendances strictement descendantes — le moteur ne connaît pas le jeu :

```
ui → gameplay → entities/systems → world → engine → core
```

- **`core/`** : boucle à pas fixe avec interpolation (`GameLoop`), bus d'événements
  typé (`EventBus<GameEvents>`), RNG déterministe seedé, maths.
- **`engine/`** : renderer (ombres PCF, ACES tone-mapping), caméra orbit/chase,
  input sémantique (actions, pas de touches en dur).
- **`world/`** : ville procédurale (grille 10×10, districts, textures canvas
  tileables), ciel/éclairage, aéroport.
- **`entities/` + `systems/`** : chaque feature est un `System` branché dans
  `Game.ts` (composition root) — la boucle de jeu n'est jamais modifiée.
- Communication inter-systèmes uniquement par événements (`crime:committed`,
  `wanted:changed`, `mission:completed`…) : la police, le HUD et les missions ne se
  connaissent pas.
- Tous les réglages gameplay dans un seul fichier : `config/gameConfig.ts`.
- Tout est déterministe depuis `GameConfig.seed`.

## 3. Les milestones, un par un

### M0 — Base jouable (`70693eb`)
Boucle à pas fixe + interpolation de rendu, renderer, pointer lock, caméra 3ᵉ
personne, contrôleur joueur (marche/sprint/saut, collisions AABB contre chaque
bâtiment), première ville procédurale, ciel dégradé, menu/pause/HUD.

### M1 — Une ville vivante (`f171a20`)
Districts zonés depuis le seed (downtown de tours vitrées, anneaux résidentiels,
parcs, plage), textures procédurales sans couture (asphalte, béton, sable, herbe),
props de rue (palmiers, bancs, bornes, poubelles), README illustré.

### M2 — Véhicules (`0b4387b`)
Voitures pilotables au modèle « bicycle » arcade (accélération, freinage, marche
arrière, direction dégressive à haute vitesse), entrée/sortie au contact (`E`),
caméra chase + compteur km/h, trafic autonome : 16 voitures qui suivent les voies,
tournent aux intersections et freinent pour les obstacles — une voiture de trafic
détournée se conduit exactement comme une voiture garée.

### M3 — PNJ & simulation du monde (`e1010e1`)
40 piétons animés (cycle de marche, errance, fuite bras levés devant les voitures),
cycle jour/nuit complet (arc solaire, palettes ciel/brouillard, lampadaires au
crépuscule), mini-map canvas rotative (routes, bâtiments, blips), horloge + argent.

### M4 — Action (`812286e`)
Armes visibles en main (pistolet, mitraillette, bazooka) : hitscan avec flash et
étincelles d'impact, roquettes à explosion de zone ; particules poolées ; points de
vie des voitures → épaves calcinées fumantes ; système de recherche 0–5 étoiles avec
décroissance ; police qui poursuit, encercle et freine dans les virages serrés.

### M5 — Contenu : la mission « Rico » + radio (`dbdd14a`)
- **Première mission scénarisée**, machine à états sur le bus d'événements :
  appel téléphonique de Rico (UI de dialogue) → rejoindre un checkpoint beacon
  pulsant devant la banque → voler la Miura turquoise (nouveau crime = 2 étoiles
  immédiates) → semer la police → livrer au parking de la marina → **+1 500 $**.
  Échec géré : Miura détruite → épave retirée, Rico rappelle plus tard.
- **HUD mission** : dialogue téléphone, ligne d'objectif avec distance en direct,
  bannière succès/échec, blip d'objectif clampé au bord de la mini-map (il pointe
  toujours la direction).
- **Radio en voiture** : touche `R`, 3 stations synthétisées en Web Audio
  (boucles 16 pas kick/hi-hat/basse/lead, déterministes par station) — Asetinos FM
  (synthwave), Radio Playa (offbeat), K-BOOM (drum'n'bass).

### M5.5 — Aéroport & avion (`34a7471`)
- **Aérodrome** à l'est de la grille : piste avec ligne médiane et bandes de seuil,
  tarmac, hangar à toit tonneau, tour de contrôle — solides (collisions) et dessinés
  sur la mini-map étendue.
- **Avion pilotable** en vol arcade : taxi au sol, rotation au-delà de 26 m/s,
  montée/piqué (`Espace`/`Maj`), virages inclinés, décrochage sous 18 m/s, plafond
  160 m. Crash contre un bâtiment ou impact vertical trop dur → explosion, épave
  noircie, pilote éjecté. HUD vitesse + altitude, sortie au sol uniquement.

### M6 — Polish : cinématique & perf (`43cfbef`)
- **Cinématique d'intro** : au clic « Jouer », survol letterboxé sur spline
  Catmull-Rom — haut de la côte → downtown → niveau rue derrière le joueur, le
  regard glissant du centre-ville vers lui. Le monde vit dessous (trafic, piétons) ;
  les entrées joueur sont neutralisées ; n'importe quelle touche passe ; le raccord
  avec la caméra de jeu est invisible.
- **Passe performance mesurée** : pads de trottoir, sols de parcs/plages/places et
  **tous** les props rendus en `InstancedMesh` par pièce (un palmier = 11 pièces
  partagées entre tous les palmiers de la ville). `props.ts` refondu en API de
  pièces (`getPropParts`), désormais 100 % déterministe.
  Résultat : **1 044 → 435 draw calls (−58 %)** sur la même vue.

## 4. Méthode de vérification (à chaque milestone)

1. `tsc --noEmit` + `eslint` + `vite build` verts.
2. **Probes comportementales headless** (Chrome + SwiftShader, sans GPU) : pages
   temporaires qui instancient les systèmes réels et déroulent les scénarios
   synchroniquement — la mission de bout en bout (appel → vol → 2★ → décroissance →
   livraison → récompense, plus le chemin d'échec), l'enveloppe de vol complète
   (décollage, plafond, décrochage, crash), le skip de cinématique, le cycle radio.
   Verdict lu dans `document.title`, fichiers supprimés après.
3. **Screenshots réels** du jeu (SwiftShader) versionnés dans `docs/screenshots/`
   et intégrés au README.
4. Commit détaillé avec section « Verified: », push sur `main`.

Les pièges durement appris (budget de temps virtuel, construction ~22 s sous
SwiftShader, probes synchrones, orientation caméra pour le cadrage) sont documentés
dans `HANDOFF.md` §3.

## 5. Ce qui reste

- **M6.5 — Assets IA** (en pause, décision propriétaire) : remplacer les
  placeholders procéduraux par des assets générés (Tripo pour les meshes,
  ElevenLabs pour les voix radio…). Le design des providers est prêt
  (`docs/AI_ASSETS.md`) ; il manque uniquement les clés API payantes. Le jeu
  tourne déjà entièrement sur les défauts procéduraux.
- **Bonus possibles** : casino/intérieurs, cheat codes, mode photo, missions
  supplémentaires (le `MissionSystem` est réutilisable tel quel), fusion des
  bâtiments par matériau et LOD si une passe perf GPU réelle le justifie.
