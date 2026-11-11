import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ResourceCard } from "@/content/resources";
import { PageShell } from "./PageShell";
import { Reveal } from "./Reveal";

export function ResourceIndex({ eyebrow, title, emphasis, description, cards }: { eyebrow: string; title: string; emphasis: string; description: string; cards: ResourceCard[] }) {
  return <PageShell><div className="v-page"><section className="v-index-hero"><Reveal><div className="v-eyebrow">{eyebrow}</div><h1 className="v-display">{title}<br/><em>{emphasis}</em></h1><p className="v-lede">{description}</p></Reveal></section><section className="v-section v-section--paper"><div className="v-index-grid">{cards.map((card) => <Reveal className="v-index-card" key={card.slug}><div className="v-index-card__art"/><small>{card.eyebrow}</small><h2>{card.title}</h2><p>{card.excerpt}</p><Link href={card.href}>Explore <ArrowUpRight size={14}/></Link></Reveal>)}</div></section></div></PageShell>;
}
