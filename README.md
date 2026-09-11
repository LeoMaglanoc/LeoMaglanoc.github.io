# Local development

```bash
docker compose pull
docker compose up

docker compose up jekyll
```

Open the site at:

```text
http://0.0.0.0:8080
```

# Leonardo Maglanoc — personal website

This repository contains Leonardo Maglanoc's personal website and working archive: robotics and AI projects, technical writing, publications, applications, experiments, and interactive browser demos.

The site is built with Jekyll and deployed as a static website. Most of the content is written in Markdown or stored as structured data; the interactive demos run client-side in the browser.

## What is here

- **Projects** — robotics, AI, software, and research project write-ups.
- **Writing** — blog posts, notes, news, and poetry.
- **Academic material** — CV, publications, bibliography, teaching, and profiles.
- **Interactive demos** — browser-based experiments including humanoid locomotion, SLAM, Pong, Flappy Bird, and other small simulations.

The public site is available at [LeoMaglanoc.github.io](https://leomaglanoc.github.io/).

## Repository structure

```text
_pages/                 Main website pages
_projects/              Project narratives
_blogs/                 Blog posts and technical writing
_news/                  News and announcements
_poetry/                Poetry
_bibliography/          Publication records
_data/                  Site and CV data
assets/interactive/     Self-contained browser demos
assets/json/            Structured source material
assets/pdf/             PDF documents, including the CV
docs/                   Technical documentation
_layouts/               Page layouts
_includes/              Shared site components
_sass/                  Site styling
_plugins/               Jekyll plugins and build helpers
```

## Useful commands

Build the site once:

```bash
docker compose run --rm jekyll bundle exec jekyll build
```

Build, test, and serve the deployed SLAM route locally (uses only Docker
containers and mirrors the GitHub Pages publish layout):

```bash
./scripts/preview-slam.sh
```

Open [http://localhost:8080/slam/](http://localhost:8080/slam/). Use
`./scripts/preview-slam.sh --build-only` when you only need the generated
`_site/slam/` files. This preview owns port 8080, so stop `jekyll` first if it
is already running.

Run the G1 browser demo directly, without the Jekyll shell:

```bash
docker compose -f assets/interactive/g1/docker-compose.yml up g1-site
```

Open [http://localhost:8000/assets/interactive/g1/](http://localhost:8000/assets/interactive/g1/).

The G1 policy/model contract tests run in the reproducible tools container:

```bash
docker compose -f assets/interactive/g1/docker-compose.yml run --rm g1-tools \
  python -m unittest discover -s assets/interactive/g1/tests -p 'test_*.py'
```

The main site route for the G1 playground is [/g1/](https://leomaglanoc.github.io/g1/). It uses a fullscreen layout and embeds the static simulator from `assets/interactive/g1/`.

## Interactive demos

### G1 locomotion playground

The G1 demo runs a Unitree G1 12-DoF locomotion stack in the browser:

```text
velocity command
      ↓
47-dimensional observation
      ↓
ONNX policy in ONNX Runtime Web
      ↓
12 leg actions
      ↓
PD controller
      ↓
MuJoCo WASM physics
```

It includes a flat walking area and an optional lightweight terrain course with uneven blocks, a shallow ramp, and low steps. Desktop keyboard controls and mobile touch controls are supported. See [`assets/interactive/g1/README.md`](assets/interactive/g1/README.md) for the runtime contract, model details, controls, and attribution.

Other demos are organized as self-contained projects under [`assets/interactive/`](assets/interactive/). Each demo's local README or Docker configuration is the source of truth for its own commands.

## Editing the site

For normal content changes:

1. Add or edit Markdown in the relevant content directory.
2. Keep dates, titles, roles, project details, and technical claims consistent with the structured source material.
3. Add or update assets under `assets/` when needed.
4. Build the site locally before pushing.

For browser demos, keep demo-specific code, assets, tests, and documentation inside that demo's directory where possible.

## CI and deployment

GitHub Actions builds the Jekyll site, runs the repository's checks, and publishes the generated static site. The workflow definitions are in [`.github/workflows/`](.github/workflows/).

## Attribution

Third-party libraries and assets are documented in the relevant notices files, including [`assets/interactive/g1/THIRD_PARTY_NOTICES.md`](assets/interactive/g1/THIRD_PARTY_NOTICES.md). The repository also retains the project license in [`LICENSE`](LICENSE).
