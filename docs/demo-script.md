# Five-minute demo recording

Aim for 4 minutes 40 seconds. Use a screen recorder and your own narration. No slides are needed. Record the real app; do not replace execution with precomputed results.

## Prepare before recording

1. Open the deployed app and confirm that your recording browser can access it.
2. Load Everything matches for a fresh fictional company identifier. Keep the same tab open so changed-bank and duplicate cases can reuse this approved baseline. Do not reload between these dependent cases.
3. Keep the clean Northstar result available so the changed-bank scenario has an approved baseline.
4. Rehearse the clean path and Cedar conflict once. Verify extraction and history. The full 26-case suite is available for preparation; keep the recording focused on the core cases.
5. Hide unrelated browser tabs and notifications. Use the app at a readable desktop width.

## 0:00–0:25 — Explain the user and problem

“This is Vendor Review Desk, built for a procurement team reviewing new vendors. The team needs to know whether a submission is complete and internally consistent, and exactly what to ask for when it is not.”

Point to the overview: actual submission counts, statuses, search, and recorded history.

## 0:25–1:45 — Run the happy path

Open the demo workspace and load the clean submission. Show the form and attached sample registration and bank PDFs.

“The sample companies and identifiers are fictional, but these are actual generated PDF files with labelled fields. Loading the example only fills the form. Clicking Run starts the same process used for any upload.”

Run the review. Show the execution trail and the approved result.

“The process reads explicitly labelled fields, checks registration structure and consistency, compares banking evidence, checks the approved vendor registry, and persists the result. These are real server events. There are no artificial progress delays.”

Open **Documents** and show the extracted name, GSTIN, and masked account number. Open one passed check to show its source and comparison.

## 1:45–3:05 — Run a meaningful exception

Load Cedar’s account-holder conflict and run it.

“The company on the form is Cedar Supply. Its bank proof names Cedar Logistics. I treat that as missing evidence for approval, not proof of fraud. It goes to manual review and cannot create an approved registry entry.”

Show the expanded failed check and then the **Vendor response** tab.

“The next step is specific: supply bank proof in the registered company name or evidence explaining the difference. The result is available immediately to the form submitter, with copy and download options. This version does not send email.”

## 3:05–3:45 — Show change protection

If time permits, run Northstar’s changed-bank scenario after its clean approval. Show the related original run.

“A familiar tax ID does not make new bank details safe. This request is held for independent verification. The existing approved banking record is not overwritten. Loading Identical repeat submission reuses the approved baseline and produces a duplicate rejection.”

## 3:45–4:15 — Show persistence and explain decisions

Open history or reload a saved run.

“Each result retains the policy version, processing stages, extracted evidence, checks, and next steps. A unique tax identifier and an atomic database write prevent concurrent submissions from creating two approved vendors.”

## 4:15–4:40 — State the boundaries and next step

“I scoped the build to India and text-based, labelled documents. It checks supplied evidence for consistency; it does not independently verify tax registration or bank ownership. Unreadable or ambiguous inputs go to manual review. I used AI to help build and test the application; this deployed version uses a deterministic document parser and decision rules. My next step would be OCR and source-grounded model extraction, while keeping the final policy decisions explicit.”

## Before submitting

- Confirm the final URL permits the hiring coordinator to access and run the app. The initial Sites deployment is private; a private owner-only URL alone is not a sufficient reviewer handoff.
- Confirm the video is less than five minutes and its sharing permissions permit the coordinator to watch it.
- Show a happy path and at least one edge case running live in the recording.
- Keep the four scenarios and the explanation of policy assumptions ready for the interview.
- Send the live process link and the video link to the hiring coordinator. No submission message has been sent by this app or by Codex.
