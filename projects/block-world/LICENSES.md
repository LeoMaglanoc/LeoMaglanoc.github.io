# Licenses and asset provenance

Game code, texture atlas, robot geometry, UI and audio are original contributions
to this repository and follow its root license. No Minecraft/Mojang assets,
fonts, sounds, robot models, or other game assets were copied.

Godot 4.7.2 and its web runtime are MIT licensed. The complete engine license and
bundled third-party notices accompany the web export as `ENGINE-LICENSE.txt`
and `GODOT-THIRD-PARTY-NOTICES.txt`. The engine and templates are downloaded from
the official Godot release during the Docker build.

The original 64×64 atlas contains twelve 16×16 tiles and four unused tiles, with
nearest-neighbor sampling. Effects use Web Audio oscillator tones generated
locally. Fonts use the browser's system font stack and Godot's bundled default
font, covered by its third-party notices.

Development-only dependencies: Playwright (Apache-2.0), Debian/Python/Jekyll
container dependencies (their respective upstream licenses); these are not
included as game runtime dependencies.
