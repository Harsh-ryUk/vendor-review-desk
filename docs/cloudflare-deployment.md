# Deploy your GitHub repository on your own Cloudflare account

The repository includes a separate Cloudflare Workers + D1 deployment target. GitHub stores the code; Cloudflare builds and runs the web app and database. This deployment gives recruiters a public `workers.dev` link without ChatGPT sign-in.

The existing Sites deployment remains separate. Its database and history are not copied into your Cloudflare account. The independent deployment is a shared demonstration workspace; use the fictional sample inputs.

## 1. Create the database

1. Sign in at [Cloudflare](https://dash.cloudflare.com/).
2. Open **Storage & databases → D1 SQL database** and select **Create database**.
3. Name it **vendor-review-desk-db**.
4. Copy the database's **Database ID**.
5. In GitHub, edit [`wrangler.json`](../wrangler.json). Replace only the all-zero `database_id` with your real Database ID and commit to `main`. Keep the binding name **DB**.

The Database ID is configuration, not a password. No API tokens belong in the repository.

## 2. Initialize its two tables once

In the new database's **Console**, use [`cloudflare/schema.sql`](../cloudflare/schema.sql). Paste and execute the first `CREATE TABLE` statement, then paste and execute the second statement separately. These queries use `IF NOT EXISTS`, so you can retry if the first table was already created. Run `/tables` afterward and confirm both `reviews` and `vendors` appear.

Do not paste the Drizzle migration's `--> statement-breakpoint` marker into this single-line console. It is a SQL comment; if newlines are removed during pasting, it can hide the following statement and produce “SQL code did not contain a statement.” The Console schema file contains no migration comments.

Alternatively, if you have cloned the repository locally, initialize the fresh database with tracked migrations:

```sh
npm ci
npx wrangler login
npm run db:migrate:cloudflare
```

Choose either the Console or the migration method for initial setup. Do not apply the initial migration after creating the same tables manually. You do not need to run database setup on every deployment.

## 3. Connect GitHub and deploy

1. Open **Workers & Pages → Create application → GitHub** in Cloudflare.
2. Connect your GitHub account and select **Harsh-ryUk/vendor-review-desk**.
3. Configure these settings:

| Setting | Value |
| --- | --- |
| Worker / project name | `vendor-review-desk` |
| Production branch | `main` |
| Root directory | Repository root; leave blank or use `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Build variable | `NODE_VERSION` = `22` |

Use the existing configuration in the repository. Keep non-production branch builds disabled for this demo; the configuration uses one shared database.

4. Select **Save and Deploy**.
5. Open the actual `workers.dev` URL shown after the deployment succeeds. Keep that URL for the recruiter. A custom domain is optional.

Cloudflare Workers Builds handles installation and deploy authentication when connected through its dashboard. The current app does not require an AI key or email-provider key. Future pushes to `main` trigger a new build and deployment.

## 4. Verify recruiter access

1. Open the new URL in a private/incognito window. It should load without ChatGPT sign-in.
2. Open **Demo workspace → Run all 26 samples** to create a fresh set of real fictional reviews in this database.
3. Confirm **26 matched expectations**, then check the saved results in **Run history**.
4. Submit one of the [three manual vendor examples](manual-submissions.md).
5. Share the public app URL, GitHub repository URL, and your demo-video link with the recruiter.

## Local build and deployment commands

For an authenticated terminal and a configured Database ID:

```sh
npm ci
npx wrangler login
npm run build:cloudflare
npm run check:cloudflare
npm run deploy:cloudflare
```

`check:cloudflare` packages a dry run without uploading. Real deployment refuses the placeholder Database ID or a stale build targeting a different database.

`npm run build` still targets the original Sites setup. Always use **build:cloudflare** for this independent deployment.

## Troubleshooting

- **Placeholder Database ID:** replace the all-zero ID in `wrangler.json`, commit, and retry the build.
- **No such table: reviews:** initialize the new D1 database before testing submissions.
- **Worker name mismatch:** the dashboard's Worker name must match `name` in `wrangler.json`.
- **Database not found:** confirm the Database ID belongs to the same Cloudflare account as the Worker.
- **Deploy says stale build:** run `npm run build:cloudflare` after changing the Database ID.
- **Builds used the default command:** change it to `npm run build:cloudflare`, with deploy command `npm run deploy:cloudflare`.
- **Your new dashboard is empty:** this is a separate database. Run the sample batch on the new app to populate it.

Official references: [Workers Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/), [build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), and [D1 setup](https://developers.cloudflare.com/d1/get-started/).
