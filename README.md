# Vendor Review Desk

A working PS-2 vendor onboarding process: receive a form and supporting documents, compare the evidence, check the approved vendor registry, and record an explained decision.

This version supports India and explicitly labelled, text-based documents. It uses a PDF/text/JSON parser and deterministic rules; it does not call an AI model, perform OCR, or verify records with a government or bank. The public demo uses a shared workspace with fictional sample data.

**Try three manual submissions:** [copyable vendor details and matching upload documents](docs/manual-submissions.md). The examples demonstrate approval, missing bank proof, and an account-holder mismatch. For one-click preparation and all 26 cases, use the app's **Demo workspace**.

**Live demo:** [Vendor Review Desk](https://vendor-review-desk.harshmahar786.workers.dev/) (public recruiter demo; no sign-in required).

**Host from your own GitHub repo:** [Cloudflare deployment guide](docs/cloudflare-deployment.md). The repository includes an independent Workers + D1 target with a public recruiter-demo URL after you connect your account and database.

## Run the app

Requires Node.js 22.13+ and npm. No API key is needed.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_swift_scrambler.sql
npm run dev -- --port 5173
```

Apply the migration only once to a fresh local database. Development and hosted databases are separate. The existing local database has already been initialized in this workspace.

Visit `http://127.0.0.1:5173/`. Open **Demo workspace**, load **Everything matches**, and click **Run vendor review**. Loading a scenario only fills the form and attaches files; it does not create a result.

## Demonstrate the decisions

| Input | Expected result | Evidence |
| --- | --- | --- |
| Northstar clean submission | Approved on a fresh registry | All 12 checks pass; vendor registry row is created |
| Willow without bank proof | Pending | The response asks for the missing bank document |
| Cedar with a different account holder | Pending | Form and document names are shown side by side |
| Northstar with changed banking | Pending after the clean approval | Linked to original approval; original banking is retained |
| Northstar clean submission repeated | Rejected | Exact duplicate linked to approved onboarding |

Run Everything matches before the bank-change or duplicate cases. Each load of a happy-path case generates fresh fictional identifiers; the explicit duplicate case reuses the current approved baseline. Approved vendor records are intentionally not reset from the UI.

## Expanded sample workspace

The Demo workspace includes 26 runnable cases across core flows, registration, banking, documents, file handling, and registry behavior. Category filters keep the four core interview cases easy to find. Load a case to inspect its form and generated PDF/TXT/JSON evidence, then run it through the normal server endpoint.

**Run all 26 samples** submits every case sequentially through the same six-stage live stream. It creates its own fresh baseline, records actual outcomes and expected-reason checks, and saves all results in history. You can stop after the current review; completed runs remain saved. Every generated record carries a Sample label, scenario name, and batch ID. A full successful batch produces two approvals, one duplicate rejection, and 23 pending reviews. No email is sent.

Coverage includes missing one or both documents; invalid GSTIN checksum; mismatched certificate names and identifiers; legal-name normalization; full account comparison despite matching masked endings; IFSC conflict and invalid banking structure; expired and impossible dates; contradictory labels; unlabelled evidence; malformed and incorrectly typed JSON; incomplete certificates; unreadable and malformed PDFs; page limits; unsupported country; changed banking; and missing evidence taking precedence over duplicate rejection.

Sample outcomes describe document consistency only. Fictional identifiers are not verified government registrations.

## Understand the review

The POST response streams newline-delimited JSON for six actual stages: intake, extraction, registration, banking, registry lookup, and saving. No stage is delayed to simulate work. Completed stage durations and the result are retained in D1.

A missing or conflicting required field produces **pending**. Duplicate rejection is only used when the submitted evidence is otherwise consistent and the approved company, GSTIN, and banking fingerprint match. Any pending check takes precedence over duplicate rejection.

The registry uses a unique GSTIN key. Review creation and a new approved vendor are committed in an atomic database batch. If another submission wins that race, the losing submission is re-evaluated against the new registry entry instead of creating another approval.

The original account number is used for comparison and then masked in the review record. The approved registry retains a SHA-256 fingerprint for comparison, plus the IFSC. Uploaded files are parsed in memory, not saved. Contact email, company name, tax ID, extracted evidence, check details, policy version, and generated response are retained in the audit record. Use fictional data in the demo.

## Supply your own evidence

One registration file and one bank file are supported. Each can be a text-based PDF, TXT, or JSON, up to 2 MB and 10 PDF pages. Scanned, encrypted, malformed, unlabelled, and contradictory documents go to review. Labels are case-insensitive; the extractor does not guess missing values.

Registration text example:

```text
Company name: Example Private Limited
GSTIN: enter-the-submitted-GSTIN
```

Bank text example:

```text
Account holder: Example Private Limited
Account number: 123456789012
IFSC: HDFC0001234
```

JSON uses the string keys `legalName`, `taxId`, `account`, `bankCode`, and optional `validUntil`. Dates must be YYYY-MM-DD. Only fields relevant to that document are needed. Sample PDFs and equivalent TXT/JSON files are in `public/samples/`.

The **Vendor response** tab communicates the status and required actions to the form submitter. It can be copied or downloaded; it is not emailed automatically. This avoids an external messaging dependency and keeps the demo repeatable.

## Run verification

```sh
npm test
node node_modules/typescript/bin/tsc --noEmit
node scripts/test-api.mjs
TEST_ORIGIN=http://127.0.0.1:5173 npm run test:scenarios
npm run build
```

The sample-suite integration script only accepts loopback origins. It verifies all 26 documented outcomes, saved sample labels, expected reasons, account masking, live streams, and baseline links. It also checks size/field limits, malformed requests, unsupported files, missing required details, and concurrent approvals.

The API integration script requires a running local preview and writes test data to its local database. It checks PDF submissions, missing evidence, banking conflict, changes against an approved record, duplicates, masking, saved stage events, malformed requests, and concurrent approval protection. It must not be pointed at a production system containing real vendor data.

## Source map

| File | Purpose |
| --- | --- |
| `lib/scenarios.ts` | 26 fictional input builders and small valid PDF fixtures |
| `lib/run-review.ts` | Shared streamed review client for individual and batch submissions |
| `app/page.tsx` | Overview, forms, demo workspace, live trail, evidence, and policy |
| `app/api/reviews/route.ts` | Multipart intake, real progress stream, registry lookups, persistence |
| `lib/extract.ts` | Bounded PDF/TXT/JSON extraction and ambiguity handling |
| `lib/review.ts` | Versioned checks, normalization, decision precedence, follow-up text |
| `db/schema.ts` and `drizzle/` | Durable audit records and approved vendor registry |
| `scripts/test-api.mjs` | End-to-end server verification |
| `docs/demo-script.md` | Recording plan and submission checklist |

## Deployment

`.openai/hosting.json` declares the existing Sites project and its D1 binding. The supported Sites workflow packages the built Worker, pushes its matching source commit, and applies hosted migrations before deployment. Preserve the project ID and existing access policy when updating.

The first deployment starts with an empty hosted registry. Browser runs made against localhost are not transferred. The interface shows the latest 200 reviews; exporting results exports the currently filtered subset of those records.

## Deliberate limits and next steps

- Approval establishes consistency under this policy, not active tax registration, bank ownership, sanctions clearance, or payment authorization.
- Name normalization handles punctuation, case, whitespace, and Pvt/Ltd variants. It does not approve approximate names.
- IFSC checking is structural; no bank-directory lookup is made.
- No AI confidence score is fabricated. A future model extractor should return source-grounded fields and uncertainty while leaving final decisions to these rules.
- Next additions would be OCR/model extraction, verified external sources, a reviewer resolution workflow with an append-only action log, and a secure vendor-facing resubmission link.
- Before wider production use, add organization-level roles, retention controls, rate limits, and an explicit data-handling policy.
