import { Resend } from "resend";

/** Send a plain-text email. Without a Resend key (demo, development) it is printed instead. */
export async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`[email] to=${to} subject="${subject}"\n${text}`); return; }
  const from = process.env.EMAIL_FROM; // e.g. "Cadence <hello@your-domain>", a domain verified in Resend
  if (!from) throw new Error("EMAIL_FROM is not set; it is required when RESEND_API_KEY is.");
  const { error } = await new Resend(key).emails.send({ from, to, subject, text });
  if (error) throw new Error(`Email failed: ${error.message}`);
}
