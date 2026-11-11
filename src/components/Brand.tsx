import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return <Link className={`brand ${light ? "brand--light" : ""}`} href="/" aria-label="VIZDECK home"><span className="brand__glyph"><i/><i/><i/></span><span>VIZDECK</span></Link>;
}
