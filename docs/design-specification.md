# Visdeck reconstruction design specification

**Status:** approved reconstruction blueprint; implementation begins only after this document.  
**Reference fidelity goal:** reproduce information architecture, hierarchy, broad layout relationships, and interaction patterns observed on the public reference. Apply a distinct Visdeck identity and independently created assets/copy.

## 1. Component hierarchy

```text
App shell
├── SiteHeader
│   ├── BrandMark (Visdeck)
│   ├── DesktopNavigation
│   │   ├── NavDisclosure ×4
│   │   ├── TextLink (pricing)
│   │   └── PrimaryNavAction (book a walkthrough)
│   └── MobileNavigation
├── PageTemplate
│   ├── HomePage
│   ├── DemoPage
│   │   ├── DemoCategoryPicker
│   │   ├── DemoWorkbench
│   │   └── EmbedPlacementExplorer
│   ├── ProductDetailTemplate
│   ├── FeatureDetailTemplate
│   ├── SolutionDetailTemplate
│   ├── PricingPage
│   ├── ContactPage
│   ├── ContentIndexTemplate
│   └── LegalTemplate
└── SiteFooter
    ├── LanguageSelector
    ├── FooterLinkColumns
    └── LegalUtilityRow
```

Reusable visual modules:

- `PillButton`, `TextArrowLink`, `Eyebrow`, `SectionHeading`, `ProofMetric`
- `ImageCaption`, `MediaFrame`, `FeatureList`, `NumberedSteps`
- `ProductStoryBlock` and `AlternatingMediaStory`
- `FaqAccordion`, `TestimonialRail`, `LogoRail`, `ClosingCta`
- `RoomVisualizerSurface`, `FloorSurface`, `WallSurface`, `RugPlacement`, `ArtPlacement`

## 2. Layout system

### Container and grid

| Token | Desktop | Tablet | Mobile | Use |
| --- | ---: | ---: | ---: | --- |
| `--page-gutter` | 32px | 24px | 16px | edge spacing |
| `--content-max` | 1216px | 100% | 100% | standard text/media container |
| `--reading-max` | 760px | 680px | 100% | prose / FAQ / legal |
| `--header-max` | 836px | calc(100% - 48px) | calc(100% - 32px) | floating rail |
| `--grid-gap` | 24px | 18px | 12px | card/media grids |

- Desktop baseline: **12-column** grid, 24px internal gap.
- Typical text/media pairing: 5/7 or 6/6 columns.
- Home hero: full viewport or minimum 720px desktop; content left 4–5 columns; media fills the canvas.
- Pale editorial hero: 5/7 split, vertically centered, approximately 520–600px desktop section height.
- Most narrative bands: 104–144px vertical padding on desktop, 72–96px tablet, 48–64px mobile.
- Cards retain low visual density: one job per card, generous padding, one media focal point.

### Section rhythm

1. Large headline/promise band
2. Tighter proof/intro band
3. Alternating media-story bands
4. Divider or proof-metric band
5. Conversion/FAQ band
6. Footer

Avoid stacking multiple competing colored cards in a single viewport. Use white, warm mist, deep ink, or one restrained accent per band.

## 3. Visdeck visual tokens

These are intentionally Visdeck-specific rather than copied reference values.

```css
--ink: #17232A;          /* blue-black primary text */
--ink-muted: #5F6C71;    /* supporting text */
--cloud: #F4F4F8;        /* cool pale page base */
--paper: #FFFEFA;        /* warm white surface */
--iris: #7A5AF8;         /* Visdeck primary action */
--iris-deep: #5D3EE6;    /* active state */
--blush: #EBD8E5;        /* restrained highlight */
--mint: #D9E9DF;         /* category/support accent */
--line: rgba(23, 35, 42, .13);
--radius-rail: 28px;
--radius-card: 22px;
--radius-media: 30px;
--radius-button: 999px;
```

### Typography

| Role | Desktop | Mobile | Character |
| --- | --- | --- | --- |
| Hero display | clamp(56px, 6.25vw, 96px) / .96 | 48–58px | modern neo-grotesk, normal/medium weight |
| Editorial accent | same optical scale | same | optional Visdeck serif italic for 1–3 words only |
| H2 | clamp(38px, 4.6vw, 66px) / 1.0 | 34–42px | medium weight, tight tracking |
| H3/card title | 24–32px / 1.08 | 21–27px | medium weight |
| Body lead | 18–21px / 1.42 | 17–18px | readable neutral sans |
| Body | 15–17px / 1.55 | 15–16px | muted color |
| UI/nav | 13–14px | 13px | 500–600 weight |
| Kicker/caption | 11–12px | 10–11px | letter-spaced, not all content uppercase |

