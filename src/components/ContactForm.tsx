"use client";

import { FormEvent, useState } from "react";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [needsConfiguration, setNeedsConfiguration] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contactEmail) {
      setNeedsConfiguration(true);
      return;
    }

    const values = new FormData(event.currentTarget);
    const name = `${values.get("firstName") ?? ""} ${values.get("lastName") ?? ""}`.trim();
    const message = [
      `Name: ${name}`,
      `Email: ${values.get("email") ?? ""}`,
      `Company: ${values.get("company") ?? ""}`,
      `Website: ${values.get("website") || "Not supplied"}`,
      `Business type: ${values.get("businessType") ?? ""}`,
      "",
      `${values.get("message") ?? ""}`,
    ].join("\n");

    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent("VIZDECK enquiry")}&body=${encodeURIComponent(message)}`;
    setNeedsConfiguration(false);
    setSent(true);
  };

  return <form className="v-contact-form" onSubmit={submit}>
    <label>First name<input required placeholder="Maya" name="firstName"/></label><label>Last name<input required placeholder="Shah" name="lastName"/></label><label>Work email<input required type="email" placeholder="maya@company.com" name="email"/></label><label>Company<input required placeholder="Your business" name="company"/></label><label>Website<input type="url" placeholder="https://" name="website"/></label><label>Business type<select defaultValue="" name="businessType"><option value="" disabled>Choose your business type</option><option>Online rug retailer</option><option>Carpet manufacturer</option><option>Wholesale carpet business</option><option>Flooring retailer</option><option>Interior design practice</option><option>Rug e-commerce brand</option></select></label>
    <label className="wide">What would you like to visualise?<textarea required name="message" placeholder="Tell us about your rug collection, online store, customers or the visualizer experience you want to create."/></label>
    <div className="wide" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}><span className="v-contact-form__note" aria-live="polite">{needsConfiguration ? "Set NEXT_PUBLIC_CONTACT_EMAIL before publishing so customer enquiries can reach your team." : sent ? "Your email app has been opened with the enquiry ready to send." : contactEmail ? "Submitting opens a prefilled enquiry email to the VIZDECK team." : "Set a VIZDECK contact email before publishing this form."}</span><button className="v-button v-button--primary" type="submit" disabled={!contactEmail}>{contactEmail ? "Send enquiry" : "Contact email required"} <span>↗</span></button></div>
  </form>;
}
