import { SCENARIOS } from "../../../lib/scenarios";
import { policyChecks } from "../../../lib/vendor-policy";
import { env } from "cloudflare:workers";
import { extractDocument } from "../../../lib/extract";
import { STAGES, POLICY_VERSION, accountFingerprint, maskAccount, normalizeTax, intakeChecks, documentChecks, registrationChecks, bankingChecks, registryCheck, decision, explain, type Review, type Submission, type Check, type RegistryVendor, type Stage } from "../../../lib/review";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    if (!env.DB) return json({ error: "Database is not configured." }, 503);
    const rows = await env.DB.prepare("SELECT data FROM reviews ORDER BY created_at DESC LIMIT 200").all<{data: string}>();
    return json({ reviews: rows.results.map(x => JSON.parse(x.data)) });
  } catch { return json({ error: "Run history could not be loaded. Please retry." }, 503); }
}
export async function POST(request: Request) {
  if (!env.DB) return json({ error: "Database is not configured." }, 503);
  const declaredSize = +(request.headers.get("content-length") || 0);
  if (declaredSize > 5 * 1024 * 1024) return json({ error: "Submission exceeds 5 MB." }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Expected a multipart form submission." }, 400); }
  const input = Object.fromEntries(["legalName", "email", "country", "taxId", "account", "bankCode"].map(key => [key, String(form.get(key) || "").trim()])) as Submission;
  input.serviceCategory = String(form.get('serviceCategory') || 'general').trim();
  if (Object.values(input).some(x => x.length > 200)) return json({ error: "Form fields must be 200 characters or fewer." }, 400);
  input.taxId = normalizeTax(input.taxId);
  input.bankCode = input.bankCode.toUpperCase();
  input.country = input.country.toUpperCase();
  const files = (["tax", "bank"] as const).flatMap(kind => {
    const file = form.get(kind);
    return file instanceof File && file.size > 0 ? [{kind, file}] : [];
  });
  if (files.some(x => x.file.size > 2 * 1024 * 1024)) return json({ error: "Each document must be 2 MB or smaller." }, 413);
  const demoScenario = SCENARIOS.find(s => s.id === form.get("demoScenario"));
  const demoSuite = String(form.get("demoSuite") || "");
  const sample = demoScenario && /^[a-zA-Z0-9-]{1,40}$/.test(demoSuite) ? {scenarioId: demoScenario.id, label: demoScenario.name, suiteId: demoSuite} : undefined;
  const id = `VR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const db = env.DB;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: unknown) => { try { controller.enqueue(encoder.encode(JSON.stringify(data) + "\n")); } catch { /* A disconnected viewer can reopen the saved run. */ } };
      const started = Date.now();
      const stages: Stage[] = [];
      const checks: Check[] = [];
      async function stage<T>(index: number, detail: string, operation: () => Promise<T> | T) {
        const time = Date.now();
        emit({ type: "stage", stage: { ...STAGES[index], state: "running", detail } });
        const value = await operation();
        const entry: Stage = { ...STAGES[index], state: "complete", detail, duration: Date.now() - time };
        stages.push(entry);
        emit({ type: "stage", stage: entry });
        return value;
      }
      try {
        emit({ type: "start", id, createdAt });
        await stage(0, `${input.legalName || "Unnamed company"} · ${files.length} document${files.length === 1 ? "" : "s"} received`, () => { checks.push(...intakeChecks(input)); });
        const evidence = await stage(1, "Reading uploaded files and extracting labelled fields", async () => {
          const result = [];
          // Sequential extraction bounds Worker memory when two PDFs are uploaded.
          for (const item of files) result.push(await extractDocument(item.file, item.kind));
          checks.push(...documentChecks(result, new Date(createdAt)));
          return result;
        });
        await stage(2, "Comparing the company name and GSTIN with the certificate", () => { checks.push(...registrationChecks(input, evidence)); });
        await stage(3, "Comparing the full account number, holder, and IFSC with bank proof", () => { checks.push(...bankingChecks(input, evidence)); });
        const accountKey = await accountFingerprint(input.account);
        const lookup = async () => db.prepare("SELECT tax_id AS taxId, legal_name AS legalName, account_key AS accountKey, bank_code AS bankCode, run_id AS runId FROM vendors WHERE tax_id = ?").bind(input.taxId).first<RegistryVendor>();
        let existing: RegistryVendor | null = null;
        await stage(4, "Checking policy references, service category, and approved vendor registry", async () => {
          checks.push(...policyChecks(input, evidence));
          existing = await lookup();
          checks.push(registryCheck(input, accountKey, existing));
        });
        let status = decision(checks);
        const safeEvidence = evidence.map(doc => ({ ...doc, fields: { ...doc.fields, ...(doc.fields.account ? { account: maskAccount(doc.fields.account) } : {}) } }));
        function buildReview(): Review {
          return { id, createdAt, company: input.legalName || "Unnamed company", status, input: { ...input, account: maskAccount(input.account) }, evidence: safeEvidence, checks, stages, duration: Date.now() - started, policyVersion: POLICY_VERSION, ...(sample ? {sample} : {}), ...explain(input, checks, status, id), ...(existing ? { relatedRunId: existing.runId } : {}) };
        }
        let review: Review = buildReview();
        await stage(5, "Saving the decision, evidence, and vendor response to the audit trail", async () => {
          const save = () => db.prepare("INSERT INTO reviews (id, created_at, company, status, data) VALUES (?, ?, ?, ?, ?)").bind(id, createdAt, review.company, status, JSON.stringify(review));
          if (status === "approved") {
            try {
              await db.batch([save(), db.prepare("INSERT INTO vendors (tax_id, legal_name, account_key, bank_code, run_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(input.taxId, input.legalName, accountKey, input.bankCode, id, createdAt)]);
            } catch (error) {
              // A concurrent approval of this GSTIN must not create a second vendor.
              existing = await lookup();
              if (!existing) throw error;
              checks.splice(checks.length - 1, 1, registryCheck(input, accountKey, existing));
              status = decision(checks);
              review = buildReview();
              await save().run();
            }
          } else await save().run();
        });
        review = buildReview();
        await db.prepare("UPDATE reviews SET data = ? WHERE id = ?").bind(JSON.stringify(review), id).run();
        emit({ type: "complete", review });
      } catch (error) {
        console.error("Review execution failed", error instanceof Error ? error.message : "Unknown error");
        emit({ type: "error", message: "The review could not be completed. Reload history before retrying; a completed decision may already have been saved." });
      } finally { try { controller.close(); } catch {} }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