Use a self-hosted or licensed geometric/grotesk sans in the final pass. Keep serif usage minimal so Visdeck reads as a distinct brand.

## 4. Responsive rules

| Breakpoint | Behavior |
| --- | --- |
| `>= 1180px` | Full floating header, 12-column grid, image-led hero can occupy viewport, multi-column footer |
| `768–1179px` | Header uses condensed labels/spacing; 8-column grid; two-column sections stay paired where practical |
| `480–767px` | Mobile header; editorial hero stacks copy then media; cards become one column or horizontal scroll rail; footer 2 columns |
| `< 480px` | 16px gutters; compact 48px tap targets; one-column everything; mobile demo panel preserves category state |

No desktop page may be treated as a uniformly scaled-down mobile page. The intended mobile order is: promise → action → media → explanation.

## 5. Motion specification

- Header rail: 180ms ease-out fade/translate, sticky/fixed only when it does not obscure the hero content.
- Disclosure/menu: 180–220ms opacity + 8px vertical movement; no horizontal flyout.
- Section reveal: `opacity 0 → 1`, `y 20px → 0`, 450ms, triggered once when 15% in viewport.
- Card media hover: 350ms scale to 1.02–1.03; text links gain arrow translation of 3px.
- Buttons: 140ms background/shadow/translateY(-1px); maintain high-contrast focus ring.
- Tabs: 160ms active indicator/preview crossfade.
- `prefers-reduced-motion: reduce`: make all visual transition duration 1ms and expose all content immediately.

## 6. Functional specification

### Navigation

- All header/footer links resolve to a local implemented route.
- Data-driven navigation arrays prevent desktop/mobile/footer drift.
- Dropdowns use buttons, not hover-only links; support click/tap, outside click, Escape, and keyboard focus.

### Demo surface

The demo will be a frontend prototype, not a claims-based production visualizer.

| Category | Prototype interaction |
| --- | --- |
| Rugs | select pattern/colorway; drag/rotate/scale a perspective floor rug; optional under-furniture mask layer |
| Furniture | choose a furniture silhouette; drag/rotate/scale; show floor-anchor cue |
| Flooring | change a detected-floor visual overlay texture/tone |
| Wallpaper | change a wall-plane overlay pattern/scale |
| Artwork | choose a frame; drag/scale within the wall safe area |

The page uses the standalone VIZDECK WebGL floor visualizer and connects directly to VIZDECK's bundled `/api/analyze-room` computer-vision backend service when deployed.

### Pricing and form UI

- Currency selection changes locally seeded Visdeck plan values.
- Forms offer native validation but do not submit or transmit information until a service is wired up.
- Form CTAs explain the temporary state in UI/implementation notes.

## 7. Data and route architecture

```text
src/
  app/
    (marketing)/
      page.tsx
      demo/page.tsx
      pricing/page.tsx
      contact/page.tsx
      product/[slug]/page.tsx
      features/[slug]/page.tsx
      solutions/[slug]/page.tsx
      blog/page.tsx
      case-studies/page.tsx
      help/page.tsx
      changelog/page.tsx
      glossary/page.tsx
      about/page.tsx
      compare/page.tsx
      legal/[slug]/page.tsx
  components/
    marketing/
    demo/
    ui/
  content/
    navigation.ts
    products.ts
    features.ts
    solutions.ts
    resources.ts
  store/
    demo-store.ts
```

## 8. QA plan and acceptance criteria

1. Capture the reference and local page at matching 1280×720, 1024×768, 768×1024, and 390×844 viewports.
2. Compare first viewport, hero transition, primary two-column/three-card layout, footer, and mobile menu for each template family.
3. Verify header dropdowns, mobile drawer, tabs, category selector, visualizer manipulation, pricing switcher, testimonials, FAQ, and every link.
4. Verify keyboard navigation, visible focus, semantic headings, labels, and `prefers-reduced-motion` behaviour.
5. Inspect browser console and Next production build; no broken assets, dead routes, or client hydration errors.

### Completion definition

The Visdeck prototype is complete only when every route in the inventory has a real local page/template, global navigation reaches every route, all listed frontend interactions work, it uses original Visdeck assets/copy, and the QA checklist passes at desktop and mobile sizes.
