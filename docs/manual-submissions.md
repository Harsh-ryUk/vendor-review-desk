# Three vendor submissions for the live demo

Open [the public demo](https://vendor-review-desk.harshmahar786.workers.dev/), click **New submission**, and enter one of the examples below. These are fictional companies, contact addresses, tax identifiers, and banking details. No email is sent.

The JSON form files in [`examples/manual-submissions/`](../examples/manual-submissions/) can now be uploaded with **Upload vendor details** to fill the form. They are not registration or bank proof; upload the supporting PDFs below in their respective upload areas. You can also attach the two proofs first to fill the company/GSTIN and banking fields, then enter any missing contact details.

## 1. Northstar Studio — approval

| Form field | Enter this value |
| --- | --- |
| Registered company name | Northstar Studio Private Limited |
| Contact email | finance@northstar.example |
| Country | India |
| GSTIN | 29AAACN1234A1Z3 |
| Bank account number | 102030405678 |
| IFSC | HDFC0001234 |

Upload:

- Registration certificate: [`northstar-registration.pdf`](../public/samples/northstar-registration.pdf)
- Bank account proof: [`northstar-bank.pdf`](../public/samples/northstar-bank.pdf)
- Form reference: [`northstar.json`](../examples/manual-submissions/northstar.json)

Leave **Service category** as **General goods and services**. Click **Run vendor review**. On a registry without this GSTIN, expect **Approved**, all 15 checks passed, and a saved vendor record. The bank proof uses “Pvt. Ltd.”; the app correctly normalizes that legal-name variation.

If this exact vendor is already approved, expect **Rejected** as a duplicate. This is intentional. For a fresh approval on every rehearsal, use **Demo workspace → Everything matches**, which generates a fresh fictional identifier. Do not change only the form's GSTIN: the registration document must match it too.

## 2. Willow Works — missing bank proof

| Form field | Enter this value |
| --- | --- |
| Registered company name | Willow Works Private Limited |
| Contact email | accounts@willow.example |
| Country | India |
| GSTIN | 27AAACW4321B1ZU |
| Bank account number | 204060801234 |
| IFSC | ICIC0001234 |

Upload:

- Registration certificate: [`willow-registration.pdf`](../public/samples/willow-registration.pdf)
- **Leave Bank account proof empty.**
- Form reference: [`willow.json`](../examples/manual-submissions/willow.json)

Expect **Needs review** (the stored status is `pending`). Open the decision checks to show the missing proof, then **Vendor response** to show the exact request for a bank document. The vendor must not be entered in the approved registry.

## 3. Cedar Supply — account-holder mismatch

| Form field | Enter this value |
| --- | --- |
| Registered company name | Cedar Supply Private Limited |
| Contact email | finance@cedar.example |
| Country | India |
| GSTIN | 29AAACC5678C1ZM |
| Bank account number | 305070901234 |
| IFSC | HDFC0001234 |

Upload:

- Registration certificate: [`cedar-registration.pdf`](../public/samples/cedar-registration.pdf)
- Bank account proof: [`cedar-bank.pdf`](../public/samples/cedar-bank.pdf)
- Form reference: [`cedar.json`](../examples/manual-submissions/cedar.json)

Expect **Needs review**. The submitted company is **Cedar Supply Private Limited**, while the bank proof names **Cedar Logistics Private Limited**. Show the expanded account-holder check and the generated request for matching bank proof or an explanation for manual review. This mismatch is not automatically treated as proven fraud.

## Suggested recording sequence

1. Show Northstar's actual form and uploads, then run the approval.
2. Run Cedar to demonstrate the account-holder conflict and follow-up response.
3. If time permits, run Willow or repeat Northstar to demonstrate missing evidence or duplicate rejection.
4. Open **Run history**, reopen a saved result, and show the execution trail, extracted fields, and reasoning.

Keep the video below five minutes. Approval here means the supplied evidence passes the configured consistency policy; it does not establish government registration, bank ownership, or payment authorization.
