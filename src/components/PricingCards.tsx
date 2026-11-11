import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const plans = [
  {
    name: "Starter",
    description: "An affordable way for an independent rug business to introduce a room-first shopping experience.",
    price: "$20",
    term: "/ month",
    features: ["Public VIZDECK rug visualizer", "Room upload and supplied scenes", "Interactive rug move, rotate and size controls", "A simple launch surface for your collection"],
  },
  {
    name: "Business",
    description: "For retailers ready for a branded launch surface, broader collection support and hands-on rollout guidance.",
    price: "$30",
    term: "/ month",
    features: ["Everything in Starter", "Branded visualizer launch surface", "Collection onboarding guidance", "Priority implementation support"],
  },
];

export function PricingCards() {
  return <div className="v-price-grid">{plans.map((plan, index) => <article className={`v-price-card ${index === 0 ? "v-price-card--featured" : ""}`} key={plan.name}>{index === 0 && <span className="v-price-card__flag">Built for independent rug sellers</span>}<h2>{plan.name}</h2><p>{plan.description}</p><div className="v-price">{plan.price}</div><span className="v-price-card__term">{plan.term}</span><ul className="v-price-list">{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><Link className="v-button v-button--primary" href={index === 0 ? "/products/rug-visualizer" : "/contact"}>{index === 0 ? "Start with VIZDECK" : "Talk to VIZDECK"} <ArrowUpRight size={15}/></Link></article>)}</div>;
}
