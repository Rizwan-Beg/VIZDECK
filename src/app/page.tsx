import Link from "next/link";
import { ArrowUpRight, Check, Eye, Layers3, MoveDiagonal2, Ruler, ScanLine, Upload } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Reveal } from "@/components/Reveal";
import { VizdeckRugVisualizer } from "@/components/VizdeckRugVisualizer";

const workflow = [
  { icon: <Upload size={19}/>, title: "Upload a room", copy: "Start with a living room, bedroom or dining area a customer actually knows." },
  { icon: <Layers3 size={19}/>, title: "Select a rug", copy: "Browse the available rug samples and choose the pattern that belongs in the room." },
  { icon: <MoveDiagonal2 size={19}/>, title: "Customise placement", copy: "Move, rotate and adjust the rug’s footprint directly on the room canvas." },
  { icon: <Eye size={19}/>, title: "Visualise", copy: "Review the rug in context, then export the visual or continue the product decision." },
];

const features = [
  { icon: <ScanLine size={20}/>, title: "AI-powered room understanding", copy: "VIZDECK’s spatial analysis flow reads floor geometry and furniture contours from an uploaded room when its AI analyzer is running." },
  { icon: <Ruler size={20}/>, title: "Perspective-aware rug placement", copy: "A floor-aware WebGL canvas helps a selected rug sit in the correct part of the room." },
  { icon: <Layers3 size={20}/>, title: "Furniture-aware occlusion", copy: "Supported room masks keep furniture context in the placement scene rather than treating the room as empty." },
  { icon: <MoveDiagonal2 size={20}/>, title: "Interactive size and position", copy: "Shoppers can compare rug scale and placement with direct, tactile controls." },
];

const audiences = [
  ["Online rug retailers", "Give every product page a more useful room moment."],
  ["Carpet manufacturers", "Show a collection at believable scale in the spaces it is made for."],
  ["Wholesale carpet businesses", "Help trade buyers communicate a clearer visual recommendation."],
  ["Flooring retailers", "Offer a complementary rug experience around a customer’s existing floor."],
  ["Interior designers", "Explore rug proportion with a client room before the final selection."],
  ["Rug e-commerce brands", "Bring the confidence of an in-store conversation to online browsing."],
];

const solutionSlugs = ["online-rug-retailers", "carpet-manufacturers", "wholesale-carpet-businesses", "flooring-retailers", "interior-designers", "rug-ecommerce-brands"];

