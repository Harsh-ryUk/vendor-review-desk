"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Building2, Check, CheckCheck, CheckCircle2, ChevronRight, CircleAlert, CircleX, ClipboardCheck, Clock3, Copy, FileCheck2, FileSearch, FileText, FlaskConical, History, LayoutDashboard, Loader2, Mail, Plus, Search, ShieldCheck, SlidersHorizontal, Upload, X } from "lucide-react";
import { STAGES, gstCheckDigit, type Review, type Stage, type Submission, type Status, type Evidence } from "../lib/review";

type View = "queue" | "history" | "demo" | "policy" | "new" | "run";
type Filter = "all" | Status;
const empty: Submission = { legalName: "", email: "", country: "IN", taxId: "", account: "", bankCode: "" };
const statusLabels = { approved: "Approved", pending: "Needs review", rejected: "Rejected" };
const samples = [
  { id: "clean", label: "01", name: "Everything matches", company: "Northstar Studio", expected: "Approved", description: "Two readable documents. Names, registration, and banking details agree.", icon: CheckCircle2, tone: "approved" },
  { id: "missing", label: "02", name: "Missing bank proof", company: "Willow Works", expected: "Pending", description: "Registration is complete, but bank proof is missing. Request the exact document.", icon: FileSearch, tone: "pending" },
  { id: "mismatch", label: "03", name: "A different account holder", company: "Cedar Supply", expected: "Pending", description: "The account belongs to another company. Surface the conflicting evidence.", icon: CircleAlert, tone: "pending" },
  { id: "changed", label: "04", name: "Existing vendor, new account", company: "Northstar Studio", expected: "Pending after scenario 01", description: "The same GSTIN returns with different banking details. Keep the approved record unchanged.", icon: ShieldCheck, tone: "pending" },
];
function taxId(prefix: string) { return prefix + gstCheckDigit(prefix); }
function scenarioInput(id: string): Submission {
  if (id === "missing") return { legalName: "Willow Works Private Limited", email: "accounts@willow.example", country: "IN", taxId: taxId("27AAACW4321B1Z"), account: "204060801234", bankCode: "ICIC0001234" };
  if (id === "mismatch") return { legalName: "Cedar Supply Private Limited", email: "finance@cedar.example", country: "IN", taxId: taxId("29AAACC5678C1Z"), account: "305070901234", bankCode: "HDFC0001234" };
  return { legalName: "Northstar Studio Private Limited", email: "finance@northstar.example", country: "IN", taxId: taxId("29AAACN1234A1Z"), account: id === "changed" ? "908070605432" : "102030405678", bankCode: "HDFC0001234" };
}
function dateLabel(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function durationLabel(ms: number) { return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`; }
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Badge({ status }: {status: Status}) {
  const Icon = status === "approved" ? CheckCircle2 : status === "pending" ? Clock3 : CircleX;
  return <span className={`badge ${status}`}><Icon size={13}/>{statusLabels[status]}</span>;
}
function SectionLabel({ number, children }: { number: string; children: ReactNode }) { return <div className="section-label"><span>{number}</span><h2>{children}</h2></div>; }

export default function App() {
  const [view, setView] = useState<View>("queue");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState<Submission>(empty);
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [scenario, setScenario] = useState("");
  const [loadingScenario, setLoadingScenario] = useState("");
  const [active, setActive] = useState<Review | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [resultTab, setResultTab] = useState<"checks" | "documents" | "response">("checks");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const didReadLink = useRef(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", { cache: "no-store" });
      const data = await res.json() as { error?: string; reviews: Review[] };
      if (!res.ok) throw new Error(data.error || "Could not load history.");
      setReviews(data.reviews); setError("");
      if (!didReadLink.current) {
        const linkedId = new URLSearchParams(window.location.search).get("run");
        if (linkedId) {
          const linked = data.reviews.find((r: Review) => r.id === linkedId);
          if (linked) { setActive(linked); setRunId(linked.id); setStages(linked.stages); setView("run"); }
          else setNotice("That run is not in the latest 200 submissions.");
        }
        didReadLink.current = true;
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load history."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [view, runId]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(""), 6500); return () => clearTimeout(timer); } }, [notice]);

  function navigate(next: View) {
    if (running) return;
    setView(next); setError(""); setQuery(""); setFilter("all");
    window.scrollTo({ top: 0, behavior: "instant" });
    if (next !== "run") window.history.replaceState({}, "", window.location.pathname);
    if (next === "queue" || next === "history") void refresh();
  }
  function newSubmission() { setInput({...empty}); setTaxFile(null); setBankFile(null); setScenario(""); navigate("new"); }
  function openReview(review: Review) {
    setActive(review); setStages(review.stages); setRunId(review.id); setResultTab("checks"); navigate("run");
    window.history.replaceState({}, "", `?run=${review.id}`);
  }
  async function loadScenario(id: string) {
    setLoadingScenario(id); setError("");
    try {
      const prefix = id === "missing" ? "willow" : id === "mismatch" ? "cedar" : "northstar";
      async function load(fileName: string) {
        const res = await fetch(`/samples/${fileName}`);
        if (!res.ok) throw new Error("A sample document could not be loaded. Retry or upload a document.");
        return new File([await res.blob()], fileName, { type: "application/pdf" });
      }
      const tax = await load(`${prefix}-registration.pdf`);
      const bank = id === "missing" ? null : await load(`${prefix}-${id === "changed" ? "changed-bank" : "bank"}.pdf`);
      setInput(scenarioInput(id)); setTaxFile(tax); setBankFile(bank); setScenario(id); navigate("new");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load scenario."); }
    finally { setLoadingScenario(""); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setActive(null); setStages([]); setRunId(""); setRunning(true); setView("run"); setResultTab("checks");
    try {
      const form = new FormData(); Object.entries(input).forEach(([key, value]) => form.set(key, value));
      if (taxFile) form.set("tax", taxFile); if (bankFile) form.set("bank", bankFile);
      const res = await fetch("/api/reviews", { method: "POST", body: form });
      if (!res.ok) { const data = await res.json() as { error?: string }; throw new Error(data.error || "The review could not be started."); }
      if (!res.body) throw new Error("The review stream is unavailable.");
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = "", complete = false;
      function onLine(line: string) {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        if (data.type === "start") setRunId(data.id);
        if (data.type === "stage") setStages(previous => [...previous.filter(x => x.id !== data.stage.id), data.stage]);
        if (data.type === "error") throw new Error(data.message);
        if (data.type === "complete") {
          complete = true; setActive(data.review); setReviews(previous => [data.review, ...previous.filter(x => x.id !== data.review.id)]);
          window.history.replaceState({}, "", `?run=${data.review.id}`);
        }
      }
      while (true) {
        const { done, value } = await reader.read(); buffer += decoder.decode(value, {stream: !done});
        const lines = buffer.split("\n"); buffer = lines.pop() || ""; lines.forEach(onLine);
        if (done) break;
      }
      if (buffer) onLine(buffer);
      if (!complete) throw new Error("Connection ended before completion. Check history before retrying.");
    } catch (e) { setError(e instanceof Error ? e.message : "The review failed."); }
    finally { setRunning(false); }
  }
  const counts = { all: reviews.length, approved: reviews.filter(r => r.status === "approved").length, pending: reviews.filter(r => r.status === "pending").length, rejected: reviews.filter(r => r.status === "rejected").length };
  const filtered = reviews.filter(r => (filter === "all" || r.status === filter) && `${r.company} ${r.id} ${r.input.taxId} ${r.input.email}`.toLowerCase().includes(query.toLowerCase()));
  const navItems = [ {id: "queue", icon: LayoutDashboard, label: "Overview"}, {id: "history", icon: History, label: "Run history"}, {id: "demo", icon: FlaskConical, label: "Demo workspace"}, {id: "policy", icon: SlidersHorizontal, label: "Review policy"} ] as const;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Vendor Review Desk home"><span className="brand-symbol"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false"><path d="M4 6h10l9 22-5 9L4 6Z" fill="var(--logo-mint)"/><path d="M26 4h5l5 6-12 27H14L26 4Z" fill="var(--logo-paper)"/><path d="M30 4v7h6" stroke="var(--logo-fold)" strokeWidth="1.8" strokeLinejoin="round"/></svg></span><span>Vendor<span className="brand-light">Review Desk</span></span></a>
      <div className="workspace-name"><span className="workspace-icon"><Building2 size={16}/></span><div>Procurement<span>Vendor operations</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{navItems.map(item => <button key={item.id} disabled={running} onClick={() => navigate(item.id)} className={`nav-item ${view === item.id || item.id === "history" && view === "run" ? "active" : ""}`} aria-current={view === item.id ? "page" : undefined}><item.icon size={18}/><span>{item.label}</span>{item.id === "history" && counts.all > 0 && <span className="nav-count">{counts.all}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="policy-callout"><ShieldCheck size={18}/><p>Every decision has a reason.<span>Policy checks and source evidence stay with each run.</span></p></div><div className="sidebar-footer"><span className="avatar">VR</span><div>Vendor Review Desk<span>Review workspace</span></div><span className="version">v1.0</span></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="breadcrumb"><span>Procurement</span><ChevronRight size={14}/><strong>Vendor onboarding</strong></div><div className="topbar-meta"><span className="desktop-only"><ShieldCheck size={14}/> Evidence-led reviews</span><span className="policy-chip">Policy v1.0</span></div></header>
      <main id="main" className={`main-content wise-view-${view}`}>
        {error && <div className="error-banner" role="alert"><CircleAlert size={18}/><span>{error}</span>{view === "queue" || view === "history" ? <button className="text-button" onClick={() => void refresh()}>Retry</button> : <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16}/></button>}</div>}
        {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}</div>}
        {(view === "queue" || view === "history") && <>
          <div className="page-heading"><div><p className="eyebrow">VENDOR OPERATIONS</p><h1>{view === "history" ? "Run history" : "Vendor onboarding"}</h1><p className="page-description">{view === "history" ? "Every submission, decision, and supporting detail in one place." : "Review registration, banking evidence, and onboarding decisions."}</p></div><button className="button primary" onClick={newSubmission}><Plus size={17}/>New submission</button></div>
          <div className="stats-grid">{([{key:"all", label:"Total submissions", icon:FileText}, {key:"approved",label:"Approved",icon:CheckCircle2}, {key:"pending",label:"Needs review",icon:Clock3}, {key:"rejected",label:"Rejected",icon:CircleX}] as const).map(stat => <button key={stat.key} data-status={stat.key} className={`stat-block ${filter === stat.key ? "selected" : ""}`} onClick={() => setFilter(stat.key)} aria-pressed={filter === stat.key}><div><span>{stat.label}</span><stat.icon size={17}/></div><strong>{loading && !reviews.length ? "—" : counts[stat.key]}</strong><small>{stat.key === "all" ? "Across recorded runs" : stat.key === "approved" ? "Passed configured checks" : stat.key === "pending" ? "Action or evidence needed" : "Duplicate onboarding"}</small></button>)}</div>
          {counts.pending > 0 && <div className="queue-alert"><span className="queue-alert-icon"><Clock3 size={19}/></span><div><strong>{counts.pending} submission{counts.pending === 1 ? " needs" : "s need"} your attention</strong><p>Open the flagged checks to see what’s needed next.</p></div><button className="text-button" onClick={() => { setFilter("pending"); document.getElementById("submissions")?.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block:"start"}); }}>Review queue<ArrowRight size={15}/></button></div>}
          <div className="dashboard-grid"><section id="submissions" className="panel submissions-panel" aria-label="Submissions"><div className="panel-heading"><div><h2>{view === "history" ? "Recorded runs" : "Recent submissions"}</h2><p>Open a run to see the full decision trail.</p></div><button className="icon-button" aria-label="Refresh history" disabled={loading} onClick={() => void refresh()}><History size={17} className={loading ? "spin" : ""}/></button></div>
            <div className="table-tools"><div className="filter-tabs" aria-label="Filter submissions">{(["all", "pending", "approved", "rejected"] as const).map(f => <button key={f} data-status={f} className={`status-filter ${filter === f ? "current" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f === "all" ? "All runs" : f === "pending" ? "Needs review" : statusLabels[f]}<span>{counts[f]}</span></button>)}</div><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search vendors…" aria-label="Search vendors"/></label></div>
            <div className="table-wrap"><table><thead><tr><th>Vendor</th><th>Status</th><th className="outcome-column">Review outcome</th><th>Submitted</th><th><span className="sr-only">Open run</span></th></tr></thead><tbody>{filtered.map(review => <tr key={review.id}><td><button className="vendor-link" onClick={() => openReview(review)}><span className="company-avatar">{review.company.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("")}</span><span><strong>{review.company}</strong><small>{review.id}</small></span></button></td><td><Badge status={review.status}/></td><td className="outcome-column outcome-cell">{review.checks.find(check => check.state !== "pass")?.label || "All checks passed"}</td><td className="date-cell">{dateLabel(review.createdAt)}</td><td><button className="icon-button" aria-label={`View ${review.company} review ${review.id}`} onClick={() => openReview(review)}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>
            {!filtered.length && <div className="empty-state"><div className="empty-illustration"><span/><FileCheck2 size={34}/><span/></div><h3>{loading ? "Loading your review history…" : reviews.length ? "No submissions match" : "Your first review starts here"}</h3><p>{reviews.length ? "Try another search or status filter." : "Submit a vendor and their documents. We’ll check the details and keep the reasoning with the result."}</p>{!reviews.length && !loading && <button className="button secondary" onClick={newSubmission}><Plus size={16}/>Create a submission</button>}</div>}
            <div className="table-footer"><span>{filtered.length} of {reviews.length} recorded runs{reviews.length >= 200 ? " · Latest 200 shown" : ""}</span><button className="text-button" disabled={!filtered.length} onClick={() => download("vendor-reviews.json", JSON.stringify(filtered, null, 2))}><ArrowDownToLine size={14}/>Export results</button></div>
          </section>
          <aside className="dashboard-aside"><section className="journey-panel"><div className="mini-label"><span className="live-dot"/>POLICY v1.0</div><h2>How reviews are checked</h2><div className="mini-process">{[{icon:Upload,label:"Receive",detail:"Company details + documents"},{icon:FileSearch,label:"Read & compare",detail:"Registration and bank evidence"},{icon:ShieldCheck,label:"Check",detail:"Policy rules + vendor registry"},{icon:ClipboardCheck,label:"Decide",detail:"Status, reasoning, and next steps"}].map((step,i) => <div className="mini-step" key={step.label}><span className="mini-step-icon"><step.icon size={17}/></span><div><strong>{step.label}</strong><p>{step.detail}</p></div><span className="step-number">0{i+1}</span></div>)}</div><div className="journey-note"><Check size={14}/>Decision rules are visible in every run.</div></section><section className="demo-nudge"><div className="nudge-icon"><FlaskConical size={20}/></div><h3>Test the review rules</h3><p>Try sample documents with missing proof, conflicting names, or changed bank details.</p><button className="text-button" onClick={() => navigate("demo")}>Open demo workspace<ArrowRight size={15}/></button></section></aside></div>
        </>}
        {view === "demo" && <>
          <div className="page-heading"><div><p className="eyebrow">PREPARED SCENARIOS</p><h1>Demo workspace</h1><p className="page-description">Real sample inputs. The same review process. No precomputed results.</p></div><button className="button secondary" onClick={newSubmission}><Plus size={16}/>Use your own inputs</button></div>
          <div className="info-strip"><FlaskConical size={20}/><p>All examples use fictional companies and banking details. Loading a scenario fills the form and attaches sample PDFs. <strong>You start the actual review.</strong></p></div>
          <div className="scenario-grid">{samples.map(sample => <section className="scenario-card" key={sample.id}><div className="scenario-top"><span className="mono">SCENARIO {sample.label}</span><span className={`scenario-icon ${sample.tone}`}><sample.icon size={22}/></span></div><h2>{sample.name}</h2><p>{sample.description}</p><div className="scenario-expected"><span>Expected result</span><strong>{sample.expected}</strong></div><button className="button secondary" disabled={!!loadingScenario} onClick={() => void loadScenario(sample.id)}>{loadingScenario === sample.id ? <Loader2 className="spin" size={16}/> : <FileText size={16}/>}Load {sample.company}<ArrowRight size={16}/></button></section>)}</div>
          <section className="panel demo-guide"><h2>A useful demo sequence</h2><ol><li>Run scenario 01 to approve Northstar and create its registry record.</li><li>Run scenario 03 to show an account-holder conflict and the generated follow-up.</li><li>Run scenario 04 to demonstrate a protected banking change against the approved record.</li><li>Repeat scenario 01 to show duplicate rejection. All runs remain in history.</li></ol><p>Starting with scenario 04 on a fresh registry can approve it: a banking change only exists relative to a previous approval.</p></section>
        </>}
        {view === "new" && <>
          <button className="back-button" onClick={() => navigate("queue")}><ArrowLeft size={16}/>Back to overview</button>
          <div className="page-heading compact"><div><p className="eyebrow">NEW REVIEW</p><h1>Submit a vendor</h1><p className="page-description">Add the company’s details and the documents that support them.</p></div></div>
          {scenario && <div className="info-strip"><FlaskConical size={19}/><p>Sample scenario loaded: <strong>{samples.find(x => x.id === scenario)?.name}</strong>. You can edit the form before running it. Sample companies are fictional.</p></div>}
          <form onSubmit={submit} className="submission-layout"><div className="form-sections"><section className="panel form-section"><SectionLabel number="01">Company details</SectionLabel><div className="form-grid"><Field label="Registered company name" wide><input required maxLength={200} value={input.legalName} onChange={e => setInput({...input,legalName:e.target.value})} placeholder="e.g. Northstar Studio Private Limited" autoComplete="organization"/></Field><Field label="Contact email"><input required type="email" maxLength={200} value={input.email} onChange={e => setInput({...input,email:e.target.value})} placeholder="finance@company.com" autoComplete="email"/></Field><Field label="Country"><select value={input.country} onChange={e => setInput({...input,country:e.target.value})}><option value="IN">India</option></select></Field><Field label="GSTIN" wide hint="15 characters. Checked for structure, checksum, and consistency with the certificate."><input required maxLength={15} value={input.taxId} onChange={e => setInput({...input,taxId:e.target.value.toUpperCase()})} placeholder="Enter the company’s GSTIN" spellCheck={false} autoComplete="off"/></Field></div></section>
          <section className="panel form-section"><SectionLabel number="02">Banking details</SectionLabel><div className="form-grid"><Field label="Bank account number" hint="9–18 digits. Only the last four are retained in the review."><input required inputMode="numeric" maxLength={30} value={input.account} onChange={e => setInput({...input,account:e.target.value})} placeholder="Enter account number" autoComplete="off"/></Field><Field label="IFSC" hint="11 characters, as shown on the bank proof."><input required maxLength={11} value={input.bankCode} onChange={e => setInput({...input,bankCode:e.target.value.toUpperCase()})} placeholder="e.g. HDFC0001234" spellCheck={false} autoComplete="off"/></Field></div></section>
          <section className="panel form-section"><SectionLabel number="03">Supporting documents</SectionLabel><p className="form-description">Text-based PDF, TXT, or JSON. Up to 2 MB and 10 pages per file. Missing or unreadable evidence goes to manual review.</p><div className="upload-grid"><DocumentUpload kind="Registration certificate" description="Company name + GSTIN" file={taxFile} onChange={setTaxFile} onError={setError}/><DocumentUpload kind="Bank account proof" description="Account holder + account number + IFSC" file={bankFile} onChange={setBankFile} onError={setError}/></div></section>
          <div className="form-actions"><span><ShieldCheck size={15}/>Full account numbers are masked after comparison.</span><button className="button primary" type="submit"><ClipboardCheck size={17}/>Run vendor review<ArrowRight size={16}/></button></div></div>
          <aside className="submission-aside"><div className="panel review-preview"><div className="mini-label">WHAT HAPPENS NEXT</div><h2>Review the facts.<br/>Keep the reasoning.</h2><ol>{STAGES.map((stage,i) => <li key={stage.id}><span>{i+1}</span>{stage.label}</li>)}</ol><hr/><p>You’ll see each stage as it executes, followed by a status, evidence, and a vendor response.</p></div><div className="plain-note"><CircleAlert size={17}/><p>Today’s policy supports India and labelled document fields. Scanned images and ambiguous layouts are routed to manual review.</p></div><button className="text-button" type="button" onClick={() => navigate("demo")}><FlaskConical size={15}/>Need sample documents?<ArrowRight size={14}/></button></aside></form>
        </>}
        {view === "run" && <>
          <button className="back-button" disabled={running} onClick={() => navigate("history")}><ArrowLeft size={16}/>Back to run history</button>
          <div className="page-heading compact"><div><p className="eyebrow">{running ? "REVIEW IN PROGRESS" : "REVIEW DETAILS"}<span className="mono run-reference">{runId}</span></p><h1>{active?.company || input.legalName || "Vendor review"}</h1><p className="page-description">{running ? "Each stage below reflects work executing on the server." : active ? `${dateLabel(active.createdAt)} · ${durationLabel(active.duration)} total · Policy v${active.policyVersion}` : "The run did not complete. Check history before trying again."}</p></div>{!running && <button className="button secondary" onClick={newSubmission}><Plus size={16}/>New submission</button>}</div>
          <div className="run-layout"><aside className="panel execution-panel"><div className="execution-heading"><h2>Execution trail</h2>{running ? <span className="running-label"><span className="live-dot"/>Live</span> : active ? <span className="muted-label">Recorded</span> : null}</div><ol className="execution-stages">{STAGES.map((stage,i) => {
            const actual = stages.find(x => x.id === stage.id);
            return <li key={stage.id} className={actual?.state || "waiting"}><span className="execution-marker">{actual?.state === "complete" ? <Check size={15}/> : actual?.state === "running" ? <Loader2 size={15} className="spin"/> : <span>{i+1}</span>}</span><div><strong>{stage.label}</strong><p>{actual?.detail || "Waiting for previous stage"}</p>{actual?.duration !== undefined && <small>{durationLabel(actual.duration)}</small>}</div></li>;
          })}</ol><div className="execution-footnote"><ShieldCheck size={15}/><span>Actual processing events. No simulated progress.</span></div></aside>
          <div className="run-content">{!active ? <section className="panel working-panel">{running ? <><div className="working-icon"><FileSearch size={34}/><span className="scan-line"/></div><h2>Building the decision trail</h2><p>Reading the evidence, applying the policy, and checking the vendor registry.</p><span className="working-note"><Loader2 size={14} className="spin"/>Processing your submission</span></> : <><CircleAlert size={34}/><h2>Review interrupted</h2><p>{error || "Open history to check whether a decision was saved."}</p><button className="button secondary" onClick={() => navigate("history")}>Check run history<ArrowRight size={16}/></button></>}</section> : <>
            <section className={`decision-panel ${active.status}`}><div className="decision-top"><span className="decision-icon">{active.status === "approved" ? <CheckCheck size={24}/> : active.status === "pending" ? <CircleAlert size={24}/> : <CircleX size={24}/>}</span><Badge status={active.status}/></div><h2>{active.status === "approved" ? "Ready for the next step." : active.status === "pending" ? "A few details need attention." : "This vendor is already onboarded."}</h2><p>{active.summary}</p><div className="decision-meta"><span><CheckCircle2 size={14}/>{active.checks.filter(c => c.state === "pass").length} checks passed</span><span><FileText size={14}/>{active.evidence.length} documents reviewed</span>{active.relatedRunId && <button className="text-button" onClick={() => { const related = reviews.find(x => x.id === active.relatedRunId); if (related) openReview(related); else setNotice("Related run is outside the latest 200 records."); }}>Related: {active.relatedRunId}<ArrowUpRight size={13}/></button>}</div></section>
            <section className="panel result-panel"><div className="result-tabs" role="tablist" aria-label="Review details">{([{id:"checks",icon:ClipboardCheck,label:"Decision checks"},{id:"documents",icon:FileText,label:"Documents"},{id:"response",icon:Mail,label:"Vendor response"}] as const).map(tab => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={resultTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setResultTab(tab.id)} className={resultTab === tab.id ? "current" : ""}><tab.icon size={15}/>{tab.label}</button>)}</div>
              <div role="tabpanel" id={`panel-${resultTab}`} aria-labelledby={`tab-${resultTab}`}>
              {resultTab === "checks" && <div className="checks-list">{[...active.checks].sort((a,b) => (a.state === "pass" ? 1 : 0) - (b.state === "pass" ? 1 : 0)).map(check => <details className={`check-row ${check.state}`} key={check.id} open={check.state !== "pass"}><summary><span className="check-icon">{check.state === "pass" ? <CheckCircle2 size={17}/> : check.state === "review" ? <CircleAlert size={17}/> : <CircleX size={17}/>}</span><strong>{check.label}</strong><span className="check-state">{check.state === "pass" ? "Passed" : check.state === "review" ? "Needs attention" : "Duplicate"}</span><ChevronRight size={15} className="details-chevron"/></summary><div className="check-detail"><p>{check.detail}</p><span className="source-label"><FileText size={12}/>Source: {check.source}</span>{check.action && <div className="action-needed"><strong>Next step</strong><p>{check.action}</p></div>}</div></details>)}</div>}
              {resultTab === "documents" && <div className="documents-result"><p className="tab-description">Extracted fields retained for this run. Original uploaded files are processed in memory and are not stored.</p>{!active.evidence.length && <p>No supporting documents were supplied.</p>}{active.evidence.map(doc => <EvidenceCard key={doc.kind} doc={doc}/>)}</div>}
              {resultTab === "response" && <div className="vendor-response"><div className="response-heading"><div><h3>Vendor-facing response</h3><p>Generated from this run’s actual decision and required actions. Not emailed.</p></div><button className="button small secondary" onClick={async () => { try { await navigator.clipboard.writeText(active.response); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { download(`${active.id}-response.txt`, active.response, "text/plain"); } }}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? "Copied" : "Copy"}</button></div><pre>{active.response}</pre><button className="text-button" onClick={() => download(`${active.id}-response.txt`, active.response, "text/plain")}><ArrowDownToLine size={14}/>Download response</button></div>}
              </div><div className="result-footer"><span><ShieldCheck size={14}/>Saved with policy v{active.policyVersion}</span><button className="text-button" onClick={() => download(`${active.id}.json`, JSON.stringify(active, null, 2))}><ArrowDownToLine size={14}/>Export audit record</button></div>
            </section><p className="scope-note">Approval means the supplied evidence passes configured consistency checks. This workflow does not verify government registration, bank ownership, or sanctions status.</p>
          </>}</div></div>
        </>}
        {view === "policy" && <>
          <div className="page-heading"><div><p className="eyebrow">TRANSPARENT BY DESIGN</p><h1>Review policy</h1><p className="page-description">The checks behind every decision. Version 1.0.</p></div><span className="policy-chip"><ShieldCheck size={14}/>India · Document consistency</span></div>
          <div className="policy-layout"><section className="panel policy-content"><SectionLabel number="01">What we check</SectionLabel><dl className="policy-rules">{[
            ["Required details", "Company name, contact email syntax, country, GSTIN, bank account number, and IFSC."],
            ["Registration", "India GSTIN structure, state-code range 01–38, and base-36 checksum. The certificate’s GSTIN and legal name must match the form."],
            ["Name normalization", "Case, punctuation, whitespace, and Pvt / Private and Ltd / Limited variations are normalized. Different names are not fuzzy-matched into an approval."],
            ["Banking", "Account number must have 9–18 digits. IFSC must match the configured 11-character structure. Account holder, full account number, and IFSC must match the uploaded proof."],
            ["Documents", "Both registration and bank proof are required. Any explicit expiry must be a valid YYYY-MM-DD date that has not expired (UTC). Missing expiry is not treated as proof of perpetual validity."],
            ["Existing vendors", "A matching approved company, GSTIN, and banking fingerprint is a duplicate. A different company name or banking detail under an approved GSTIN needs manual review. The previous registry entry is never overwritten."],
          ].map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl><SectionLabel number="02">How decisions are made</SectionLabel><div className="status-policy"><p><Badge status="approved"/><span>All checks pass. Record the approved vendor in the registry.</span></p><p><Badge status="pending"/><span>Any check needs attention. Return exact evidence requests. Missing or ambiguous evidence takes precedence over duplicate rejection.</span></p><p><Badge status="rejected"/><span>Evidence is otherwise consistent and an identical approved vendor already exists. Refer to that application.</span></p></div></section><aside className="policy-aside"><section className="panel"><h2>Supported inputs</h2><p>Text-based PDF, TXT, and JSON. Two files maximum, each up to 2 MB. PDFs up to 10 pages.</p><h3>Labelled text fields</h3><pre>Company name: …<br/>GSTIN: …<br/><br/>Account holder: …<br/>Account number: …<br/>IFSC: …<br/>Valid until: YYYY-MM-DD</pre><h3>JSON document keys</h3><pre>legalName, taxId,<br/>account, bankCode,<br/>validUntil</pre><p>All JSON values must be strings. Expiry is optional; when supplied, it is checked.</p></section><section className="plain-note"><CircleAlert size={18}/><p>The parser extracts explicitly labelled fields. It does not use an AI model or OCR. Scanned, encrypted, unlabelled, or conflicting documents go to manual review.</p></section><section className="plain-note"><ShieldCheck size={18}/><p>Audit records retain masked account numbers and a one-way bank fingerprint in the registry. Original files are not retained. History shows the latest 200 reviews.</p></section></aside></div>
        </>}
        <footer className="app-footer"><span>Vendor Review Desk</span><span>Submission → evidence → decision</span><span>Document consistency policy · v1.0</span></footer>
      </main>
    </div>
  </div>;
}

function Field({ label, children, wide, hint }: {label: string; children: ReactNode; wide?: boolean; hint?: string}) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}<span className="required-dot" aria-hidden="true">*</span></span>{children}{hint && <small>{hint}</small>}</label>;
}
function DocumentUpload({ kind, description, file, onChange, onError }: {kind: string; description: string; file: File | null; onChange: (file: File | null) => void; onError: (message: string) => void}) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  function select(next?: File) {
    if (!next) return;
    if (next.size > 2 * 1024 * 1024) { onError(`${kind}: file must be 2 MB or smaller.`); return; }
    if (!/\.(pdf|txt|json)$/i.test(next.name)) { onError(`${kind}: upload a PDF, TXT, or JSON file.`); return; }
    onError(""); onChange(next);
  }
  return <div className={`document-upload ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={event => {event.preventDefault();setDragging(true);}} onDragLeave={() => setDragging(false)} onDrop={event => {event.preventDefault();setDragging(false);select(event.dataTransfer.files[0]);}}><div className="upload-label">{kind}</div><input ref={ref} type="file" accept=".pdf,.txt,.json" aria-label={`Upload ${kind.toLowerCase()}`} onChange={event => {select(event.target.files?.[0]);event.target.value="";}} className="sr-only" tabIndex={-1}/>{file ? <div className="attached-file"><span className="file-icon"><FileCheck2 size={24}/></span><div><strong>{file.name}</strong><small>{(file.size/1024).toFixed(1)} KB · Ready to process</small></div><button className="icon-button" type="button" aria-label={`Remove ${kind.toLowerCase()}`} onClick={() => onChange(null)}><X size={15}/></button></div> : <button className="upload-target" type="button" onClick={() => ref.current?.click()}><span className="upload-icon"><Upload size={21}/></span><strong>Click to upload <span>or drop a file</span></strong><small>{description}</small></button>}{file && <button className="text-button" type="button" onClick={() => ref.current?.click()}>Replace document</button>}</div>;
}
function EvidenceCard({doc}: {doc: Evidence}) {
  const labels = { legalName: doc.kind === "bank" ? "Account holder" : "Registered name", taxId: "GSTIN", account: "Account number (masked)", bankCode: "IFSC", validUntil: "Valid until" };
  return <article className="evidence-card"><div className="evidence-heading"><FileText size={20}/><div><h3>{doc.fileName}</h3><span>{doc.kind === "tax" ? "Registration certificate" : "Bank proof"} · {doc.format}{doc.pages ? ` · ${doc.pages} page${doc.pages === 1 ? "" : "s"}` : ""}</span></div><span className={`badge ${doc.error ? "pending" : "approved"}`}>{doc.error ? "Needs review" : "Read"}</span></div>{doc.error && <p className="document-error"><CircleAlert size={15}/>{doc.error}</p>}<dl>{Object.entries(doc.fields).map(([key,value]) => <div key={key}><dt>{labels[key as keyof typeof labels]}</dt><dd>{value}</dd></div>)}</dl>{!Object.keys(doc.fields).length && <p className="tab-description">No fields could be extracted reliably.</p>}</article>;
}
