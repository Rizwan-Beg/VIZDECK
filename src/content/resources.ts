export type ResourceCard = { slug: string; eyebrow: string; title: string; excerpt: string; href: string };

export const journalEntries: ResourceCard[] = [
  { slug: "the-room-is-part-of-the-rug-decision", eyebrow: "Rug retail", title: "The room is part of the rug decision", excerpt: "Why a rug product image needs a clearer bridge to the floor and furniture a customer already has.", href: "/blog/the-room-is-part-of-the-rug-decision" },
  { slug: "designing-for-rug-proportion", eyebrow: "Rug sizing", title: "Designing for rug proportion, not just discovery", excerpt: "How room-aware controls can help a shopper compare a rug’s footprint before delivery day.", href: "/blog/designing-for-rug-proportion" },
  { slug: "from-rug-image-to-room-view", eyebrow: "Rug visualisation", title: "From rug image to room view", excerpt: "How a rug becomes a stronger online shopping experience when floor, furniture and size stay connected.", href: "/blog/from-rug-image-to-room-view" },
];

export const caseStudies: ResourceCard[] = [
  { slug: "a-rug-first-rollout", eyebrow: "Rug launch", title: "A rug-first rollout for a larger collection", excerpt: "An illustrative implementation story showing a focused visualizer launch sequence for a carpet range.", href: "/case-studies/a-rug-first-rollout" },
  { slug: "the-rug-page-room-layer", eyebrow: "Storefront story", title: "Adding a room layer to a rug product page", excerpt: "An illustrative pattern for introducing room confidence without interrupting a considered rug journey.", href: "/case-studies/the-rug-page-room-layer" },
  { slug: "making-a-small-rug-collection-feel-bigger", eyebrow: "Collection story", title: "Making a small rug collection feel bigger", excerpt: "A fictional visual storytelling approach built around a focused rug range and several real rooms.", href: "/case-studies/making-a-small-rug-collection-feel-bigger" },
];

export const glossaryEntries: ResourceCard[] = [
  { slug: "room-layer", eyebrow: "R", title: "Room layer", excerpt: "The customer-facing rug visualisation that brings a room image, selected rug and controls into one experience.", href: "/glossary" },
  { slug: "floor-plane", eyebrow: "F", title: "Floor plane", excerpt: "The visual floor area the rug canvas uses to anchor a rug inside a room photograph.", href: "/glossary" },
  { slug: "rug-state", eyebrow: "R", title: "Rug state", excerpt: "The selected rug, its visual asset, dimensions, rotation and placement carried through the editor.", href: "/glossary" },
];

export const changelogEntries: ResourceCard[] = [
  { slug: "rug-visualizer", eyebrow: "Product · 1.0", title: "Rug Visualizer made the flagship", excerpt: "VIZDECK now leads directly with our native interactive WebGL room editor instead of a static preview.", href: "/products/rug-visualizer" },
  { slug: "rug-first-navigation", eyebrow: "Marketing · 1.0", title: "Rug-first navigation and content", excerpt: "The marketing surface focuses on rug visualisation capabilities and rug-business solutions only.", href: "/" },
  { slug: "standalone-visualizer", eyebrow: "Platform · 1.0", title: "Standalone spatial visualizer architecture", excerpt: "VIZDECK bundles the complete WebGL placement canvas and spatial AI room analyzer as a deployable standalone product.", href: "/products/rug-visualizer" },
];
