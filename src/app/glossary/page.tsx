import { glossaryEntries } from "@/content/resources";
import { ResourceIndex } from "@/components/ResourceIndex";

export default function GlossaryPage() { return <ResourceIndex eyebrow="VIZDECK glossary" title="Words for the" emphasis="rug visualizer." description="A concise shared language for teams shaping a room-aware rug-shopping experience." cards={glossaryEntries}/>; }
