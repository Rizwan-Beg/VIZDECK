import Link from "next/link";
import { ArrowUpRight, Check, MoveDiagonal2, ScanLine, Upload } from "lucide-react";
import { FaqAccordion } from "@/components/FaqAccordion";
import { PageShell } from "@/components/PageShell";
import { Reveal } from "@/components/Reveal";
import { VizdeckRugVisualizer } from "@/components/VizdeckRugVisualizer";

const capabilities = [
  { icon: <Upload size={18}/>, title: "Start with a real room", copy: "Upload a customer room image or start from a supplied scene without creating an account." },
  { icon: <ScanLine size={18}/>, title: "Read the floor", copy: "VIZDECK’s spatial room-analysis path identifies the usable floor and retains furniture-aware masking when analysis is available." },
  { icon: <MoveDiagonal2 size={18}/>, title: "Make the fit visible", copy: "Select a rug, then drag, resize and rotate it in the actual WebGL room editor." },
];

const questions = [
  { question: "Is this a mock preview?", answer: "No. The editor below is the live VIZDECK room visualizer. Its room selection, product controls, floor placement, WebGL perspective rendering and export actions run right inside the browser." },
  { question: "Can I try it without an account?", answer: "Yes. The rug visualizer is intentionally available from this public page. Choose a supplied room or upload an image to begin." },
  { question: "What happens after a room upload?", answer: "The editor sends the photo to VIZDECK’s room-analysis API, which returns calibrated floor geometry and furniture occlusion masks for the placement canvas. If that service is offline, the editor uses its built-in perspective fallback and explains the state clearly." },
  { question: "Can a retailer connect its own products?", answer: "Yes. VIZDECK supports merchant product feeds and external catalogue APIs so each storefront can sync its own rug SKUs, dimensions, and imagery." },
];

export default function RugVisualizerPage() {
  return <PageShell><div className="v-page">
    <section className="v-editorial-hero v-editorial-hero--product v-rug-hero">
      <Reveal className="v-editorial-hero__copy"><div className="v-eyebrow">VIZDECK Flagship</div><h1 className="v-display">See the rug in <em>the room.</em></h1><p className="v-lede">A real, browser-based rug visualizer for trying a product against the room it is meant for—not a static sales mock-up.</p><div className="v-hero-actions"><a className="v-button v-button--primary" href="#live-editor">Launch the visualizer <ArrowUpRight size={15}/></a><Link className="v-button" href="/pricing">From $20/month</Link></div></Reveal>
      <Reveal className="v-rug-hero__panel" delay={.1}><span>01 / Live capability</span><strong>Upload a room<br/>Place a rug<br/>Make it yours</strong><p>Floor-aware placement, product controls and room analysis live in the editor below.</p></Reveal>
    </section>

    <section id="live-editor" className="v-section v-section--ink v-section--visualizer">
      <Reveal><div className="v-eyebrow v-eyebrow--light">Try it now</div><h2 className="v-heading">A live rug visualizer, ready for <em>real rooms.</em></h2><p className="v-lede">The editor is open to explore. Start with one of its supplied rooms, or upload your own room image for spatial floor detection.</p></Reveal>
      <Reveal delay={.08}><VizdeckRugVisualizer/></Reveal>
    </section>

    <section className="v-section v-section--paper"><Reveal><div className="v-eyebrow">From image to placement</div><h2 className="v-heading">The interaction belongs to the <em>product decision.</em></h2></Reveal><div className="v-rug-capabilities">{capabilities.map((capability, index) => <Reveal className="v-rug-capability" key={capability.title} delay={index * .06}><span>0{index + 1}</span><div className="v-rug-capability__icon">{capability.icon}</div><h3>{capability.title}</h3><p>{capability.copy}</p><Check size={16}/></Reveal>)}</div></section>

    <section className="v-section v-section--mint"><div className="v-product-story"><Reveal className="v-product-story__copy"><div className="v-eyebrow">Designed for the actual workflow</div><h2 className="v-heading">One room, a more <em>confident choice.</em></h2><p className="v-lede">Bring the product, floor and surrounding furniture into the same moment. The editor keeps the physical controls close enough to compare without leaving the decision behind.</p><Link className="v-arrow-link" href="#live-editor">Open the editor <ArrowUpRight size={15}/></Link></Reveal><Reveal className="v-media-window v-media-window--room" delay={.1}><div className="v-rug-visual"/><span className="v-media-window__label">Floor-aware rug placement · from $20/month</span></Reveal></div></section>

    <section className="v-section v-section--blush"><Reveal><div className="v-eyebrow">Questions</div><h2 className="v-heading">The live editor, <em>explained.</em></h2></Reveal><FaqAccordion items={questions}/></section>

    <section className="v-section v-section--paper"><div className="v-cta"><Reveal><div className="v-eyebrow">Bring your catalogue</div><h2 className="v-heading">Ready to make every rug <em>easier to picture?</em></h2></Reveal><Reveal className="v-cta__aside"><p className="v-lede">Start with VIZDECK from $20/month, then grow into a branded collection experience when you are ready.</p><Link className="v-button v-button--primary" href="/pricing">View plans <ArrowUpRight size={15}/></Link></Reveal></div></section>
  </div></PageShell>;
}
