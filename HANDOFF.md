# HANDOFF — Reprise de session (contexte resetté)

> **Prompt de reprise pour l'utilisateur** : après un `/clear`, dire simplement :
> _« Lis HANDOFF.md et continue le travail (prochaine étape : M6). »_

---

## 1. C'est quoi ce projet ?

**Los Asetinos** — un jeu bac-à-sable open-world style GTA jouable dans le navigateur,
inspiré de la vidéo YouTube « J'ai laissé 24h à Claude pour créer GTA 6 » (transcription
complète : `docs/source-video-transcript.txt`). L'objectif : reproduire le **parcours
d'itérations** de la vidéo (ville → conduite → PNJ → police/armes → mission « Rico » →
aéroport/avion → cinématique), mais avec une **qualité de code niveau studio senior**
(l'utilisateur a demandé : « comme si tu avais 20 ans d'expérience chez Supercell et que
ton équipe allait coder 6 mois dessus »).

### Décisions actées avec l'utilisateur (ne pas re-demander)
- **Stack** : Three.js + TypeScript strict + Vite (choisi explicitement).
- **Assets** : procéduraux (placeholders) maintenant ; les API IA payantes (Tripo,
  ElevenLabs, etc.) seront branchées plus tard derrière des interfaces de provider —
  voir `docs/AI_ASSETS.md`. En cas de blocage paiement/API : trouver une alternative
  de bonne pratique, ne pas bloquer.
- **Git** : commit + push sur `main` à chaque milestone, sur
  `git@github.com:zikmout/ai-video-game.git` (SSH configuré, auth = compte `zikmout`).
- **README illustré** : maintenu à jour avec des screenshots réels du jeu à chaque
  milestone (`docs/screenshots/`), badges, table roadmap.
- Langue : parler **français** à l'utilisateur ; code/docs repo en anglais.

## 2. État actuel — M0 à M5.5 TERMINÉS et poussés

Tout est vert : `npm run typecheck`, `lint`, `build`.

| Milestone | Contenu | Fichiers clés |
|---|---|---|
| **M0** | Boucle fixe + interpolation, Engine, Input (clavier+pointer lock), caméra 3e personne, ville procédurale, ciel dégradé shader, joueur | `core/GameLoop.ts`, `engine/*`, `world/City.ts`, `world/Sky.ts`, `systems/PlayerController.ts` |
| **M1** | Districts (downtown/résidentiel/parc/plage), props (palmiers, bancs, bornes), textures sable, grille 10×10 | `world/districts.ts`, `assets/procedural/props.ts` |
| **M2** | Voitures pilotables (modèle bicycle, E pour monter/sortir, caméra chase, compteur km/h), trafic autonome (16 voitures, voies, virages, freinage obstacle) | `entities/Vehicle.ts`, `systems/VehicleController.ts`, `systems/TrafficSystem.ts`, `assets/procedural/car.ts` |
| **M3** | 40 piétons animés (marche/fuite), cycle jour/nuit (soleil, palette ciel/brouillard, lampadaires au crépuscule), mini-map canvas, HUD horloge+argent | `systems/CrowdSystem.ts`, `systems/DayNightCycle.ts`, `ui/MiniMap.ts`, `entities/Pedestrian.ts` |
| **M4** | Armes (pistolet/SMG/bazooka **visibles en main**, hitscan + roquette AoE), particules poolées, PV/destruction voitures (épaves calcinées fumantes), étoiles de recherche 0-5 avec décroissance, police qui poursuit et encercle | `systems/WeaponSystem.ts`, `systems/ParticleSystem.ts`, `systems/WantedSystem.ts`, `systems/PoliceSystem.ts`, `assets/procedural/guns.ts`, `systems/vehicleCollision.ts` |
| **M5** | Mission « Rico » (appel téléphone → checkpoint beacon → vol de la Miura turquoise = crime `carStolen` 2★ → semer la police → livraison marina → +1 500 $ ; échec si Miura détruite + rappel/retry), radio en voiture (touche R, 3 stations Web Audio procédurales), HUD mission (téléphone, objectif+distance, bannière), blip objectif mini-map clampé au bord | `systems/MissionSystem.ts`, `entities/MissionMarker.ts`, `systems/RadioSystem.ts`, `assets/procedural/music.ts` |
| **M5.5** | Aéroport à l'est de la grille (piste + marquages, hangar toit-tonneau, tour de contrôle, tarmac ; dessiné sur la mini-map), avion pilotable arcade : taxi, rotation au-delà de 26 m/s, montée/piqué/inclinaison, décrochage sous 18 m/s, plafond 160 m, crash (bâtiment ou impact vertical > 8 m/s) → explosion + épave noircie, HUD vitesse+altitude, sortie au sol uniquement | `world/Airport.ts`, `entities/Plane.ts`, `systems/PlaneController.ts`, `assets/procedural/plane.ts` |

### Architecture (résumé — détail dans `docs/ARCHITECTURE.md`)
- Couches à dépendances descendantes : `ui → gameplay → entities/systems → world → engine → core`.
- `Game.ts` = composition root : construit tout, route caméra/HUD selon `isDriving`,
  gate le `PlayerController` quand on conduit. Les features = nouveaux `System`s
  (interface `core/System.ts` : `fixedUpdate`/`update`/`lateUpdate`), jamais toucher la boucle.
