import { ResourceIndex } from "@/components/ResourceIndex";

const cards = [
  { slug:"getting-started",eyebrow:"Getting started",title:"Try the Rug Visualizer",excerpt:"Open the live editor, choose a supplied room and select a rug without creating an account.",href:"/products/rug-visualizer" },
  { slug:"room-upload",eyebrow:"Room upload",title:"Understand room analysis",excerpt:"What happens when an uploaded room photograph reaches VIZDECK’s floor-analysis service and its perspective canvas.",href:"/features" },
  { slug:"retailer-integration",eyebrow:"For retailers",title:"Plan a rug visualizer integration",excerpt:"How the standalone or embedded Rug Visualizer can meet an existing rug catalogue and website.",href:"/contact" },
];
export default function HelpPage() { return <ResourceIndex eyebrow="Documentation" title="Find the next" emphasis="useful answer." description="Practical information for trying the Rug Visualizer and planning a focused rug-business implementation." cards={cards}/>; }
