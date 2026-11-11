import { notFound } from "next/navigation";
import { DetailPageTemplate } from "@/components/DetailPageTemplate";
import { PageShell } from "@/components/PageShell";
import { solutions } from "@/content/site-data";

export function generateStaticParams() { return Object.keys(solutions).map((slug) => ({ slug })); }

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = solutions[slug];
  if (!page) notFound();
  return <PageShell><DetailPageTemplate page={page} kind="solution"/></PageShell>;
}
