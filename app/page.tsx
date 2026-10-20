"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Building2, Check, CheckCheck, CheckCircle2, ChevronRight, CircleAlert, CircleX, ClipboardCheck, Clock3, Copy, FileCheck2, FileSearch, FileText, FlaskConical, History, LayoutDashboard, Loader2, Mail, Plus, Search, ShieldCheck, SlidersHorizontal, Upload, X } from "lucide-react";
import { POLICY_VERSION, STAGES, type Review, type Stage, type Submission, type Status, type Evidence } from "../lib/review";

import { SCENARIOS, CATEGORIES, buildScenario, newSuiteId, scenarioFormData } from "../lib/scenarios";
import { runReview } from "../lib/run-review";
import { SERVICE_CATEGORIES, POLICY_REFERENCES } from "../lib/vendor-policy";
import AutofillPanel from '../components/autofill-panel';
import {FORM_FIELDS,mergeAutofill,type AutofillResult,type FormField,type ImportReport,type ImportRole} from '../lib/autofill';

type View = "queue" | "history" | "demo" | "policy" | "new" | "run";
type Filter = "all" | Status;
const empty: Submission = { legalName: "", email: "", country: "IN", taxId: "", account: "", bankCode: "", serviceCategory: "general" };
const statusLabels = { approved: "Approved", pending: "Needs review", rejected: "Rejected" };
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
  const [input, setInputState] = useState<Submission>(empty);
  const inputRef=useRef<Submission>(empty);
  const editedFields=useRef(new Set<FormField>());
  const importRequests=useRef<Partial<Record<ImportRole,AbortController>>>({});
  const [importing,setImporting]=useState<Partial<Record<ImportRole,string>>>({});
  const [importReports,setImportReports]=useState<Partial<Record<ImportRole,ImportReport>>>({});
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
  const [caseCategory, setCaseCategory] = useState("All cases");
  const [demoSeed, setDemoSeed] = useState("");
  const [baselineSeeds, setBaselineSeeds] = useState<Record<string,string>>({});
  const [loadedSeed, setLoadedSeed] = useState("");
  const [suiteResults, setSuiteResults] = useState<{id:string;review:Review;matches:boolean}[]>([]);
  const [suiteStage, setSuiteStage] = useState("");
  const [suiteRunning, setSuiteRunning] = useState(false);
  const stopSuite = useRef(false);
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
  useEffect(()=>()=>{Object.values(importRequests.current).forEach(request=>request?.abort());importRequests.current={};},[]);

  function setInput(next:Submission) {inputRef.current=next;setInputState(next);}
  function editField(field:FormField,value:string) {editedFields.current.add(field);setInput({...inputRef.current,[field]:value});}
  function cancelImports() {Object.values(importRequests.current).forEach(request=>request?.abort());importRequests.current={};setImporting({});}
  function useExtracted(role:ImportRole,field:FormField) {
    const value=importReports[role]?.fields[field];if(!value) return;
    editField(field,value);
    setImportReports(previous=>({...previous,[role]:{...previous[role]!,kept:previous[role]!.kept.filter(key=>key!==field)}}));
  }
  async function autofill(file:File,role:ImportRole='profile') {
    importRequests.current[role]?.abort();
    const controller=new AbortController();importRequests.current[role]=controller;
    setImporting(previous=>({...previous,[role]:file.name}));
    setScenario('');setLoadedSeed('');
    try {
      if(file.size>2*1024*1024) throw new Error('Each document must be 2 MB or smaller.');
      if(!/\.(pdf|txt|json)$/i.test(file.name)) throw new Error('Upload a PDF, TXT, or JSON file.');
      const form=new FormData();form.set('file',file);form.set('role',role);
      const response=await fetch('/api/autofill',{method:'POST',body:form,signal:controller.signal});
      const data=await response.json() as AutofillResult & {error?:string};
      if(importRequests.current[role]!==controller) return;
      if(!response.ok) throw new Error(data.error||'The document could not be read.');
      const result=mergeAutofill(inputRef.current,data.fields,editedFields.current);
      setInput(result.next);
      setImportReports(previous=>({...previous,[role]:{...data,filled:result.filled,kept:result.kept}}));
    } catch(error) {
      if(importRequests.current[role]===controller && !controller.signal.aborted) setImportReports(previous=>({...previous,[role]:{fileName:file.name,format:'',pages:0,fields:{},sources:{},warnings:[],filled:[],kept:[],error:error instanceof Error?error.message:'The document could not be read.'}}));
    } finally {
      if(importRequests.current[role]===controller) {delete importRequests.current[role];setImporting(previous=>{const next={...previous};delete next[role];return next;});}
    }
  }
  function changeProof(role:'tax'|'bank',file:File|null) {
    if(role==='tax')setTaxFile(file);else setBankFile(file);
    if(file)void autofill(file,role);
    else {importRequests.current[role]?.abort();delete importRequests.current[role];setImporting(previous=>{const next={...previous};delete next[role];return next;});setImportReports(previous=>{const next={...previous};delete next[role];return next;});}
  }

  function navigate(next: View) {
    if (running) return;
    if(next!=='new')cancelImports();
    setView(next); setError(""); setQuery(""); setFilter("all");
    window.scrollTo({ top: 0, behavior: "instant" });
    if (next !== "run") window.history.replaceState({}, "", window.location.pathname);
    if (next === "queue" || next === "history") void refresh();
  }
  function newSubmission() { cancelImports();setImportReports({});editedFields.current.clear();setInput({...empty}); setTaxFile(null); setBankFile(null); setScenario(""); navigate("new"); }
  function openReview(review: Review) {
    setActive(review); setStages(review.stages); setRunId(review.id); setResultTab("checks"); navigate("run");
    window.history.replaceState({}, "", `?run=${review.id}`);
  }
  async function loadScenario(id: string) {
    setLoadingScenario(id); setError("");
    try {
      const selected = SCENARIOS.find(s=>s.id===id)!;
      const seed = selected.baseline ? baselineSeeds[selected.baseline] || demoSeed || newSuiteId() : selected.expected === "approved" ? newSuiteId() : demoSeed || newSuiteId();
      if (selected.baseline && !reviews.some(r => r.sample?.suiteId === seed && r.sample.scenarioId === selected.baseline && r.status === "approved")) throw new Error(`Run ${SCENARIOS.find(s=>s.id===selected.baseline)?.name} first to create its approved baseline, or use Run all samples.`);
      const sample = buildScenario(id, seed);
      cancelImports();setImportReports({});editedFields.current=new Set(FORM_FIELDS);
      const file = (doc: typeof sample.tax) => doc ? new File([doc.content], doc.name, {type:doc.type}) : null;
      if (id === "clean" || !demoSeed) setDemoSeed(seed); if(selected.expected === "approved") setBaselineSeeds(previous=>({...previous,[id]:seed})); setLoadedSeed(seed); setInput(sample.input); setTaxFile(file(sample.tax)); setBankFile(file(sample.bank)); setScenario(id); navigate("new");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load scenario."); }
    finally { setLoadingScenario(""); }
  }
  async function runSampleSuite() {
    const seed = newSuiteId(); setDemoSeed(seed); setBaselineSeeds({clean:seed,normalized:seed}); setSuiteResults([]); setError(""); setSuiteRunning(true); setRunning(true); stopSuite.current = false;
    try {
      for (const sample of SCENARIOS) {
        if (stopSuite.current) break;
        setSuiteStage(`${sample.name} · Starting`);
        const review = await runReview(scenarioFormData(buildScenario(sample.id, seed)), event => {
          if (event.type === "stage") setSuiteStage(`${sample.name} · ${event.stage.label}`);
        });
        const matches = review.status === sample.expected && review.stages.length === 6 && !!review.checks.find(c => c.id === sample.check && (sample.expected === "approved" ? c.state === "pass" : c.state !== "pass"));
        setSuiteResults(previous => [...previous, {id:sample.id,review,matches}]);
        setReviews(previous => [review,...previous.filter(r=>r.id!==review.id)]);
      }
    } catch (e) {setError(e instanceof Error ? e.message : "Sample batch stopped. Check history before retrying.");}
    finally {setSuiteRunning(false);setRunning(false);setSuiteStage("");}
  }
  async function submit(event: FormEvent) {
    if(Object.keys(importRequests.current).length) {event.preventDefault();return;}
    event.preventDefault(); setError(""); setActive(null); setStages([]); setRunId(""); setRunning(true); setView("run"); setResultTab("checks");
    try {
      const form = new FormData(); Object.entries(input).forEach(([key, value]) => form.set(key, value));
      if (taxFile) form.set("tax", taxFile); if (bankFile) form.set("bank", bankFile);
      if (scenario && loadedSeed) {form.set("demoScenario",scenario);form.set("demoSuite",loadedSeed);}
      await runReview(form, data => {
        if (data.type === "start") setRunId(data.id);
        if (data.type === "stage") setStages(previous => [...previous.filter(x => x.id !== data.stage.id), data.stage]);
        if (data.type === "complete") {
          setActive(data.review); setReviews(previous => [data.review, ...previous.filter(x => x.id !== data.review.id)]);
          window.history.replaceState({}, "", `?run=${data.review.id}`);
        }
      });
    } catch (e) { setError(e instanceof Error ? e.message : "The review failed."); }
    finally { setRunning(false); }
  }
  const visibleScenarios = SCENARIOS.filter(sample=>caseCategory === "All cases" || (caseCategory === "Rejected" ? sample.expected === "rejected" : sample.category === caseCategory));
  const counts = { all: reviews.length, approved: reviews.filter(r => r.status === "approved").length, pending: reviews.filter(r => r.status === "pending").length, rejected: reviews.filter(r => r.status === "rejected").length };
  const filtered = reviews.filter(r => (filter === "all" || r.status === filter) && `${r.company} ${r.id} ${r.input.taxId} ${r.input.email} ${r.sample?.label || ""}`.toLowerCase().includes(query.toLowerCase()));
  const navItems = [ {id: "queue", icon: LayoutDashboard, label: "Overview"}, {id: "history", icon: History, label: "Run history"}, {id: "demo", icon: FlaskConical, label: "Demo workspace"}, {id: "policy", icon: SlidersHorizontal, label: "Review policy"} ] as const;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Vendor Review Desk home"><span className="brand-symbol"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false"><path d="M4 6h10l9 22-5 9L4 6Z" fill="var(--logo-mint)"/><path d="M26 4h5l5 6-12 27H14L26 4Z" fill="var(--logo-paper)"/><path d="M30 4v7h6" stroke="var(--logo-fold)" strokeWidth="1.8" strokeLinejoin="round"/></svg></span><span>Vendor<span className="brand-light">Review Desk</span></span></a>
      <div className="workspace-name"><span className="workspace-icon"><Building2 size={16}/></span><div>Procurement<span>Vendor operations</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{navItems.map(item => <button key={item.id} disabled={running} onClick={() => navigate(item.id)} className={`nav-item ${view === item.id || item.id === "history" && view === "run" ? "active" : ""}`} aria-current={view === item.id ? "page" : undefined}><item.icon size={18}/><span>{item.label}</span>{item.id === "history" && counts.all > 0 && <span className="nav-count">{counts.all}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="policy-callout"><ShieldCheck size={18}/><p>Every decision has a reason.<span>Policy checks and source evidence stay with each run.</span></p></div><div className="sidebar-footer"><span className="avatar">VR</span><div>Vendor Review Desk<span>Review workspace</span></div><span className="version">v{POLICY_VERSION}</span></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="breadcrumb"><span>Procurement</span><ChevronRight size={14}/><strong>Vendor onboarding</strong></div><div className="topbar-meta"><span className="desktop-only"><ShieldCheck size={14}/> Evidence-led reviews</span><span className="policy-chip">Policy v{POLICY_VERSION}</span></div></header>
      <main id="main" className={`main-content wise-view-${view}`}>
        {error && <div className="error-banner" role="alert"><CircleAlert size={18}/><span>{error}</span>{view === "queue" || view === "history" ? <button className="text-button" onClick={() => void refresh()}>Retry</button> : <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16}/></button>}</div>}
        {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}</div>}
        {(view === "queue" || view === "history") && <>
          <div className="page-heading"><div><p className="eyebrow">VENDOR OPERATIONS</p><h1>{view === "history" ? "Run history" : "Vendor onboarding"}</h1><p className="page-description">{view === "history" ? "Every submission, decision, and supporting detail in one place." : "Review registration, banking evidence, and onboarding decisions."}</p></div><button className="button primary" onClick={newSubmission}><Plus size={17}/>New submission</button></div>
          <div className="stats-grid">{([{key:"all", label:"Total submissions", icon:FileText}, {key:"approved",label:"Approved",icon:CheckCircle2}, {key:"pending",label:"Needs review",icon:Clock3}, {key:"rejected",label:"Rejected",icon:CircleX}] as const).map(stat => <button key={stat.key} data-status={stat.key} className={`stat-block ${filter === stat.key ? "selected" : ""}`} onClick={() => setFilter(stat.key)} aria-pressed={filter === stat.key}><div><span>{stat.label}</span><stat.icon size={17}/></div><strong>{loading && !reviews.length ? "—" : counts[stat.key]}</strong><small>{stat.key === "all" ? "Across recorded runs" : stat.key === "approved" ? "Passed configured checks" : stat.key === "pending" ? "Action or evidence needed" : "Policy restrictions or duplicates"}</small></button>)}</div>
          {counts.pending > 0 && <div className="queue-alert"><span className="queue-alert-icon"><Clock3 size={19}/></span><div><strong>{counts.pending} submission{counts.pending === 1 ? " needs" : "s need"} your attention</strong><p>Open the flagged checks to see what’s needed next.</p></div><button className="text-button" onClick={() => { setFilter("pending"); document.getElementById("submissions")?.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block:"start"}); }}>Review queue<ArrowRight size={15}/></button></div>}
          <div className="dashboard-grid"><section id="submissions" className="panel submissions-panel" aria-label="Submissions"><div className="panel-heading"><div><h2>{view === "history" ? "Recorded runs" : "Recent submissions"}</h2><p>Open a run to see the full decision trail.</p></div><button className="icon-button" aria-label="Refresh history" disabled={loading} onClick={() => void refresh()}><History size={17} className={loading ? "spin" : ""}/></button></div>
            <div className="table-tools"><div className="filter-tabs" aria-label="Filter submissions">{(["all", "pending", "approved", "rejected"] as const).map(f => <button key={f} data-status={f} className={`status-filter ${filter === f ? "current" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>{f === "all" ? "All runs" : f === "pending" ? "Needs review" : statusLabels[f]}<span>{counts[f]}</span></button>)}</div><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search vendors…" aria-label="Search vendors"/></label></div>
            <div className="table-wrap"><table><thead><tr><th>Vendor</th><th>Status</th><th className="outcome-column">Review outcome</th><th>Submitted</th><th><span className="sr-only">Open run</span></th></tr></thead><tbody>{filtered.map(review => <tr key={review.id}><td><button className="vendor-link" onClick={() => openReview(review)}><span className="company-avatar">{review.company.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("")}</span><span><strong>{review.company}</strong><small>{review.sample && <span className="sample-tag">Sample</span>}{review.id}</small></span></button></td><td><Badge status={review.status}/></td><td className="outcome-column outcome-cell">{(review.checks.find(check => check.state === "fail" && check.terminal) || review.checks.find(check => check.state !== "pass"))?.label || "All checks passed"}</td><td className="date-cell">{dateLabel(review.createdAt)}</td><td><button className="icon-button" aria-label={`View ${review.company} review ${review.id}`} onClick={() => openReview(review)}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>
            {!filtered.length && <div className="empty-state"><div className="empty-illustration"><span/><FileCheck2 size={34}/><span/></div><h3>{loading ? "Loading your review history…" : reviews.length ? "No submissions match" : "Your first review starts here"}</h3><p>{reviews.length ? "Try another search or status filter." : "Submit a vendor and their documents. We’ll check the details and keep the reasoning with the result."}</p>{!reviews.length && !loading && <button className="button secondary" onClick={newSubmission}><Plus size={16}/>Create a submission</button>}</div>}
            <div className="table-footer"><span>{filtered.length} of {reviews.length} recorded runs{reviews.length >= 200 ? " · Latest 200 shown" : ""}</span><button className="text-button" disabled={!filtered.length} onClick={() => download("vendor-reviews.json", JSON.stringify(filtered, null, 2))}><ArrowDownToLine size={14}/>Export results</button></div>
          </section>
          <aside className="dashboard-aside"><section className="journey-panel"><div className="mini-label"><span className="live-dot"/>POLICY v{POLICY_VERSION}</div><h2>How reviews are checked</h2><div className="mini-process">{[{icon:Upload,label:"Receive",detail:"Company details + documents"},{icon:FileSearch,label:"Read & compare",detail:"Registration and bank evidence"},{icon:ShieldCheck,label:"Check",detail:"Policy rules + vendor registry"},{icon:ClipboardCheck,label:"Decide",detail:"Status, reasoning, and next steps"}].map((step,i) => <div className="mini-step" key={step.label}><span className="mini-step-icon"><step.icon size={17}/></span><div><strong>{step.label}</strong><p>{step.detail}</p></div><span className="step-number">0{i+1}</span></div>)}</div><div className="journey-note"><Check size={14}/>Decision rules are visible in every run.</div></section><section className="demo-nudge"><div className="nudge-icon"><FlaskConical size={20}/></div><h3>Test the review rules</h3><p>Try sample documents with missing proof, conflicting names, or changed bank details.</p><button className="text-button" onClick={() => navigate("demo")}>Open demo workspace<ArrowRight size={15}/></button></section></aside></div>
        </>}
        {view === "demo" && <>
          <div className="page-heading"><div><p className="eyebrow">PREPARED SCENARIOS</p><h1>Demo workspace</h1><p className="page-description">Real sample inputs. The same review process. No precomputed results.</p></div><button className="button secondary" disabled={running} onClick={newSubmission}><Plus size={16}/>Use your own inputs</button></div>
          <section className="panel sample-suite" aria-label="Sample submission suite"><div><p className="mini-label">{SCENARIOS.length} REAL SUBMISSIONS · FICTIONAL DATA</p><h2>Exercise every review path</h2><p>Run the full sample batch to create real decisions, evidence, and history. Each batch uses fresh sample identifiers and creates its own approved baseline. No emails are sent.</p></div><div className="suite-actions"><button className="button primary" disabled={running || !!loadingScenario} onClick={() => void runSampleSuite()}>{suiteRunning ? <Loader2 size={16} className="spin"/> : <FlaskConical size={16}/>}Run all {SCENARIOS.length} samples</button>{suiteRunning && <button className="button secondary" onClick={() => {stopSuite.current=true;setNotice("The batch will stop after its current review finishes.");}}>Stop after current</button>}</div>
          {(suiteRunning || suiteResults.length > 0) && <div className="suite-progress" role="status"><strong>{suiteResults.length} / {SCENARIOS.length} completed · {suiteResults.filter(r=>r.matches).length} matched expectations</strong><progress value={suiteResults.length} max={SCENARIOS.length} aria-label="Sample batch progress"/><span>{suiteStage || (suiteResults.length === SCENARIOS.length ? "Batch complete. Every result is saved in run history." : "Batch stopped. Completed results remain saved.")}</span></div>}
          {suiteResults.length > 0 && <details className="suite-results" open={!suiteRunning}><summary>Inspect batch results ({suiteResults.length})</summary><div className="table-wrap"><table><thead><tr><th>Scenario</th><th>Expected</th><th>Actual</th><th>Verification</th><th>Run</th></tr></thead><tbody>{suiteResults.map(result => <tr key={result.id}><td>{result.review.sample?.label}</td><td>{statusLabels[SCENARIOS.find(s=>s.id===result.id)!.expected]}</td><td><Badge status={result.review.status}/></td><td className={result.matches?"suite-pass":"suite-fail"}>{result.matches?"Matched":"Inspect result"}</td><td><button className="text-button" disabled={running} onClick={()=>openReview(result.review)}>Open<ArrowUpRight size={14}/></button></td></tr>)}</tbody></table></div></details>}
          </section>
          <div className="case-filters" role="group" aria-label="Filter sample cases">{CATEGORIES.map(category=><button key={category} data-status={category==="Rejected"?"rejected":undefined} aria-pressed={caseCategory===category} onClick={()=>setCaseCategory(category)}>{category}<span>{category==='All cases'?SCENARIOS.length:SCENARIOS.filter(s=>category==='Rejected'?s.expected==='rejected':s.category===category).length}</span></button>)}</div>
          <div className="scenario-grid">{visibleScenarios.filter(sample=>sample.category==='Core demo').map((sample,i) => <section className="scenario-card" key={sample.id}><div className="scenario-top"><span className="mono">CORE DEMO {String(i+1).padStart(2,'0')}</span><span className={`scenario-icon ${sample.expected}`}><FlaskConical size={22}/></span></div><h2>{sample.name}</h2><p>{sample.description}</p><div className="scenario-expected"><span>Expected result</span><strong>{statusLabels[sample.expected]}</strong></div>{sample.baseline && <p className="baseline-note">Run {SCENARIOS.find(s=>s.id===sample.baseline)?.name} first.</p>}<button className="button secondary" disabled={!!loadingScenario||running} onClick={() => void loadScenario(sample.id)}>{loadingScenario === sample.id ? <Loader2 className="spin" size={16}/> : <FileText size={16}/>}Load {sample.company}<ArrowRight size={16}/></button></section>)}</div>
          {visibleScenarios.some(sample=>sample.category!=='Core demo') && <section className="panel extra-cases"><div className="panel-heading"><div><h2>Additional edge cases</h2><p>Load a case to inspect its form and actual supporting files, then start the review.</p></div></div><div className="case-list">{visibleScenarios.filter(sample=>sample.category!=='Core demo').map(sample=><article className="case-row" key={sample.id}><div><span className="mini-label">{sample.category}</span><h3>{sample.name}</h3><p>{sample.description}{sample.baseline?` Run ${SCENARIOS.find(s=>s.id===sample.baseline)?.name} first.`:''}</p></div><Badge status={sample.expected}/><button className="button secondary small" disabled={!!loadingScenario||running} onClick={()=>void loadScenario(sample.id)}>{loadingScenario===sample.id?<Loader2 size={15} className="spin"/>:<FileText size={15}/>}Load case</button></article>)}</div></section>}
          <section className="panel demo-guide"><h2>A focused five-minute demo</h2><ol><li>Load Everything matches and run the approval.</li><li>Show Different account holder and its exact follow-up request.</li><li>Show Existing vendor, new account against that approval.</li><li>Load Identical repeat submission to demonstrate duplicate rejection.</li></ol><p>File size, unsupported uploads, required fields, and concurrent approvals are also checked in automated verification. The extra cases are available for deeper testing. Loading a case creates no result; running it performs the same server checks as any other submission. Full batches record their fictional sample label in history.</p></section>
        </>}
        {view === "new" && <>
          <button className="back-button" onClick={() => navigate("queue")}><ArrowLeft size={16}/>Back to overview</button>
          <div className="page-heading compact"><div><p className="eyebrow">NEW REVIEW</p><h1>Submit a vendor</h1><p className="page-description">Add the company’s details and the documents that support them.</p></div></div>
          {scenario && <div className="info-strip"><FlaskConical size={19}/><p>Sample scenario loaded: <strong>{SCENARIOS.find(x => x.id === scenario)?.name}</strong>. You can edit the form before running it. Sample companies are fictional.</p></div>}
          <form onSubmit={submit} className="submission-layout"><div className="form-sections"><AutofillPanel reports={importReports} importing={importing} input={input} onImport={file=>void autofill(file)} onUse={useExtracted}/><section className="panel form-section"><SectionLabel number="01">Company details</SectionLabel><div className="form-grid"><Field label="Registered company name" wide><input required maxLength={200} value={input.legalName} onChange={e => editField("legalName",e.target.value)} placeholder="e.g. Northstar Studio Private Limited" autoComplete="organization"/></Field><Field label="Contact email"><input required type="email" maxLength={200} value={input.email} onChange={e => editField("email",e.target.value)} placeholder="finance@company.com" autoComplete="email"/></Field><Field label="Country"><select value={input.country} onChange={e => editField("country",e.target.value)}><option value="IN">India</option><option value="US">United States (manual review)</option>{!["IN","US"].includes(input.country) && <option value={input.country}>{input.country} (manual review)</option>}</select></Field><Field label="Service category" wide hint="Choose the service provided. The demo purchasing policy excludes Gambling services."><select value={input.serviceCategory || "general"} onChange={e=>editField("serviceCategory",e.target.value)}>{SERVICE_CATEGORIES.map(category=><option key={category.id} value={category.id}>{category.label}</option>)}{!SERVICE_CATEGORIES.some(category=>category.id===input.serviceCategory) && input.serviceCategory && <option value={input.serviceCategory}>{input.serviceCategory} (manual review)</option>}</select></Field><Field label="GSTIN" wide hint="15 characters. Checked for structure, checksum, and consistency with the certificate."><input required maxLength={15} value={input.taxId} onChange={e => editField("taxId",e.target.value.toUpperCase())} placeholder="Enter the company’s GSTIN" spellCheck={false} autoComplete="off"/></Field></div></section>
          <section className="panel form-section"><SectionLabel number="02">Banking details</SectionLabel><div className="form-grid"><Field label="Bank account number" hint="9–18 digits. Only the last four are retained in the review."><input required inputMode="numeric" maxLength={30} value={input.account} onChange={e => editField("account",e.target.value)} placeholder="Enter account number" autoComplete="off"/></Field><Field label="IFSC" hint="11 characters, as shown on the bank proof."><input required maxLength={11} value={input.bankCode} onChange={e => editField("bankCode",e.target.value.toUpperCase())} placeholder="e.g. HDFC0001234" spellCheck={false} autoComplete="off"/></Field></div></section>
          <section className="panel form-section"><SectionLabel number="03">Supporting documents</SectionLabel><p className="form-description">Text-based PDF, TXT, or JSON. Up to 2 MB and 10 pages per file. Missing or unreadable evidence goes to manual review.</p><div className="upload-grid"><DocumentUpload kind="Registration certificate" description="Company name + GSTIN" file={taxFile} onChange={file=>changeProof("tax",file)} onError={setError}/><DocumentUpload kind="Bank account proof" description="Account holder + account number + IFSC" file={bankFile} onChange={file=>changeProof("bank",file)} onError={setError}/></div></section>
          <div className="form-actions"><span><ShieldCheck size={15}/>Full account numbers are masked after comparison.</span><button className="button primary" type="submit" disabled={Object.keys(importing).length>0}><ClipboardCheck size={17}/>{Object.keys(importing).length?"Reading documents…":"Run vendor review"}<ArrowRight size={16}/></button></div></div>
          <aside className="submission-aside"><div className="panel review-preview"><div className="mini-label">WHAT HAPPENS NEXT</div><h2>Review the facts.<br/>Keep the reasoning.</h2><ol>{STAGES.map((stage,i) => <li key={stage.id}><span>{i+1}</span>{stage.label}</li>)}</ol><hr/><p>You’ll see each stage as it executes, followed by a status, evidence, and a vendor response.</p></div><div className="plain-note"><CircleAlert size={17}/><p>Today’s policy supports India and labelled document fields. Scanned images and ambiguous layouts are routed to manual review.</p></div><button className="text-button" type="button" onClick={() => navigate("demo")}><FlaskConical size={15}/>Need sample documents?<ArrowRight size={14}/></button></aside></form>
        </>}
        {view === "run" && <>
          <button className="back-button" disabled={running} onClick={() => navigate("history")}><ArrowLeft size={16}/>Back to run history</button>
          <div className="page-heading compact"><div><p className="eyebrow">{running ? "REVIEW IN PROGRESS" : "REVIEW DETAILS"}<span className="mono run-reference">{runId}</span>{active?.sample && <span className="sample-tag">Sample · {active.sample.label}</span>}</p><h1>{active?.company || input.legalName || "Vendor review"}</h1><p className="page-description">{running ? "Each stage below reflects work executing on the server." : active ? `${dateLabel(active.createdAt)} · ${durationLabel(active.duration)} total · Policy v${active.policyVersion}` : "The run did not complete. Check history before trying again."}</p></div>{!running && <button className="button secondary" onClick={newSubmission}><Plus size={16}/>New submission</button>}</div>
          <div className="run-layout"><aside className="panel execution-panel"><div className="execution-heading"><h2>Execution trail</h2>{running ? <span className="running-label"><span className="live-dot"/>Live</span> : active ? <span className="muted-label">Recorded</span> : null}</div><ol className="execution-stages">{STAGES.map((stage,i) => {
            const actual = stages.find(x => x.id === stage.id);
            return <li key={stage.id} className={actual?.state || "waiting"}><span className="execution-marker">{actual?.state === "complete" ? <Check size={15}/> : actual?.state === "running" ? <Loader2 size={15} className="spin"/> : <span>{i+1}</span>}</span><div><strong>{stage.label}</strong><p>{actual?.detail || "Waiting for previous stage"}</p>{actual?.duration !== undefined && <small>{durationLabel(actual.duration)}</small>}</div></li>;
          })}</ol><div className="execution-footnote"><ShieldCheck size={15}/><span>Actual processing events. No simulated progress.</span></div></aside>
          <div className="run-content">{!active ? <section className="panel working-panel">{running ? <><div className="working-icon"><FileSearch size={34}/><span className="scan-line"/></div><h2>Building the decision trail</h2><p>Reading the evidence, applying the policy, and checking the vendor registry.</p><span className="working-note"><Loader2 size={14} className="spin"/>Processing your submission</span></> : <><CircleAlert size={34}/><h2>Review interrupted</h2><p>{error || "Open history to check whether a decision was saved."}</p><button className="button secondary" onClick={() => navigate("history")}>Check run history<ArrowRight size={16}/></button></>}</section> : <>
            <section className={`decision-panel ${active.status}`}><div className="decision-top"><span className="decision-icon">{active.status === "approved" ? <CheckCheck size={24}/> : active.status === "pending" ? <CircleAlert size={24}/> : <CircleX size={24}/>}</span><Badge status={active.status}/></div><h2>{active.status === "approved" ? "Ready for the next step." : active.status === "pending" ? "A few details need attention." : active.checks.some(c=>c.state==="fail" && c.terminal) ? "Onboarding is restricted by policy." : "This vendor is already onboarded."}</h2><p>{active.summary}</p><div className="decision-meta"><span><CheckCircle2 size={14}/>{active.checks.filter(c => c.state === "pass").length} checks passed</span><span><FileText size={14}/>{active.evidence.length} documents reviewed</span>{active.relatedRunId && <button className="text-button" onClick={() => { const related = reviews.find(x => x.id === active.relatedRunId); if (related) openReview(related); else setNotice("Related run is outside the latest 200 records."); }}>Related: {active.relatedRunId}<ArrowUpRight size={13}/></button>}</div></section>
            <section className="panel result-panel"><div className="result-tabs" role="tablist" aria-label="Review details">{([{id:"checks",icon:ClipboardCheck,label:"Decision checks"},{id:"documents",icon:FileText,label:"Documents"},{id:"response",icon:Mail,label:"Vendor response"}] as const).map(tab => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={resultTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setResultTab(tab.id)} className={resultTab === tab.id ? "current" : ""}><tab.icon size={15}/>{tab.label}</button>)}</div>
              <div role="tabpanel" id={`panel-${resultTab}`} aria-labelledby={`tab-${resultTab}`}>
              {resultTab === "checks" && <div className="checks-list">{[...active.checks].sort((a,b) => (a.terminal && a.state === "fail" ? -1 : a.state === "pass" ? 1 : 0) - (b.terminal && b.state === "fail" ? -1 : b.state === "pass" ? 1 : 0)).map(check => <details className={`check-row ${check.state}`} key={check.id} open={check.state !== "pass"}><summary><span className="check-icon">{check.state === "pass" ? <CheckCircle2 size={17}/> : check.state === "review" ? <CircleAlert size={17}/> : <CircleX size={17}/>}</span><strong>{check.label}</strong><span className="check-state">{check.state === "pass" ? "Passed" : check.state === "review" ? "Needs attention" : check.id === "duplicate" ? "Duplicate" : "Rejected"}</span><ChevronRight size={15} className="details-chevron"/></summary><div className="check-detail"><p>{check.detail}</p><span className="source-label"><FileText size={12}/>Source: {check.source}</span>{check.action && <div className="action-needed"><strong>Next step</strong><p>{check.action}</p></div>}</div></details>)}</div>}
              {resultTab === "documents" && <div className="documents-result"><p className="tab-description">Extracted fields retained for this run. Original uploaded files are processed in memory and are not stored.</p>{!active.evidence.length && <p>No supporting documents were supplied.</p>}{active.evidence.map(doc => <EvidenceCard key={doc.kind} doc={doc}/>)}</div>}
              {resultTab === "response" && <div className="vendor-response"><div className="response-heading"><div><h3>Vendor-facing response</h3><p>Generated from this run’s actual decision and required actions. Not emailed.</p></div><button className="button small secondary" onClick={async () => { try { await navigator.clipboard.writeText(active.response); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { download(`${active.id}-response.txt`, active.response, "text/plain"); } }}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? "Copied" : "Copy"}</button></div><pre>{active.response}</pre><button className="text-button" onClick={() => download(`${active.id}-response.txt`, active.response, "text/plain")}><ArrowDownToLine size={14}/>Download response</button></div>}
              </div><div className="result-footer"><span><ShieldCheck size={14}/>Saved with policy v{active.policyVersion}</span><button className="text-button" onClick={() => download(`${active.id}.json`, JSON.stringify(active, null, 2))}><ArrowDownToLine size={14}/>Export audit record</button></div>
            </section><p className="scope-note">Approval means the supplied evidence passes configured consistency checks. This workflow does not verify government registration, bank ownership, or sanctions status.</p>
          </>}</div></div>
        </>}
        {view === "policy" && <>
          <div className="page-heading"><div><p className="eyebrow">TRANSPARENT BY DESIGN</p><h1>Review policy</h1><p className="page-description">The checks behind every decision. Version {POLICY_VERSION}.</p></div><span className="policy-chip"><ShieldCheck size={14}/>India · Document consistency</span></div>
          <div className="policy-layout"><section className="panel policy-content"><SectionLabel number="01">What we check</SectionLabel><dl className="policy-rules">{[
            ["Required details", "Company name, contact email syntax, country, GSTIN, bank account number, and IFSC."],
            ["Registration", "India GSTIN structure, state-code range 01–38, and base-36 checksum. The certificate’s GSTIN and legal name must match the form."],
            ["Name normalization", "Case, punctuation, whitespace, and Pvt / Private and Ltd / Limited variations are normalized. Different names are not fuzzy-matched into an approval."],
            ["Banking", "Account number must have 9–18 digits. IFSC must match the configured 11-character structure. Account holder, full account number, and IFSC must match the uploaded proof."],
            ["Documents", "Both registration and bank proof are required. Any explicit expiry must be a valid YYYY-MM-DD date that has not expired (UTC). Missing expiry is not treated as proof of perpetual validity."],
            ["Policy restrictions", "A confirmed identity match to the fictional internal restriction or revoked-registration dataset is a rejection. Gambling services are excluded by the demo purchasing policy. These local references do not verify government or sanctions status."],
            ["Existing vendors", "A matching approved company, GSTIN, and banking fingerprint is a duplicate. A different company name or banking detail under an approved GSTIN needs manual review. The previous registry entry is never overwritten."],
          ].map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl><h3>Fictional policy reference records</h3><p>Server-owned demo data, matched by country, GSTIN, and registration identity. No government or sanctions API is connected.</p><dl className="policy-rules">{POLICY_REFERENCES.map(record=><div key={record.id}><dt>{record.id} · {record.kind === "blocked" ? "Internal restriction" : "Revoked registration"}</dt><dd>{record.legalName} · <span className="mono">{record.taxId}</span><br/>{record.reason}</dd></div>)}</dl><SectionLabel number="02">How decisions are made</SectionLabel><div className="status-policy"><p><Badge status="approved"/><span>All checks pass. Record the approved vendor in the registry.</span></p><p><Badge status="pending"/><span>A check needs attention and no confirmed policy prohibition applies. Return exact evidence requests. Missing or ambiguous evidence takes precedence over duplicate rejection.</span></p><p><Badge status="rejected"/><span>A confirmed internal restriction, revoked-registration reference, or excluded service category prevents onboarding. These prohibitions take precedence over missing banking evidence. Otherwise, consistent repeats of an approved vendor are rejected as duplicates.</span></p></div></section><aside className="policy-aside"><section className="panel"><h2>Supported inputs</h2><p>Text-based PDF, TXT, and JSON. Two files maximum, each up to 2 MB. PDFs up to 10 pages.</p><h3>Labelled text fields</h3><pre>Company name: …<br/>GSTIN: …<br/><br/>Account holder: …<br/>Account number: …<br/>IFSC: …<br/>Valid until: YYYY-MM-DD</pre><h3>JSON document keys</h3><pre>legalName, taxId,<br/>account, bankCode,<br/>validUntil</pre><p>All JSON values must be strings. Expiry is optional; when supplied, it is checked.</p></section><section className="plain-note"><CircleAlert size={18}/><p>The parser extracts explicitly labelled fields. It does not use an AI model or OCR. Scanned, encrypted, unlabelled, or conflicting documents go to manual review.</p></section><section className="plain-note"><ShieldCheck size={18}/><p>Audit records retain masked account numbers and a one-way bank fingerprint in the registry. Original files are not retained. History shows the latest 200 reviews.</p></section></aside></div>
        </>}
        <footer className="app-footer"><span>Vendor Review Desk</span><span>Submission → evidence → decision</span><span>Document consistency + demo procurement policy · v{POLICY_VERSION}</span></footer>
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
