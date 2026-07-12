# AI-generated assets

The game treats *where an asset comes from* as an implementation detail. Every asset
is requested through a **provider interface**; the default providers are procedural
(pure code, zero cost, zero network), and AI-backed providers can be swapped in when
API keys are configured.

## The provider pattern

```ts
// src/assets/providers/types.ts
interface ModelProvider {
  getModel(request: ModelRequest): Promise<THREE.Object3D>;
}
interface TextureProvider {
  getTexture(request: TextureRequest): Promise<THREE.Texture>;
}
interface AudioProvider {
  getClip(request: AudioRequest): Promise<AudioBuffer>;
}
```

Game code never calls a provider directly by name; it asks the **asset registry**,
which returns the best available provider for that asset kind:

```ts
const mesh = await assets.models.getModel({ kind: 'sedan', seed: 42 });
```

If no AI provider is configured, the registry returns the procedural one and the game
looks stylised-but-consistent. When a key is present, the AI provider is selected and
its results are cached to disk/localForage so the same request isn't paid for twice.

## Providers matching the experiment

| Kind        | Procedural default            | AI provider (when keyed)              |
| ----------- | ----------------------------- | ------------------------------------- |
| 3D models   | parametric meshes             | Tripo / Meshy (image→mesh)            |
| Textures    | canvas/noise, tileable        | image model (e.g. Nano Banana), seamless |
| SFX/music   | Web Audio synthesis           | ElevenLabs                            |
| Voices      | (none)                        | ElevenLabs TTS                        |
| Cinematics  | in-engine camera path         | video model (e.g. Seedance)           |

## Handling paid APIs safely (best practice)

Provider keys are **secrets** and must not ship in the client bundle. The intended
setup:

1. **Generation is offline / build-time or dev-time.** AI assets are generated ahead
   of play (a small script or dev-only endpoint hits the provider, writes the result
   into `public/assets/generated/`), so the shipped game loads static files and needs
   no keys at runtime.
2. If runtime generation is ever needed, put a **thin server proxy** in front of the
   provider that holds the key and enforces rate/spend limits. The browser calls the
   proxy, never the provider.
3. `public/assets/generated/` is git-ignored (can be large/binary); a manifest of
   what to generate is committed instead so assets are reproducible.

This keeps the repo runnable by anyone (procedural fallback), keeps secrets out of
git and the bundle, and bounds cost.

## Attribution & ethics

AI asset generators are trained on data of uncertain provenance. This project uses
them as an experiment and clearly marks generated content. For any real/shipping use,
verify licensing of the chosen providers and prefer assets you have the rights to.
