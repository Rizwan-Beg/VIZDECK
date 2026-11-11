import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageShell } from "./PageShell";
import { ResourceCard } from "@/content/resources";

export function ArticleDetail({ entry, collection }: { entry: ResourceCard; collection: "Journal" | "Stories" }) {
  return <PageShell><article className="v-legal"><div className="v-eyebrow">{collection} · {entry.eyebrow}</div><h1>{entry.title}</h1><p className="v-lede">{entry.excerpt}</p><h2>Start with the rug and the room.</h2><p>Rug shopping becomes more useful when a customer can connect a pattern, proportion and colour to the floor and furniture they already have. A room visualizer keeps that question close to the collection rather than asking customers to imagine it alone.</p><p>This VIZDECK article is original editable seed content for a rug-visualisation platform. It can be replaced by a CMS, retailer writing or live implementation stories when those are ready.</p><h2>Keep the next rug choice close.</h2><p>The strongest interaction keeps the selected rug, room photograph, dimensions and placement controls together. When the visualizer has answered the room question, the customer can return naturally to the rug decision.</p><Link className="v-button v-button--primary" href="/products/rug-visualizer">Try Rug Visualizer <ArrowUpRight size={15}/></Link></article></PageShell>;
}
