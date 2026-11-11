"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .48, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}
