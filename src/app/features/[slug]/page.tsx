import { redirect } from "next/navigation";

// Keep previously shared feature URLs useful while presenting one coherent product page.
export default function LegacyFeaturePage() {
  redirect("/features");
}
