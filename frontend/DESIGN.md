# Portfolio and blog

The introduction pairs Jaemin’s rooftop portrait with his Korean and English names in one forest-green panel. The photograph keeps its natural proportions. Its dusk colors, a warm paper background and ink-green headings give the portfolio its palette.

The portfolio and blog share the green ink, ivory page, warm white cards, and muted sage surfaces. Use 12px corners for controls, 16px for cards and article images, and 24px for the introductory panel and project dialog. Keep the header and footer on the same site container. Blog articles use a narrower reading column.

Experience follows the introduction. Keep the API’s order. Place the date and organization together above each entry and let the description and uploaded media determine its height. The five technology categories follow with their original logos and nested framework lists. Use deeper variants of the brand colors on the logo glyphs. Keep the category cards neutral so the labels and hierarchy stay legible. Projects are selectable and keep their photos, details and keyboard-accessible dialog.

Use columns where the items remain legible. The phone layout has a single column for experience and projects. Technology families return to one column on small screens. A short reveal and link hover movement respect the reader’s reduced-motion preference.

Brittany Chiang’s compact date-and-description entries influenced the experience section. Lee Robinson’s first-person bio informed the introduction. [Brittany Chiang](https://brittanychiang.com/) · [Lee Robinson](https://leerob.com/)

Motion uses the existing viewport reveal: a 480ms arrival with a 12px rise and cubic-bezier(0.22, 1, 0.36, 1) easing. Related cards follow in 60ms steps capped at 240ms. Clickable project cards lift 3px on pointer hover and settle on press; feedback takes 180ms. This adapts the once-in-view stagger from beui.dev’s text-animation mechanism without splitting text or adding a library. Reduced-motion readers see all content immediately, without translation or scale. Mobile retains the short arrivals and uses press feedback without hover.
