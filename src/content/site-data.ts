export type ContentPage = {
  eyebrow: string;
  title: string;
  emphasis: string;
  description: string;
  points: string[];
  statistic: string;
  statisticLabel: string;
  accent: "iris" | "mint" | "blush";
};

export const features: Record<string, ContentPage> = {
  "room-understanding": { eyebrow: "01 · Room understanding", title: "Start with the", emphasis: "actual room.", description: "Let a customer upload a room photograph so the rug decision begins with the space they are furnishing.", points: ["Room upload or supplied sample scenes", "Floor geometry used by the placement canvas", "A practical fallback when analysis is unavailable"], statistic: "1 room", statisticLabel: "starts a more informed rug decision", accent: "iris" },
  "floor-detection": { eyebrow: "02 · Floor detection", title: "Find the floor", emphasis: "for the rug.", description: "VIZDECK’s spatial analysis path identifies the usable floor region and returns calibrated geometry and masks for the placement canvas.", points: ["Floor quadrilateral support", "Floor-size metadata", "Mask-aware analysis response"], statistic: "1 floor plane", statisticLabel: "grounds the selected rug", accent: "mint" },
  "rug-placement": { eyebrow: "03 · Rug placement", title: "Place it until", emphasis: "it feels right.", description: "Select a rug then drag, rotate and scale it directly on the WebGL room canvas before committing to the product.", points: ["Interactive drag placement", "Rotation and size controls", "Downloadable room visual"], statistic: "3 controls", statisticLabel: "keep the placement tangible", accent: "blush" },
  "furniture-aware-occlusion": { eyebrow: "04 · Furniture-aware placement", title: "Let the rug sit", emphasis: "with the room.", description: "When room analysis is available, the renderer can carry occlusion information forward so furniture remains part of a believable rug scene.", points: ["Furniture-aware masks", "Rug/floor segmentation support", "Perspective-aware visual layering"], statistic: "1 room", statisticLabel: "keeps furnishings in the picture", accent: "mint" },
  "perspective-and-sizing": { eyebrow: "05 · Perspective and sizing", title: "Make proportion", emphasis: "easier to read.", description: "Use floor-aware rendering and direct size controls to compare a rug’s footprint against the rest of the room.", points: ["Perspective-aware floor canvas", "Rug size adjustments", "Comparison-ready room view"], statistic: "1 canvas", statisticLabel: "brings scale into view", accent: "iris" },
};

export const solutions: Record<string, ContentPage> = {
  "online-rug-retailers": { eyebrow: "For online rug retailers", title: "Make online rug shopping", emphasis: "easier to picture.", description: "Give shoppers a way to see selected rugs in the rooms they already know before they choose a size or design.", points: ["Public, browser-based rug trial", "Product choice beside room context", "A path back to the product page"], statistic: "1 room", statisticLabel: "can answer the hard question", accent: "iris" },
  "carpet-manufacturers": { eyebrow: "For carpet manufacturers", title: "Bring the collection", emphasis: "into the room.", description: "Show the pattern, scale and color of a carpet range in a real interior without relying on a single styled photograph.", points: ["Collection-ready rug samples", "Product dimensions in the visual decision", "Visual exports for customer discussions"], statistic: "1 collection", statisticLabel: "gets more room to be understood", accent: "mint" },
  "wholesale-carpet-businesses": { eyebrow: "For wholesale carpet businesses", title: "Give every buyer", emphasis: "a clearer selling tool.", description: "Help trade partners communicate how a rug might sit in a client’s room while keeping product choice and dimensions in view.", points: ["Room-first sales conversation", "Rug size and placement controls", "Shareable visual output"], statistic: "1 visual", statisticLabel: "supports a more informed discussion", accent: "blush" },
  "flooring-retailers": { eyebrow: "For flooring retailers", title: "Complete the floor", emphasis: "with the right rug.", description: "Offer a complementary rug visualisation experience to help customers consider a rug with the flooring already in their homes.", points: ["Uses a real room photograph", "Complements existing flooring journeys", "Rug-focused product presentation"], statistic: "1 extra layer", statisticLabel: "adds confidence around the floor", accent: "iris" },
  "interior-designers": { eyebrow: "For interior designers", title: "Test rug proportion", emphasis: "with the client room.", description: "Use an interactive room view to explore how a rug’s placement and footprint support a design conversation.", points: ["Upload a client room", "Explore rug position and scale", "Export a visual for review"], statistic: "1 shared view", statisticLabel: "keeps the decision grounded", accent: "mint" },
  "rug-ecommerce-brands": { eyebrow: "For rug e-commerce brands", title: "Turn product browsing", emphasis: "into room confidence.", description: "Keep rug selection close to a visual experience that helps a customer imagine the product at home.", points: ["Embed-ready visualizer architecture", "Rug selection and room placement", "A product-focused public demo"], statistic: "1 product", statisticLabel: "with a real room around it", accent: "blush" },
};

export const displayName = (slug: string) => slug.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
