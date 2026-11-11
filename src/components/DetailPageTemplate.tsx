import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ContentPage } from "@/content/site-data";
import { Faq, FaqAccordion } from "./FaqAccordion";
import { Reveal } from "./Reveal";

type DetailKind = "feature" | "solution";

const featureFaqs: Faq[] = [
  { question: "Is this capability available in the live visualizer?", answer: "Yes. VIZDECK’s embedded Rug Visualizer runs this live WebGL engine in the browser. AI room analysis operates through VIZDECK’s dedicated segmentation service, with built-in perspective controls always available as fallback." },
  { question: "Does this require a shopper account?", answer: "No. The public demo is available without a mandatory account so a shopper can explore supplied rooms and the available rug samples." },
  { question: "Can this use a retailer’s collection?", answer: "Yes. VIZDECK supports external product feeds and storefront catalogue APIs so each retailer can configure their own SKU imagery and authoritative dimensions." },
];

const solutionFaqs: Faq[] = [
  { question: "Can the visualizer sit inside an existing website?", answer: "Yes. The current integration architecture supports a dedicated visualizer page and an embedded editor. The exact entry point is shaped around the retailer’s existing customer journey." },
  { question: "What does a shopper do first?", answer: "They can choose a supplied room or upload a room photograph, select a rug and use the editor’s placement, rotation and size controls." },
  { question: "Are results guaranteed to drive a specific commercial outcome?", answer: "No. VIZDECK focuses on helping shoppers make a more informed rug decision. It does not make unsupported conversion, return or revenue guarantees." },
];

export function DetailPageTemplate({ page, kind }: { page: ContentPage; kind: DetailKind }) {
  const heroClass = page.accent === "mint" ? "v-detail-hero--mint" : page.accent === "blush" ? "v-detail-hero--blush" : "";
  const mediaClass = page.accent === "mint" ? "v-detail-hero__media--mint" : page.accent === "blush" ? "v-detail-hero__media--blush" : "";
  const sectionLabel = kind === "feature" ? "Rug visualizer capability" : "A rug-business solution";
  const faqs = kind === "feature" ? featureFaqs : solutionFaqs;

  return <div className="v-page">
    <section className={`v-detail-hero ${heroClass}`}><Reveal className="v-detail-hero__copy"><div className="v-eyebrow">{page.eyebrow}</div><h1 className="v-display">{page.title}<br/><em>{page.emphasis}</em></h1><p className="v-lede">{page.description}</p><div className="v-hero-actions"><Link className="v-button v-button--primary" href="/products/rug-visualizer">Try Rug Visualizer <ArrowUpRight size={15}/></Link><Link className="v-button" href="/contact">Contact VIZDECK</Link></div></Reveal><Reveal className={`v-detail-hero__media ${mediaClass}`} delay={.1}><div className="v-detail-hero__grid"/><div className="v-detail-hero__orb"/></Reveal></section>
    <section className="v-quick-read"><Reveal><h2>A quick read.</h2></Reveal><Reveal><p>{page.description} VIZDECK keeps this capability focused on a single purpose: helping a customer see a rug in a room before they buy.</p><div className="v-takeaways">{page.points.map((point,index) => <div className="v-takeaway" key={point}><span>0{index + 1}</span>{point}</div>)}</div></Reveal></section>
    <section className="v-section v-section--paper"><Reveal><div className="v-eyebrow">{sectionLabel}</div><h2 className="v-heading">The rug should make sense in the <em>room around it.</em></h2></Reveal><div className="v-detail-media-grid">{page.points.map((point,index) => <Reveal className="v-detail-media-card" key={point} delay={index * .05}><div className="v-detail-media-card__art"/><h3>{["Start with the room", "Keep the rug in view", "Make the next choice clearer"][index]}</h3><p>{point}</p></Reveal>)}</div></section>
    <section className="v-section v-section--mint"><div className="v-product-story"><Reveal className="v-product-story__copy"><div className="v-eyebrow">See it working</div><h2 className="v-heading">Try the real rug editor with a <em>room of your own.</em></h2><p className="v-lede">The live editor carries the room upload, supplied samples, rug selection and placement controls in one focused experience.</p><Link className="v-arrow-link" href="/products/rug-visualizer">Open the live Rug Visualizer <ArrowUpRight size={15}/></Link></Reveal><Reveal className="v-media-window v-media-window--room" delay={.1}><div className="v-rug-visual"/><span className="v-media-window__label">Rug placement in context</span></Reveal></div></section>
    <section className="v-section v-section--paper"><div className="v-steps"><Reveal className="v-step"><span>01</span><h3>Choose the room.</h3><p>Start from a supplied scene or a customer photograph to make the visual question specific.</p></Reveal><Reveal className="v-step" delay={.06}><span>02</span><h3>Choose the rug.</h3><p>Keep pattern, colour and available size close to the room as the shopper explores.</p></Reveal><Reveal className="v-step" delay={.12}><span>03</span><h3>Place with confidence.</h3><p>Use the visualizer’s floor-aware controls to explore where the rug belongs.</p></Reveal></div></section>
    <section className="v-section v-section--blush"><Reveal><div className="v-eyebrow">Questions</div><h2 className="v-heading">A few useful <em>answers.</em></h2></Reveal><FaqAccordion items={faqs}/></section>
    <section className="v-section v-section--paper"><div className="v-cta"><Reveal><div className="v-eyebrow">Bring rugs to life</div><h2 className="v-heading">Make the next rug choice <em>easier to picture.</em></h2></Reveal><Reveal className="v-cta__aside"><p className="v-lede">Try the public visualizer, or speak with VIZDECK about connecting it to your rug collection and website.</p><Link className="v-button v-button--primary" href="/contact">Talk to VIZDECK <ArrowUpRight size={15}/></Link></Reveal></div></section>
  </div>;
}
