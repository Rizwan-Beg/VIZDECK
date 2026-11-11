import { caseStudies } from "@/content/resources";
import { ResourceIndex } from "@/components/ResourceIndex";

export default function CaseStudiesPage() { return <ResourceIndex eyebrow="VIZDECK stories" title="A closer look at" emphasis="a rug-first launch." description="Original illustrative stories about the rug collection, customer journey and visualizer launch questions a business can work through." cards={caseStudies}/>; }
