import { changelogEntries } from "@/content/resources";
import { ResourceIndex } from "@/components/ResourceIndex";

export default function ChangelogPage() { return <ResourceIndex eyebrow="What’s new" title="A record of the" emphasis="rug visualizer in motion." description="A lightweight release log for VIZDECK’s standalone rug visualizer platform and interactive WebGL room engine." cards={changelogEntries}/>; }