- Communication inter-systèmes par `EventBus` typé (`core/events.ts`) :
  `crime:committed`, `wanted:changed`, `gun:fired`, `vehicle:destroyed`, etc.
- Tout est déterministe depuis `GameConfig.seed` (`config/gameConfig.ts` = tous les tunables).
- Flags dev URL : `?play` (skip menu), `?drive` (spawn dans une voiture), `?hour=21` (heure forcée),
  `?mission` (Rico appelle tout de suite), `?mission=go` (saute l'appel, checkpoint direct),
  `?tp=x,z` (téléporte le joueur — cadrage de screenshots), `?fly` (aux commandes de l'avion),
  `?fly=air` (en vol au-dessus de la ville, 60 m, 40 m/s).

## 3. Leçons de vérification (IMPORTANT — évite de re-débugger ça)

La vérification se fait en **Chrome headless + SwiftShader** (pas de GPU) :
```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --window-size=1280,720 \
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
  --screenshot=out.png --virtual-time-budget=1500 "http://localhost:5178/?play"
```
- **La construction du Game prend ~22 s réelles** sous SwiftShader (compilation WebGL
  logicielle). Toujours `timeout 300+` et un `--virtual-time-budget` PETIT (500-1600) —
  un gros budget = des minutes de rendu à ~5 fps. Les probes « sans réponse » = timeout,
  pas un bug du jeu.
- Pour les **probes comportementaux** : page HTML dans `public/probe-*.html` qui importe
  `/src/Game.ts`, fait ses checks **synchrones juste après le constructeur** (pas de
  `setTimeout` — le virtual time ment), écrit le résultat dans `document.title`, lue via
  `--dump-dom | grep -oE '<title>[^<]*</title>'`. **Supprimer le fichier probe après.**
- Les pages probe doivent importer `/src/ui/ui.css` si on veut voir le HUD dans un screenshot
  (c'est `main.ts` qui l'importe normalement).
- Bugs historiques déjà corrigés (ne pas réintroduire) : delta négatif dans `GameLoop`
  (horloge non monotone → clamp `dt >= 0`) ; canal alpha des textures procédurales
  (`addNoise` ne touche plus l'alpha) ; police qui orbitait sa cible (freiner dans les
  virages serrés, `PoliceSystem`).
- `pkill -f "Google Chrome"` si un run headless traîne ; **une seule instance** Chrome
  headless à la fois (elles se marchent dessus).
- Attention au `&` dans les URLs en Bash : mettre l'URL dans une variable quotée.
- **La caméra au repos regarde vers +Z** (pas -Z) : pour cadrer un objet en screenshot
  avec `?tp=x,z`, se placer à un z PLUS PETIT que la cible (l'objet doit être à +Z du joueur).
- Les probes « unité » (machine à états, radio) n'ont pas besoin du Game complet :
  instancier le System directement avec un `EventBus` + `THREE.Scene` nus dans un module
  `src/dev/probe*.ts` importé par la page probe → exécution en <1 s au lieu de ~22 s.

## 4. Workflow par milestone (suivi jusqu'ici — le garder)

1. `TaskCreate` pour les sous-tâches ; serveur : `npx vite --port 5178` en arrière-plan.
2. Coder (config d'abord dans `gameConfig.ts`, puis entities/systems, câbler dans `Game.ts`).
3. `npx tsc --noEmit` + `npx eslint . --ext .ts` + `npx vite build` → tout vert.
4. Probes comportementaux headless (voir §3) → prouver que ça marche, corriger ce qui cloche.
5. Screenshots réels → `docs/screenshots/*.png`, mettre à jour `README.md` (badge milestone,
   features, table screenshots, roadmap) + `docs/ROADMAP.md` (cases cochées).
6. HUD : mettre à jour le label milestone si pertinent (`ui/HUD.ts`).
7. Commit détaillé (feat(...): M_x — ...) avec section "Verified:", et
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, puis `git push origin main`.
8. Résumé en français à l'utilisateur avec ce qui est prouvé/vérifié.

## 5. PROCHAINE ÉTAPE : M6 — Polish & assets IA

Dernier milestone de la roadmap :
1. **Passe perf** : InstancedMesh pour les bâtiments/fenêtres si besoin, LOD/culling,
   viser 60 fps stable (mesurer d'abord — le HUD affiche les fps).
2. **Cinématique d'intro** : survol de la ville caméra scriptée au lancement (spline de
   points de vue, skippable par clic), façon vidéo source.
3. **Providers IA** : brancher les interfaces de `docs/AI_ASSETS.md` (Tripo/meshes,
   ElevenLabs/voix-radio…) derrière les mêmes signatures que les assets procéduraux.
   Sans clé API → fallback procédural silencieux (ne JAMAIS bloquer le jeu).
4. Idées bonus vidéo : casino/intérieurs, cheat codes, mode photo.

## 6. Commandes utiles

```bash
npm run dev          # serveur dev (ouvre le navigateur)
npm run typecheck    # tsc strict
npm run lint         # eslint
npm run build        # tsc + vite build
git log --oneline    # historique des milestones
```

Un doute sur une décision produit → demander à l'utilisateur (il préfère les questions
aux hypothèses). Un doute technique → trancher soi-même selon les conventions ci-dessus.
