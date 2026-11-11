import { notFound } from "next/navigation";
import { ArticleDetail } from "@/components/ArticleDetail";
import { caseStudies } from "@/content/resources";

export function generateStaticParams(){return caseStudies.map(({slug})=>({slug}));}
export default async function CaseStudy({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const entry=caseStudies.find((item)=>item.slug===slug);if(!entry)notFound();return <ArticleDetail entry={entry} collection="Stories"/>;}
