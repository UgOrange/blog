# Blog Frontend Redesign Design

## Goal

Redesign the bilingual Astro blog as a restrained, content-first personal technical site. The visual language should suggest AI systems, isolation boundaries, and engineering work without naming those metaphors directly or recreating a terminal interface.

The site identity is `ugorange.com`.

## Design Direction

The selected direction is **Minimal Shell**.

- Use a near-black charcoal background instead of pure black.
- Use high-contrast off-white text for headings and comfortable light gray for body copy.
- Use one low-saturation mint green accent for active states, links, and compact metadata.
- Use thin borders and ordered information layers to imply boundaries and controlled execution environments.
- Use monospace type only for navigation, dates, categories, and small interface labels.
- Use a readable sans-serif stack for titles and prose.
- Avoid literal terminal prompts, fake commands, window chrome, `sandbox online` labels, glowing effects, decorative gradients, and excessive animation.

## Information Architecture

The existing routes, content collections, bilingual behavior, RSS, sitemap, SEO metadata, and Giscus integration remain unchanged.

### Header

- Brand: `ugorange.com`.
- Primary links: articles and about.
- Language control: Chinese and English.
- GitHub remains available but should not dominate the header.
- The active route is indicated with text color or a minimal underline, not a large filled control.

### Home Page

- Lead with a short professional positioning statement.
- Introduce Li Changhao as a cloud-native security engineer.
- Describe the subject area through Agent Runtime, container isolation, observability, and AI system security.
- Show the three most recent posts as a linear list.
- Each post row contains date, title, short description, and a restrained directional affordance.
- Do not use hero illustrations or card grids.

### Blog Index

- Use the same linear list language as the home page.
- Keep article images optional and secondary. The list must remain clear when no image exists.
- Show title, date, description, and tags where available.
- Avoid making the first article structurally oversized.

### Article Page

- Use a focused reading column with generous line height and a comfortable maximum width.
- Keep the article title, publication date, update date, and optional hero image clearly separated.
- Style headings, links, lists, tables, blockquotes, inline code, code blocks, and images as one coherent dark reading system.
- Preserve Giscus and visually separate comments from article content with spacing and a thin boundary.

### About Page

- Keep the existing biography and links.
- Replace colorful certification badges with quiet outlined labels.
- Use clear section divisions and the same reading width as articles.

### Footer

- Show copyright, GitHub, email, and RSS in a compact single-level layout.
- Avoid a large gradient or oversized social icons.

## Responsive Behavior

- Desktop content width should stay spacious without becoming full-screen text.
- On small screens, preserve at least 20 pixels of horizontal breathing room.
- Collapse article rows from date/title/arrow to date/title.
- Reduce navigation labels before reducing text legibility.
- Long Chinese and English titles must wrap naturally without clipping.

## Interaction and Accessibility

- Hover and focus states may change color and move by no more than a few pixels.
- Respect `prefers-reduced-motion`.
- Provide visible keyboard focus states.
- Maintain strong contrast for body text, not only headings.
- Decorative images use empty alt text; meaningful article imagery uses the available article title or description.
- Navigation remains usable without client-side JavaScript.

## Component and Style Boundaries

- Consolidate shared tokens and global prose rules in `src/styles/global.css`.
- Keep header and footer presentation inside their existing components.
- Keep page-specific layout rules close to the relevant Astro page or extract a small shared component only when it removes real duplication.
- Do not change content schemas or introduce a UI framework.

## Validation

- Run the Astro production build.
- Check Chinese and English home, blog index, about, and article pages.
- Verify desktop and mobile layouts visually.
- Check navigation active states, language switching, long titles, article images, code blocks, and Giscus spacing.
- Confirm no route, RSS, sitemap, or metadata behavior regresses.

## Out of Scope

- Content rewriting beyond short home-page positioning copy.
- Search, tag filtering, dark/light theme switching, or new client-side application behavior.
- Recreating the reference site's tmux bar, commands, colors, or exact layout.
