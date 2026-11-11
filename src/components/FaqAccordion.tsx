"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";

export type Faq = { question: string; answer: string };

export function FaqAccordion({ items }: { items: Faq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return <div className="v-faq">{items.map((item, index) => <div className="v-faq__item" key={item.question}>
    <button type="button" aria-expanded={openIndex === index} onClick={() => setOpenIndex(openIndex === index ? null : index)}>{item.question}<Plus size={18}/></button>
    <AnimatePresence initial={false}>{openIndex === index && <motion.div className="v-faq__answer" initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:.2}}><p>{item.answer}</p></motion.div>}</AnimatePresence>
  </div>)}</div>;
}
