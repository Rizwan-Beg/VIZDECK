import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./Brand";
import { footerColumns } from "@/content/navigation";

export function SiteFooter() {
  return <footer className="v-footer">
    <div className="v-footer__top"><div><Brand/><p>AI-powered rug and carpet visualisation, built to be accessible from $20/month.</p></div><div className="v-footer__contact"><span>Bring your rug collection to life.</span><Link className="v-button v-button--primary" href="/pricing">View plans <ArrowUpRight size={15}/></Link></div></div>
    <div className="v-footer__body"><div className="v-footer__utility"><div><span className="v-footer__label">Language</span><span className="v-footer__language">English <span>·</span> Global</span></div><div><span className="v-footer__label">Based in</span><p>Bengaluru<br/>India</p></div></div>
      <div className="v-footer__links">{footerColumns.map((column) => <section key={column.title}><span className="v-footer__label">{column.title}</span>{column.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</section>)}</div>
    </div>
    <div className="v-footer__bottom"><span>© {new Date().getFullYear()} VIZDECK. All rights reserved.</span><span>Rug visualisation for considered homes.</span><span><Link href="/legal/privacy-policy">Privacy</Link> · <Link href="/legal/terms-of-use">Terms</Link></span></div>
  </footer>;
}
