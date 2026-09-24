# Neon setup

## Check your database connection locally

Install dependencies with `npm ci`. Put your Neon PostgreSQL connection string in
the gitignored `.env` or `.env.local` as `DATABASE_URL`, then run:

```sh
npm run db:check
```

Open `http://127.0.0.1:3000/`. A successful `SELECT version()` returns the database
version as plain text. Failure returns HTTP 503 without provider error details.
Stop with Ctrl+C. If port 3000 is busy, set `NEON_CHECK_PORT` to another port.
This command loads `.env` followed by `.env.local`; the latter overrides duplicate
file entries, while existing shell environment values take precedence.

This is a standalone local diagnostic adapted from the Neon HTTP server example
to this ES-module repository. Node 24 loads the environment files without dotenv.
It binds only to loopback and is not included in the public website or serverless
API routes. It does not change application tables or replace the existing `pg`
driver used by authentication and transactional booking operations.

Target project: `gentle-frog-90350277`. Target branch ID: `br-noisy-butterfly-azhmutuk`.
The branch name has not been verified; commands use the supplied ID explicitly.

The requested `neon.ts` declares managed Neon Auth, a private `uploads` bucket,
and a sample `api` function from `hello.ts`. AI Gateway remains disabled.
This does not migrate the application's existing Better Auth integration or deploy
its existing API handlers. The sample endpoint returns only a greeting.

## Deploy only the sample function

From the repository directory after merging and pulling these changes:

```sh
npm ci
npm i -g neon
neon login
npm run neon:link
npm run neon:deploy:function
```

The link command uses `--no-env-pull` to preserve existing local application
credentials. The deploy command explicitly targets project `gentle-frog-90350277`
and branch `br-noisy-butterfly-azhmutuk`, even if a different branch is linked.
It deploys slug `api` from the existing `hello.ts` using Node 24 and waits for
completion. Redeploying that slug updates the existing function on this branch.

The equivalent direct deployment command is:

```sh
neon function deploy api --src ./hello.ts --project-id gentle-frog-90350277 --branch br-noisy-butterfly-azhmutuk --runtime nodejs24 --wait
```

Before deploying, confirm in the Neon console that this branch belongs to your
intended project and that its region supports Functions. Account access and region
availability have not been verified from this workspace. Sign in on your computer;
never commit an API key or database URL.

After success, open the HTTPS function URL returned by Neon and confirm it responds
with `Hello from Neon Functions`. This is a greeting endpoint, not a database
connectivity test or a migration of the website's existing backend. It needs no
application secrets. This command is manual; the Vercel build does not deploy it.

## Full service setup (separate from a single-function deployment)

Run in the repository directory on the computer where you sign in:

```sh
npm ci
npm i -g neon@latest
neon login
neon link --project-id gentle-frog-90350277 --branch-id br-noisy-butterfly-azhmutuk --no-env-pull
neon config plan
neon deploy
```

Inspect the plan for existing-resource changes and confirm the project region
supports Functions and Object Storage. Do not enable a paid plan implicitly.
Linking/deployment can pull credentials into `.env` or `.env.local`; both are
gitignored. Do not publish their contents. The project-local MCP configuration
uses OAuth and requires a separate client sign-in; no API key is embedded.

## Connect KuboVistas separately

Use the project's pooled PostgreSQL connection as the application's server-only
`DATABASE_URL`. Preserve the existing Better Auth secret, URL and email settings.
The migration script currently reads `.env` explicitly, so an `.env.local` pulled
by Neon is not automatically used by `npm run db:migrate`. Load the correct
environment deliberately. Review and apply the six application migrations in a
test branch before production, then test signup, verification and data isolation.
Provisioning Neon Auth alone does not switch the website to managed Neon Auth.

The sample function does not expose database data or implement account, payment,
upload or booking endpoints. Those remain in the application's current backend.
