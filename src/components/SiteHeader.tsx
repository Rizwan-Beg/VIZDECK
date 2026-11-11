"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand } from "./Brand";
import { navigation, primaryLinks, type NavGroup } from "@/content/navigation";

function NavigationPanel({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const wide = group.links.length > 4;
  return <motion.div id={`nav-${group.label}`} className={`v-nav-popover ${wide ? "v-nav-popover--wide" : ""}`} initial={{ opacity: 0, y: -9, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -7, scale: .985 }} transition={{ duration: .18, ease: [0.22, 1, 0.36, 1] }}>
    <span className="v-nav-popover__label">Explore {group.label}</span>
    {group.links.map((link, index) => <Link href={link.href} onClick={onNavigate} className="v-nav-popover__link" key={link.href}>
      <span className="v-nav-popover__index">{String(index + 1).padStart(2, "0")}</span>
      <span><strong>{link.label}</strong>{link.description && <small>{link.description}</small>}</span>
      <ArrowUpRight size={14}/>
    </Link>)}
  </motion.div>;
}

export function SiteHeader() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const activeGroup = navigation.find((group) => group.label === open);

  const keepOpen = (label: string) => {
    window.clearTimeout(closeTimer.current);
    setOpen(label);
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(null), 150);
  };

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && (setOpen(null), setMobileOpen(false), setMobileGroup(null));
    const closeOnOutside = (event: MouseEvent) => {
      if (railRef.current && !railRef.current.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutside);
    return () => {
      window.clearTimeout(closeTimer.current);
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutside);
    };
  }, []);

  return <header className="v-header" ref={railRef} onMouseLeave={scheduleClose}>
    <div className="v-header__rail">
      <Brand />
      <nav className="v-header__desktop-nav" aria-label="Primary navigation">
        <Link className="v-nav-text-link v-nav-text-link--flagship" href={primaryLinks[0].href}>{primaryLinks[0].label}</Link>
        {navigation.map((group) => <div className="v-nav-group" key={group.label} onMouseEnter={() => keepOpen(group.label)}>
          <button className="v-nav-trigger" type="button" onFocus={() => keepOpen(group.label)} onClick={() => setOpen(open === group.label ? null : group.label)} aria-expanded={open === group.label} aria-controls={`nav-${group.label}`}>
            {group.label}<ChevronDown size={14} aria-hidden="true" className={open === group.label ? "is-open" : ""}/>
          </button>
        </div>)}
        {primaryLinks.slice(1).map((link) => <Link className="v-nav-text-link" href={link.href} key={link.href}>{link.label}</Link>)}
      </nav>
      <div className="v-header__divider"/>
      <Link className="v-button v-button--primary v-header__action" href="/contact">Contact VIZDECK <ArrowUpRight size={15}/></Link>
      <button type="button" className="v-header__menu" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => { setMobileOpen(!mobileOpen); if (mobileOpen) setMobileGroup(null); }}>{mobileOpen ? <X size={20}/> : <Menu size={21}/>}</button>
    </div>
    <AnimatePresence>
      {activeGroup && <div className="v-nav-popover-anchor" onMouseEnter={() => keepOpen(activeGroup.label)}><NavigationPanel group={activeGroup} onNavigate={() => setOpen(null)}/></div>}
    </AnimatePresence>
    <AnimatePresence>
      {mobileOpen && <motion.nav className="v-mobile-nav" aria-label="Mobile navigation" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: .18 }}>
        {primaryLinks.map((link) => <Link className="v-mobile-nav__pricing" href={link.href} key={link.href} onClick={() => setMobileOpen(false)}>{link.label} <ArrowUpRight size={14}/></Link>)}
        {navigation.map((group) => <div className="v-mobile-nav__group" key={group.label}><button type="button" className="v-mobile-nav__group-trigger" aria-expanded={mobileGroup === group.label} onClick={() => setMobileGroup(mobileGroup === group.label ? null : group.label)}>{group.label}<ChevronDown size={16} className={mobileGroup === group.label ? "is-open" : ""}/></button><AnimatePresence>{mobileGroup === group.label && <motion.div className="v-mobile-nav__group-links" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .18 }}>{group.links.map((link) => <Link key={link.href} href={link.href} onClick={() => { setMobileOpen(false); setMobileGroup(null); }}>{link.label}<ArrowUpRight size={14}/></Link>)}</motion.div>}</AnimatePresence></div>)}
        <Link className="v-button v-button--primary" href="/contact" onClick={() => setMobileOpen(false)}>Contact VIZDECK <ArrowUpRight size={15}/></Link>
      </motion.nav>}
    </AnimatePresence>
  </header>;
}
