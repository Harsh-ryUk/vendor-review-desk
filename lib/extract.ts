import type { Evidence } from "./review";

const LABELS: Record<string, keyof Evidence["fields"]> = {
  "company name": "legalName", "registered company name": "legalName", "legal name": "legalName", "registered name": "legalName", "account holder": "legalName", "account holder name": "legalName",
  "gstin": "taxId", "gst number": "taxId", "tax id": "taxId", "tax identifier": "taxId",
  "account number": "account", "bank account number": "account", "bank account": "account", "account no": "account",
  "ifsc": "bankCode", "ifsc code": "bankCode", "bank code": "bankCode", "valid until": "validUntil", "expiry date": "validUntil", "expires": "validUntil",
};
export function parseFields(text: string, json = false): Evidence["fields"] {
  if (json) {
    const object = JSON.parse(text);
    if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("JSON document must be a single object.");
    const result: Evidence["fields"] = {};
    for (const key of ["legalName", "taxId", "account", "bankCode", "validUntil"] as const) {
      if (object[key] !== undefined && typeof object[key] !== "string") throw new Error(`JSON field ${key} must be a string.`);
      if (object[key]) result[key] = object[key].trim();
    }
    return result;
  }
  const fields: Evidence["fields"] = {};
  for (const line of text.split(/[\r\n]+/)) {
    const match = line.trim().match(/^([A-Za-z .]+?)\s*[:=]\s*(.+)$/);
    if (!match) continue;
    const label = match[1].toLowerCase().replace(/\.$/, "").trim();
    const key = Object.hasOwn(LABELS,label) ? LABELS[label] : undefined;
    if (key) {
      const value = match[2].trim();
      if (fields[key] && fields[key] !== value) throw new Error(`Conflicting values found for ${match[1]}; manual review required.`);
      fields[key] = value;
    }
  }
  return fields;
}
export async function readDocumentText(file: File): Promise<{text: string; format: string; pages: number}> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.size > 2 * 1024 * 1024) throw new Error("Each document must be 2 MB or smaller.");
  let pages = 0;
  let text: string;
  if (extension === "pdf") {
    const data = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new Error("The file does not contain a valid PDF header.");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(data, { maxImageSize: 16777216, disableFontFace: true });
    try {
      if (pdf.numPages > 10) throw new Error("This document exceeds the 10-page review limit.");
      const result = await extractText(pdf, { mergePages: false });
      pages = result.totalPages;
      text = result.text.map(page => page).join("\n");
    } finally { await pdf.loadingTask.destroy(); }
    if (text.trim().length < 20) throw new Error("No readable text layer found. This may be a scanned PDF; manual review is required.");
  } else if (extension === "txt" || extension === "json") text = await file.text();
  else throw new Error("Unsupported file type. Upload PDF, TXT, or JSON.");
  if (text.length > 80000) throw new Error("Document text exceeds the supported review size.");
  return {text, pages, format: extension?.toUpperCase() || "Unknown"};
}
export async function extractDocument(file: File, kind: Evidence["kind"]): Promise<Evidence> {
  const base: Evidence = { kind, fileName: file.name, format: file.name.split(".").pop()?.toUpperCase() || "Unknown", pages: 0, fields: {} };
  try {
    const document = await readDocumentText(file);
    base.pages = document.pages;
    base.fields = parseFields(document.text, document.format === "JSON");
    const required = kind === "tax" ? [base.fields.legalName, base.fields.taxId] : [base.fields.legalName, base.fields.account, base.fields.bankCode];
    if (required.some(x => !x)) base.error = "Required labelled fields were not found. This document needs manual review; no values were inferred.";
  } catch (error) {
    base.fields = {};
    base.error = error instanceof Error ? error.message : "Document could not be read; manual review required.";
  }
  return base;
}
