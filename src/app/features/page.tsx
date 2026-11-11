import Link from "next/link";
import { ArrowUpRight, Check, Download, MousePointer2, ScanLine, ShieldCheck, Upload } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Reveal } from "@/components/Reveal";

const features = [
  {
    icon: <Upload size={20}/>,
    number: "01",
    title: "Room upload and supplied scenes",
    copy: "A shopper can begin with a provided room scene or upload a photo of the room they want to furnish. The visualizer keeps that room as the working canvas for the rug decision.",
  },
  {
    icon: <ScanLine size={20}/>,
    number: "02",
    title: "AI-assisted floor reading",
    copy: "When the VIZDECK room-analysis service is connected, the upload flow returns floor support and occlusion masks for the placement canvas. If analysis is offline, the editor retains its perspective fallback.",
  },
  {
    icon: <MousePointer2 size={20}/>,
    number: "03",
    title: "Live rug placement controls",
    copy: "Select a rug, then drag, scale and rotate it directly in the browser-based room canvas. This puts placement and proportion beside the room rather than in a separate static mock-up.",
  },
  {
    icon: <ShieldCheck size={20}/>,
    number: "04",
    title: "Room-aware visual context",
    copy: "The editor is built around the floor, surrounding furniture and the room photograph so the rug is considered as part of the space—not as an isolated catalogue image.",
  },
  {
    icon: <Download size={20}/>,
    number: "05",
    title: "Visual output for the decision",
    copy: "Once the rug is placed, VIZDECK’s live WebGL editor exports a high-resolution visual result for the shopper’s review or a sales and design conversation.",
  },
];

export default function FeaturesPage() {
  return <PageShell><div className="v-page">
    <section className="v-editorial-hero v-editorial-hero--product v-rug-hero">
      <Reveal className="v-editorial-hero__copy"><div className="v-eyebrow">VIZDECK Rug Visualizer</div><h1 className="v-display">Everything the rug decision <em>needs in one place.</em></h1><p className="v-lede">One focused feature set for seeing a rug in a real room—from upload and floor reading to hands-on placement and visual output.</p><div className="v-hero-actions"><Link className="v-button v-button--primary" href="/products/rug-visualizer">Try the visualizer <ArrowUpRight size={15}/></Link><Link className="v-button" href="/pricing">From $20/month</Link></div></Reveal>
      <Reveal className="v-rug-hero__panel" delay={.1}><span>ONE PRODUCT · FIVE CAPABILITIES</span><strong>Upload<br/>Place<br/>Decide</strong><p>Room context, interactive controls and an approachable monthly price—without a collection of disconnected feature pages.</p></Reveal>
    </section>

    <section className="v-section v-section--paper"><Reveal><div className="v-eyebrow">How the product works</div><h2 className="v-heading">Real capabilities, designed around a <em>real rug purchase.</em></h2><p className="v-lede">VIZDECK runs its interactive WebGL room visualizer natively in the browser—not a generic AI showcase or a static before-and-after image.</p></Reveal><div className="v-rug-capabilities v-rug-capabilities--five">{features.map((feature, index) => <Reveal className="v-rug-capability" key={feature.title} delay={index * .05}><span>{feature.number}</span><div className="v-rug-capability__icon">{feature.icon}</div><h3>{feature.title}</h3><p>{feature.copy}</p></Reveal>)}</div></section>

    <section className="v-section v-section--mint"><div className="v-rug-benefits"><Reveal><div className="v-eyebrow">Built for affordability</div><h2 className="v-heading">A useful rug visualizer should not be <em>out of reach.</em></h2><p className="v-lede">The VIZDECK Starter plan is $20/month. It gives smaller retailers a clear way to introduce room visualisation without a large enterprise commitment.</p></Reveal><Reveal className="v-rug-benefits__list" delay={.08}>{["One focused rug visualizer experience.", "Room upload and interactive rug placement.", "A polished public surface for customers to explore.", "A sensible starting point at $20 per month."].map((benefit) => <div key={benefit}><Check size={16}/><span>{benefit}</span></div>)}</Reveal></div></section>

    <section className="v-section v-section--blush"><div className="v-cta"><Reveal><div className="v-eyebrow">See it in action</div><h2 className="v-heading">Make every rug easier to <em>picture at home.</em></h2></Reveal><Reveal className="v-cta__aside"><p className="v-lede">Explore the live visualizer or review the simple $20/month Starter plan.</p><div className="v-hero-actions"><Link className="v-button v-button--primary" href="/products/rug-visualizer">Open visualizer <ArrowUpRight size={15}/></Link><Link className="v-button" href="/pricing">View pricing</Link></div></Reveal></div></section>
  </div></PageShell>;
}
