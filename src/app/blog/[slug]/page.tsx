import { notFound } from "next/navigation";
import { ArticleDetail } from "@/components/ArticleDetail";
import { journalEntries } from "@/content/resources";

export function generateStaticParams(){return journalEntries.map(({slug})=>({slug}));}
export default async function BlogArticle({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const entry=journalEntries.find((item)=>item.slug===slug);if(!entry)notFound();return <ArticleDetail entry={entry} collection="Journal"/>;}