export default function Home() {
  return <PageShell><div className="v-page">
    <section className="v-home-hero v-home-hero--rug">
      <div className="v-home-hero__media"/><div className="v-home-hero__grain"/>
      <Reveal className="v-home-hero__content"><div className="v-eyebrow v-eyebrow--light">AI-powered rug & carpet visualisation</div><h1 className="v-display">Let your customers see every rug in <em>their own space.</em></h1><p className="v-lede">VIZDECK gives rug and carpet businesses a live, interactive way for customers to upload a room, explore a collection and picture a rug before they buy.</p><div className="v-hero-actions"><a className="v-button v-button--paper" href="#live-visualizer">Try live Rug Visualizer <ArrowUpRight size={15}/></a><Link className="v-button v-button--light" href="/pricing">Plans from $20/month</Link></div></Reveal>
      <Reveal className="v-home-hero__room-note" delay={.14}><span>ROOM + RUG</span><strong>Show the choice<br/>in context.</strong><p>Real room upload · interactive placement</p><b>From $20/month</b></Reveal>
      <span className="v-hero-caption"><i>Live product</i> Upload a room, choose a rug and place it on the actual floor.</span>
    </section>
    <Link className="v-help-pill" href="/contact">Talk rugs with us</Link>

    <section id="live-visualizer" className="v-section v-section--ink v-section--visualizer">
      <Reveal><div className="v-eyebrow v-eyebrow--light">Try it without an account</div><h2 className="v-heading">The Rug Visualizer is the <em>main event.</em></h2><p className="v-lede">This is the live VIZDECK interactive WebGL room editor—not a sales demo. Choose a supplied room or upload your own, select a rug and use the live placement tools. VIZDECK plans start at $20/month.</p></Reveal>
      <Reveal delay={.08}><VizdeckRugVisualizer/></Reveal>
    </section>

    <section id="how-it-works" className="v-section v-section--paper"><Reveal><div className="v-eyebrow">How it works</div><h2 className="v-heading">From room photo to a more <em>confident rug choice.</em></h2><p className="v-lede">Four simple steps keep the customer’s room, the rug and the final decision in one place.</p></Reveal><div className="v-rug-workflow">{workflow.map((step, index) => <Reveal className="v-rug-workflow__step" key={step.title} delay={index * .06}><span>0{index + 1}</span><div>{step.icon}</div><h3>{step.title}</h3><p>{step.copy}</p></Reveal>)}</div></section>

    <section className="v-section v-section--blush"><Reveal><div className="v-eyebrow">Core capabilities</div><h2 className="v-heading">Built for the details that make a rug <em>feel at home.</em></h2></Reveal><div className="v-rug-feature-grid">{features.map((feature, index) => <Reveal className="v-rug-feature-card" key={feature.title} delay={index * .05}><div className="v-rug-feature-card__icon">{feature.icon}</div><h3>{feature.title}</h3><p>{feature.copy}</p><Link href="/features">See all features <ArrowUpRight size={14}/></Link></Reveal>)}</div></section>

    <section className="v-section v-section--paper"><div className="v-before-after"><Reveal className="v-before-after__copy"><div className="v-eyebrow">From photograph to visualisation</div><h2 className="v-heading">A room photo becomes a working <em>rug decision.</em></h2><p className="v-lede">There is no artificial product scene to imagine. Start with the room, bring in the rug and adjust its placement where it matters.</p><a className="v-arrow-link" href="#live-visualizer">See the live transformation <ArrowUpRight size={15}/></a></Reveal><Reveal className="v-before-after__views" delay={.1}><div className="v-before-after__view v-before-after__view--before"><span>Before</span><strong>Room photograph</strong></div><div className="v-before-after__divider">→</div><div className="v-before-after__view v-before-after__view--after"><span>In the visualizer</span><strong>Rug placed in context</strong><i>Use the live editor above to move, size and rotate the selected rug.</i></div></Reveal></div></section>

    <section className="v-section v-section--mint"><Reveal><div className="v-eyebrow">Made for rug businesses</div><h2 className="v-heading">One focused product for every business that <em>sells rugs.</em></h2></Reveal><div className="v-rug-audience-grid">{audiences.map(([title, copy], index) => <Reveal className="v-rug-audience-card" key={title} delay={index * .04}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p><Link href={`/solutions/${solutionSlugs[index]}`}>See the solution <ArrowUpRight size={14}/></Link></Reveal>)}</div></section>

    <section className="v-section v-section--paper"><div className="v-rug-benefits"><Reveal><div className="v-eyebrow">Built to be accessible</div><h2 className="v-heading">Make rug shopping feel less <em>uncertain—without enterprise pricing.</em></h2><p className="v-lede">VIZDECK starts at $20/month, so independent rug stores can offer a room-first buying experience without a large implementation budget.</p></Reveal><Reveal className="v-rug-benefits__list" delay={.08}>{["Help customers picture a rug in their own room.", "Keep colour, pattern, proportion and surrounding furniture in view.", "Give custom-size and collection conversations a visual starting point.", "Launch an interactive rug-shopping experience from $20/month."].map((benefit) => <div key={benefit}><Check size={16}/><span>{benefit}</span></div>)}</Reveal></div></section>

    <section className="v-section v-section--blush"><div className="v-rug-integrations"><Reveal><div className="v-eyebrow">Integrations</div><h2 className="v-heading">Designed to meet the rug catalogue <em>where it lives.</em></h2><p className="v-lede">The working visualizer can be presented as a standalone page or embedded in an existing store. Catalogue and storefront connections are scoped with each business.</p></Reveal><Reveal className="v-rug-integration-list" delay={.08}><div><strong>Embedded visualizer</strong><span>Available now</span><p>Launch the live editor from a product page, campaign or dedicated visualizer page.</p></div><div><strong>Custom e-commerce sites</strong><span>Integration planning</span><p>Connect the visualizer launch surface to the journey your team already uses.</p></div><div><strong>Shopify & WooCommerce</strong><span>Planned</span><p>Retail-platform connectors are not advertised as active until they are implemented and tested.</p></div></Reveal></div></section>

    <section className="v-section v-section--paper"><div className="v-cta"><Reveal><div className="v-eyebrow">Experience rugs before they buy</div><h2 className="v-heading">Let your customers see the rug in <em>their own space.</em></h2></Reveal><Reveal className="v-cta__aside"><p className="v-lede">Try the working visualizer now, or launch a room-first shopping experience from $20/month.</p><div className="v-hero-actions"><a className="v-button v-button--primary" href="#live-visualizer">Try Rug Visualizer <ArrowUpRight size={15}/></a><Link className="v-button" href="/pricing">View $20 plan</Link></div></Reveal></div></section>
  </div></PageShell>;
}
