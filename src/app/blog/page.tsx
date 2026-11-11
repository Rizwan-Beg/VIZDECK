import { journalEntries } from "@/content/resources";
import { ResourceIndex } from "@/components/ResourceIndex";

export default function BlogPage() { return <ResourceIndex eyebrow="VIZDECK journal" title="A few notes from" emphasis="inside the rug decision." description="Original writing about rug visualisation, room context and the small interactions that help customers choose with more confidence." cards={journalEntries}/>; }
