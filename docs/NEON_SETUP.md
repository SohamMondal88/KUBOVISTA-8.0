# Neon setup

Target project: `gentle-frog-90350277`. Target branch: `production`.

The requested `neon.ts` declares managed Neon Auth, a private `uploads` bucket,
and a sample `api` function from `hello.ts`. AI Gateway remains disabled.
This does not migrate the application's existing Better Auth integration or deploy
its existing API handlers. The sample endpoint returns only a greeting.

## Finish after authentication

Run in the repository directory on the computer where you sign in:

```sh
npm ci
npm i -g neon@latest
neon login
neon link --project-id gentle-frog-90350277 --branch production -y
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
