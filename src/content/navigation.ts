export type NavLink = { label: string; href: string; description?: string };
export type NavGroup = { label: string; links: NavLink[] };

export const navigation: NavGroup[] = [
  {
    label: "Solutions",
    links: [
      { label: "Online Rug Retailers", href: "/solutions/online-rug-retailers", description: "Bring room confidence to product browsing." },
      { label: "Carpet Manufacturers", href: "/solutions/carpet-manufacturers", description: "Show collections in the spaces they are made for." },
      { label: "Wholesale Carpet Businesses", href: "/solutions/wholesale-carpet-businesses", description: "Give trade buyers a clearer selling tool." },
      { label: "Flooring Retailers", href: "/solutions/flooring-retailers", description: "Extend a flooring offer with complementary rugs." },
      { label: "Interior Designers", href: "/solutions/interior-designers", description: "Test rug proportion within a client room." },
      { label: "Rug E-commerce Brands", href: "/solutions/rug-ecommerce-brands", description: "Make online rug shopping more visual." },
    ],
  },
];

export const primaryLinks: NavLink[] = [
  { label: "Rug Visualizer", href: "/products/rug-visualizer" },
  { label: "Features", href: "/features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
];

export const footerColumns: { title: string; links: NavLink[] }[] = [
  { title: "VIZDECK", links: [{ label: "About", href: "/about" }, { label: "Pricing", href: "/pricing" }, { label: "Contact", href: "/contact" }] },
  { title: "Rug Visualizer", links: [{ label: "Try the live visualizer", href: "/products/rug-visualizer" }, { label: "How it works", href: "/#how-it-works" }, { label: "Documentation", href: "/help" }] },
  { title: "Features", links: [{ label: "All Rug Visualizer features", href: "/features" }] },
  { title: "Solutions", links: navigation[0].links },
];
