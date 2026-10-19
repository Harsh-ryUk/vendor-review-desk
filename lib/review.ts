export type Status = "approved" | "pending" | "rejected";
export type Check = { id: string; label: string; state: "pass" | "review" | "fail"; detail: string; source: string; action?: string };
export type Submission = { legalName: string; email: string; country: string; taxId: string; account: string; bankCode: string };
export type Evidence = {
  kind: "tax" | "bank"; fileName: string; format: string; pages: number; error?: string;
  fields: { legalName?: string; taxId?: string; account?: string; bankCode?: string; validUntil?: string };
};
export type RegistryVendor = { taxId: string; legalName: string; accountKey: string; bankCode: string; runId: string };
export type Stage = { id: string; label: string; state: "running" | "complete"; detail: string; duration?: number };
export type Review = {
  id: string; createdAt: string; status: Status; company: string; input: Submission;
  checks: Check[]; evidence: Evidence[]; stages: Stage[]; duration: number;
  summary: string; response: string; relatedRunId?: string; policyVersion: string;
};
export const POLICY_VERSION = "1.0";
export const STAGES = [
  { id: "intake", label: "Receive submission" },
  { id: "extract", label: "Read documents" },
  { id: "registration", label: "Check registration" },
  { id: "banking", label: "Compare banking details" },
  { id: "registry", label: "Check vendor registry" },
  { id: "save", label: "Record decision" },
];
export function normalizeName(s: string) {
  return s.normalize("NFKC").toUpperCase().replace(/&/g, " AND ")
    .replace(/\bPVT\.?\b/g, "PRIVATE").replace(/\bLTD\.?\b/g, "LIMITED")
    .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
export const normalizeTax = (s: string) => s.toUpperCase().replace(/\s/g, "");
export const normalizeAccount = (s: string) => s.replace(/[\s-]/g, "");
export const maskAccount = (s?: string) => s ? `•••• ${normalizeAccount(s).slice(-4)}` : "Not extracted";

// Indian GSTIN's base-36 check character. This checks structure, not government registration.
export function gstCheckDigit(prefix: string) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let factor = 2, sum = 0;
  for (let i = prefix.length - 1; i >= 0; i--) {
    const value = alphabet.indexOf(prefix[i]) * factor;
    sum += Math.floor(value / 36) + value % 36;
    factor = factor === 2 ? 1 : 2;
  }
  return alphabet[(36 - sum % 36) % 36];
}
export function validTax(tax: string) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(tax)
    && +tax.slice(0, 2) >= 1 && +tax.slice(0, 2) <= 38
    && gstCheckDigit(tax.slice(0, 14)) === tax[14];
}
function make(id: string, label: string, ok: boolean, detail: string, source: string, action?: string): Check {
  return { id, label, state: ok ? "pass" : "review", detail, source, ...(!ok && action ? { action } : {}) };
}
export function intakeChecks(s: Submission): Check[] {
  const required = [s.legalName, s.email, s.country, s.taxId, s.account, s.bankCode].every(x => x.trim());
  return [
    make("fields", "Required details", !!required && s.legalName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email),
      required ? "Company, contact, registration, and banking fields received. Email syntax is checked; ownership is not verified." : "One or more required submission fields are missing.", "Submission form", "Provide a company name, valid contact email, country, tax ID, account number, and IFSC."),
    make("country", "Supported country", s.country === "IN", s.country === "IN" ? "India policy selected." : `Country ${s.country || "not provided"} is outside the current policy.`, "Policy v1.0", "Request a manual review for a country outside India."),
  ];
}
export function documentChecks(evidence: Evidence[], now = new Date()): Check[] {
  return (["tax", "bank"] as const).flatMap(kind => {
    const doc = evidence.find(x => x.kind === kind);
    const label = kind === "tax" ? "Registration document" : "Bank proof";
    if (!doc) return [make(`doc-${kind}`, label, false, "Required document was not supplied.", "Uploaded documents", `Upload the ${kind === "tax" ? "registration certificate" : "bank account proof"}.`)];
    const checks = [make(`doc-${kind}`, label, !doc.error, doc.error || `Read ${doc.fileName} (${doc.format}${doc.pages ? `, ${doc.pages} page${doc.pages === 1 ? "" : "s"}` : ""}).`, doc.fileName, "Provide a readable, text-based PDF, TXT, or JSON document. Scanned PDFs require manual review.")];
    if (doc.fields.validUntil) {
      const value = doc.fields.validUntil;
      const date = new Date(`${value}T23:59:59.999Z`);
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date >= now;
      checks.push(make(`expiry-${kind}`, `${label} validity`, ok, `Document states valid until ${value}; evaluated at ${now.toISOString().slice(0, 10)} UTC.`, doc.fileName, "Provide a current document with a valid YYYY-MM-DD expiry date, or request manual review."));
    }
    return checks;
  });
}
export function registrationChecks(s: Submission, evidence: Evidence[]): Check[] {
  const doc = evidence.find(x => x.kind === "tax");
  const source = doc?.fileName || "Registration document not supplied";
  const name = doc?.fields.legalName;
  const tax = doc?.fields.taxId;
  return [
    make("tax-format", "GSTIN structure & checksum", s.country === "IN" && validTax(normalizeTax(s.taxId)), "The submitted GSTIN is evaluated against the India format, state-code range, and check character. No government lookup is performed.", "Submission form · India policy", "Correct the GSTIN or request manual review. A format check does not confirm active registration."),
    make("registration-name", "Registered company name", !!name && normalizeName(s.legalName) === normalizeName(name), name ? `Form: “${s.legalName}”. Certificate: “${name}”. Punctuation, case, Pvt and Ltd abbreviations are normalized.` : "A registered company name could not be extracted.", source, "Provide a registration document whose legal name matches the submitted company, or explain the difference."),
    make("registration-tax", "Registration number matches", !!tax && normalizeTax(s.taxId) === normalizeTax(tax), tax ? `Form: ${normalizeTax(s.taxId)}. Certificate: ${normalizeTax(tax)}.` : "A tax identifier could not be extracted from the registration document.", source, "Provide a certificate containing the same GSTIN as the submission."),
  ];
}
export function bankingChecks(s: Submission, evidence: Evidence[]): Check[] {
  const doc = evidence.find(x => x.kind === "bank");
  const source = doc?.fileName || "Bank proof not supplied";
  const f = doc?.fields;
  return [
    make("bank-format", "Banking field structure", /^\d{9,18}$/.test(normalizeAccount(s.account)) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.bankCode.toUpperCase()), "Configured policy accepts a 9–18 digit account number and an 11-character IFSC with zero at position five. Bank existence and account ownership are not verified.", "Submission form · India policy", "Provide a 9–18 digit account number and an IFSC in the supported format."),
    make("bank-holder", "Account holder matches company", !!f?.legalName && normalizeName(s.legalName) === normalizeName(f.legalName), f?.legalName ? `Company: “${s.legalName}”. Account holder: “${f.legalName}”.` : "An account holder name could not be extracted.", source, "Provide bank proof in the registered company name, or supporting evidence for manual review."),
    make("bank-account", "Account number matches proof", !!f?.account && normalizeAccount(s.account) === normalizeAccount(f.account), f?.account ? `Form: ${maskAccount(s.account)}. Bank proof: ${maskAccount(f.account)}. The comparison uses the full numbers; only the final four digits are displayed.` : "An account number could not be extracted.", source, "Provide bank proof containing the same account number as the submission."),
    make("bank-code", "IFSC matches proof", !!f?.bankCode && s.bankCode.toUpperCase() === f.bankCode.toUpperCase(), f?.bankCode ? `Form: ${s.bankCode.toUpperCase()}. Bank proof: ${f.bankCode.toUpperCase()}.` : "An IFSC could not be extracted.", source, "Correct the IFSC or provide matching bank proof."),
  ];
}
export function registryCheck(s: Submission, accountKey: string, existing: RegistryVendor | null): Check {
  if (!existing) return make("registry", "Existing vendor check", true, "No previously approved vendor uses this GSTIN.", "Approved vendor registry");
  if (existing.accountKey === accountKey && existing.bankCode === s.bankCode.toUpperCase() && normalizeName(existing.legalName) === normalizeName(s.legalName)) {
    return { id: "duplicate", label: "Duplicate vendor submission", state: "fail", detail: `An approved record already exists for this company, GSTIN, and banking details (${existing.runId}).`, source: "Approved vendor registry", action: `Use the existing approved application ${existing.runId}; a second onboarding is not required.` };
  }
  return make("bank-change", "Existing vendor details changed", false, `This GSTIN already belongs to “${existing.legalName}” (${existing.runId}). The submitted company or banking details differ. Existing banking details have not been changed.`, "Approved vendor registry", "Ask procurement to verify the proposed changes through a known vendor contact before updating the existing record.");
}
export function decision(checks: Check[]): Status {
  // Missing evidence takes precedence over duplicate rejection: do not reject an unreadable application as a proven duplicate.
  if (checks.some(c => c.state === "review")) return "pending";
  if (checks.some(c => c.state === "fail")) return "rejected";
  return "approved";
}
export function explain(s: Submission, checks: Check[], status: Status, id: string) {
  const actions = [...new Set(checks.filter(c => c.state !== "pass").map(c => c.action).filter(Boolean))];
  const summary = status === "approved" ? "The supplied details and documents pass all configured checks."
    : status === "rejected" ? "An approved onboarding record already exists for this vendor."
    : `${checks.filter(c => c.state === "review").length} check${checks.filter(c => c.state === "review").length === 1 ? " needs" : "s need"} attention before this vendor can be approved.`;
  const response = `To: ${s.email}\nSubject: Vendor onboarding ${status} — ${s.legalName}\n\nHello ${s.legalName},\n\n${summary}\n\n${status === "approved" ? "Your submission is approved under our document consistency policy. Procurement may contact you for additional verification before payment." : `Please take the following action${actions.length === 1 ? "" : "s"}:\n${actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`}\n\nReference: ${id}\nProcurement team`;
  return { summary, response };
}
export async function accountFingerprint(account: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeAccount(account)));
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
}
