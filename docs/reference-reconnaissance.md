# Visdeck reference-reconstruction reconnaissance

**Reference inspected:** publicly available `imersian.com` pages, 10 November 2026  
**Purpose:** define the public-site information architecture and behaviour to reproduce in Visdeck with independently written code, original Visdeck branding/copy, and independently created assets.

## Boundary

This project takes the reference's **general page architecture, section ordering, component roles, responsive behaviour, and interaction patterns** as the benchmark. It does not reuse its source code, logo, photographs, illustrations, videos, customer names/quotes, or marketing text. Measurements below are visual estimates from desktop reference captures and browser inspection—not extracted source code.

## 1. Public route inventory

### Global pages

| Reference route | Visdeck route | Page role | Reconstruction status |
| --- | --- | --- | --- |
| `/` | `/` | Platform home / overview | To rebuild from inventory |
| `/demo` | `/demo` | Category-led live demo and embed-placement explorer | To create |
| `/pricing` | `/pricing` | Two-product commercial comparison and FAQ | To rebuild |
| `/contact` | `/contact` | Sales/contact conversion page | To rebuild |
| `/about` | `/about` | Company overview | To create |
| `/compare` | `/compare` | Comparison/positioning page | To create |
| `/legal/privacy-policy` | `/legal/privacy-policy` | Legal text page | To create |
| `/legal/terms-of-use` | `/legal/terms-of-use` | Legal text page | To create |

### Product family

| Reference route | Visdeck route | Primary interaction / content role |
| --- | --- | --- |
| `/product/visualizer` | `/product/visualizer` | Spatial product placement, category walkthrough, AR and room-clearer explanations |
| `/product/ai-shopping-assistant` | `/product/ai-shopping-assistant` | Conversational discovery, recommendation and visualizer hand-off |
| `/product/ai-product-photography` | `/product/design-studio` | Asset and imagery-generation product story |

### Feature family

| Reference route | Visdeck route | Page type |
| --- | --- | --- |
| `/features/ai-3d-creator` | `/features/ai-3d-creator` | Feature-detail template |
| `/features/augmented-reality` | `/features/augmented-reality` | Feature-detail template |
| `/features/hd-render` | `/features/hd-render` | Feature-detail template |
| `/features/magic-eraser` | `/features/magic-eraser` | Feature-detail template |
| `/features/shopify` | `/features/storefront-integration` | Feature-detail template |
| `/features/spatial-ai` | `/features/spatial-ai` | Feature-detail template |

### Solution family

| Reference route | Visdeck route | Category-specific demo behavior |
| --- | --- | --- |
| `/solutions/rugs` | `/solutions/rugs` | Flat rug anchored to a floor plane; size/colorway switch |
| `/solutions/furniture` | `/solutions/furniture` | 3D object placement and true-scale fit check |
| `/solutions/flooring` | `/solutions/flooring` | Whole detected floor-surface replacement |
| `/solutions/wallpaper` | `/solutions/wallpaper` | Detected wall-surface pattern coverage |
| `/solutions/wall-art` | `/solutions/wall-art` | Wall anchoring and size choice |
| `/solutions/outdoor-furniture` | `/solutions/outdoor-furniture` | Outdoor scene/object placement |

### Resource and content-index family

| Reference route | Visdeck route | Scope for this frontend phase |
| --- | --- | --- |
| `/blog` | `/blog` | Editorial-card index with original seeded entries |
| `/case-studies` | `/case-studies` | Case-study card index with original sample data |
| `/help` | `/help` | Help-center/search presentation surface |
| `/changelog` | `/changelog` | Release-log list |
| `/glossary` | `/glossary` | Alphabetical terminology list |

Individual article, case-study, and help-detail URLs are content-driven and are not enumerated by the main navigation. The implementation should include a reusable detail-page shell after the index pages exist; it must not copy the reference articles.

## 2. Header, navigation, and footer reconnaissance

### Desktop header

- A **floating rounded navigation rail**, visually detached from the viewport edges, sits approximately 24px from the top center of the page.
- On a 1280px desktop capture it is approximately 836px wide and 52px tall; this should be implemented as a capped fluid width rather than a fixed pixel value.
- Order: compact brand mark → Features disclosure → Products disclosure → Solutions disclosure → Resources disclosure → Pricing link → visual divider → high-emphasis contact/sales pill.
- The rail has a softly translucent near-white surface, 24–28px corner radius, thin shadow/border, and a very restrained backdrop effect.
- Header overlays the hero on dark/image-led pages and remains visible on pale pages; the surface preserves contrast in both contexts.
- Main dropdowns open on activation and expose numbered link lists. Only one disclosure is open at a time. Escape and outside click close it.

### Mobile header

- Brand mark and one menu trigger replace the wide rail.
- The expanded menu shows the same hierarchy, with accordion groups for Features, Products, Solutions, and Resources.
- Sales/contact action remains visible or appears as the final primary drawer action.

### Footer

- Large multi-column navigation block: company/utility, feature links, solutions, products, resources, and company links.
- Language selector and city/region/social/legal utility information precede or sit beside the columns, depending on breakpoint.
- The final legal line is visually quiet and separated by a border.
- Visdeck will use its own contact addresses, city, legal copy, and route names.

## 3. Page reconnaissance

