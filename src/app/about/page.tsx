import Link from "next/link";
import { ArrowUpRight, Check, Eye, MoveDiagonal2, Upload } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Reveal } from "@/components/Reveal";

const steps = [
  { icon: <Upload size={18}/>, number: "01", title: "Start with a real room", copy: "A shopper can choose a supplied room scene or upload the space they are furnishing, so the decision begins in context." },
  { icon: <MoveDiagonal2 size={18}/>, number: "02", title: "Place the selected rug", copy: "They select a rug, then move, rotate and size it in the browser-based room canvas to explore proportion and position." },
  { icon: <Eye size={18}/>, number: "03", title: "Make the choice clearer", copy: "The rug, floor and surrounding furniture stay visible together, creating a useful visual starting point for a purchase or design conversation." },
];

export default function AboutPage() {
  return <PageShell><div className="v-page">
    <section className="v-index-hero"><Reveal><div className="v-eyebrow">About VIZDECK</div><h1 className="v-display">A clearer way to see the rug <em>before it comes home.</em></h1><p className="v-lede">VIZDECK is a focused, AI-assisted rug and carpet visualisation platform. It gives retailers a practical way to bring room context into online rug shopping—starting at $20/month.</p></Reveal></section>

    <section className="v-section v-section--mint"><div className="v-product-story"><Reveal className="v-product-story__copy"><div className="v-eyebrow">Why VIZDECK exists</div><h2 className="v-heading">A rug image is not the same as seeing it <em>at home.</em></h2><p className="v-lede">A customer may love a pattern but still hesitate over scale, floor colour and the furniture already in their room. VIZDECK makes that question visual before the product reaches their door.</p><Link className="v-arrow-link" href="/products/rug-visualizer">Try the Rug Visualizer <ArrowUpRight size={15}/></Link></Reveal><Reveal className="v-media-window v-media-window--room" delay={.1}><div className="v-rug-visual"/><span className="v-media-window__label">A rug, placed in context</span></Reveal></div></section>

    <section className="v-section v-section--paper"><Reveal><div className="v-eyebrow">What the product does</div><h2 className="v-heading">One room-first workflow for a more <em>confident rug decision.</em></h2><p className="v-lede">VIZDECK delivers an interactive WebGL room editor in a focused shopping experience—not a static sales mock-up.</p></Reveal><div className="v-rug-capabilities">{steps.map((step, index) => <Reveal className="v-rug-capability" key={step.title} delay={index * .06}><span>{step.number}</span><div className="v-rug-capability__icon">{step.icon}</div><h3>{step.title}</h3><p>{step.copy}</p></Reveal>)}</div></section>

    <section className="v-section v-section--blush"><div className="v-rug-benefits"><Reveal><div className="v-eyebrow">Built for rug businesses</div><h2 className="v-heading">Useful for smaller collections, not just <em>large enterprise teams.</em></h2><p className="v-lede">The platform is designed for online rug retailers, manufacturers, wholesale teams and designers who want a room-first customer experience without a large up-front visualisation project.</p></Reveal><Reveal className="v-rug-benefits__list" delay={.08}>{["Starter plan at $20/month for a practical, public visualizer.", "Business plan at $30/month for branded rollout guidance.", "Supplied rooms and customer room uploads in the same product flow.", "Interactive rug movement, sizing and rotation in the live editor."].map((benefit) => <div key={benefit}><Check size={16}/><span>{benefit}</span></div>)}</Reveal></div></section>

    <section className="v-section v-section--paper"><div className="v-cta"><Reveal><div className="v-eyebrow">Work with VIZDECK</div><h2 className="v-heading">Give customers a better way to <em>picture the rug.</em></h2></Reveal><Reveal className="v-cta__aside"><p className="v-lede">Explore the real editor, compare plans, or start a conversation about adding VIZDECK to your rug-shopping journey.</p><div className="v-hero-actions"><Link className="v-button v-button--primary" href="/products/rug-visualizer">Try visualizer <ArrowUpRight size={15}/></Link><Link className="v-button" href="/pricing">See pricing</Link></div></Reveal></div></section>
  </div></PageShell>;
}
