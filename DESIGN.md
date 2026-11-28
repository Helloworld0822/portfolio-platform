# Portfolio layout

The seven original Stitch screens are in `docs/stitch/`. The React app shares the home, project list and detail, and blog list and article layouts across desktop and mobile. Shared typography and colors live in `frontend/src/index.css`.

The home uses the original rooftop portrait and loads the introduction and technology groups from the portfolio profile. Experience, projects and posts use the public API. Project cards use the first uploaded image as their cover. Six cards have a labeled AI still life when no image has been attached. The project detail page shows full images and links to the original media.

The portfolio and blog use separate production hosts. Local development serves both sets of routes on the same origin.