### Home (`/`)

1. **Full-viewport visual hero**: image/video background; left-aligned two-line headline; short explanatory paragraph; primary and secondary CTA pair.
2. **Problem framing**: headline plus three editorial problem cards. Each card has icon/graphic, title, supporting copy, and ordinal marker.
3. **Main visualizer product block**: product proposition, three-value list, large product mockup, one deep-dive CTA.
4. **Trust/interlude**: compact brand or partner strip.
5. **AI assistant product block**: explanatory text, benefit list, product CTA, assistant visual.
6. **Visualizer product block**: explanatory text, benefit list, product CTA, mobile/product visual.
7. **Results strip**: single leading metric plus two supporting metrics.
8. **Platform stage**: four editorial product cards—assistant, visualizer, asset/3D creator, studio—each with a visual and deep link.
9. **Testimonial zone**: testimonial heading and carousel/list treatment.
10. **Conversion CTA**: platform trial/demo actions plus short proof points.
11. **Global language and footer region.**

### Live demo (`/demo`)

1. **Pale two-column hero**: large editorial headline on left; descriptive copy and dual CTAs; rounded interior visual on right with a small figure caption.
2. **Five-category picker**: furniture, rugs, flooring, wallpaper, artwork. Every item includes number, title, category-specific description, three small value tags, demo action, and solution link.
3. **Placement explorer**: six tabs for where a retailer can expose the visualizer (button, image, product section, home, product tiles, header); next/previous controls; desktop/mobile switch; copy-link control; simulated storefront preview.
4. **Three-step operating model**: pick category → upload room → place at true scale.
5. **Sales CTA** and FAQ accordion.
6. **Global footer.**

### Visualizer product (`/product/visualizer`)

1. Editorial hero with visual and product proof points.
2. Short quick-read / key-takeaway content block.
3. Alternating explanation-and-media sections: own-room upload, floor/wall geometry, five category coverage cards, AR hand-off, retailer-configurable CTAs and analytics, room-clearing tool.
4. CTA/FAQ/footer progression.

### AI assistant product (`/product/ai-shopping-assistant`)

1. Darker, more kinetic product hero and an explicit scroll invitation.
2. Numbered storytelling sequence around photo analysis, conversational discovery, intent signals, natural-language filters, catalog sync, and visualizer hand-off.
3. Inline simulated assistant UI.
4. Conversion CTA, quick-read content, proof metrics, and how-it-works sequence.

### Feature-detail template (`/features/*`)

1. Concise hero: feature title, one-sentence value proposition, CTA pair.
2. Quick-read and key-takeaway block.
3. Alternating claim/media modules and a metric/proof block.
4. Numbered three-step explanation.
5. Closing CTA / related product link / shared footer.

### Solution-detail template (`/solutions/*`)

1. Concise category hero and category CTA pair.
2. Quick-read and key-takeaway block.
3. Three or four category-specific problem/solution visual modules.
4. Category demo surface.
5. Performance metrics, testimonial carousel, closing CTA and FAQ.

### Pricing (`/pricing`)

1. Centered headline/subtitle.
2. Currency switcher.
3. Two primary product cards, one optionally highlighted; clear term, starting price, quota, inclusion list, and contact CTA.
4. Supporting pricing explanation.
5. FAQ accordion and familiar conversion CTA.

### Contact (`/contact`)

1. Eyebrow, pre-head and sales-oriented headline/copy.
2. Three operating/ROI proof points.
3. Form or booking embed surface.
4. Testimonial carousel.
5. Shared footer.

### Resource and company index pages

- **Blog / case studies:** editorial title, filters or featured card, responsive card grid, CTA, footer.
- **Help / glossary / changelog:** search or category/alpha filter, list layout, sidebar/utility navigation at larger sizes, footer.
- **About / compare:** editorial hero, story/comparison blocks, facts or team/partner treatment, CTA, footer.
- **Legal:** narrow long-form readable text column with the shared header/footer.

## 4. Interaction inventory

| Pattern | Observed reference behavior | Visdeck implementation requirement |
| --- | --- | --- |
| Header disclosure | One numbered navigation panel opens at a time | Accessible button, `aria-expanded`, Escape/outside close, animated height/opacity |
| Mobile nav | Replaces desktop group with a compact control | Focus-trapped slide/drop panel with nested accordions |
| Primary CTAs | Rounded pill; routes to demo/contact or relevant product | Every CTA maps to a local route or in-page dialog; no dead buttons |
| Demo category cards | Launch a category-specific visual experience | Update the local demo state/panel for the chosen category |
| Embed placement tabs | Switch the embedded storefront mockup | Tabs with keyboard support and stateful previews |
| Desktop/mobile toggle | Same embed reflows | Device-size class switches without route reload |
| Pricing currency | Updates visual values | Client state maps an original Visdeck price matrix |
| FAQ | Single/multiple expandable question rows | Accessible accordion with animated panel |
| Testimonial carousel | Slides/scroller | Original Visdeck seed testimonials; controllable carousel with reduced-motion fallback |
| Scroll entrance | Soft opacity/translate reveals | Motion disabled for `prefers-reduced-motion`; no critical content hidden |
| Hover states | Small tonal, scale, underline, or image movement | Respect keyboard focus; no hover-only information |

