# Public demo on Vercel

**Live: https://lnf-for-enterprises.vercel.app** (start at [/dev/tools](https://lnf-for-enterprises.vercel.app/dev/tools) to pick an account).

A showable copy of the portal on Vercel's free (Hobby) plan, with sample data. It is **not** the production setup in the plan (one VM, Cloudflare, real SSO); it exists so people can click through every role.

## How it runs

| Part            | Demo                                                                                     | Production (plan)        |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| Web app         | Vercel CDN, built with `--mode demo` (dev tools on `/dev/tools`, nothing on the top bar) | Served by the Node app   |
| API             | One Node function, `apps/server/src/vercel.ts`, region `sin1` (Singapore)                | Long-running Node server |
| Database        | Neon Postgres, free plan, `sin1`                                                         | Postgres on the VM       |
| Photos          | Postgres (`STORAGE_DRIVER=database`, table `stored_objects`)                             | S3 bucket (R2)           |
| Jobs and timers | Drained after requests (`drainJobs`), plus a daily Vercel cron to `/api/cron/tick`       | pg-boss workers and cron |
| Sign-in         | "Sign in as" a seeded account on `/dev/tools`                                            | SSO, email and SMS codes |
| Email           | Not sent (`EMAIL_TRANSPORT=memory`); in-app alerts work                                  | SMTP                     |
| SMS codes       | Shown on `/dev/tools` (dev adapter)                                                      | Provider (`todo#sms`)    |
| `APP_ENV`       | `demo`: needs https and real secrets, allows the dev adapters                            | `production`             |

Known limits: there is no identity provider, so the demo hides single sign-on and phone codes.

### Sign-in emails

- **Without an email service** (today: `EMAIL_TRANSPORT=memory`), no code can be sent. The sign-in page says so and links to `/dev/tools` ("Choose a sample account"), where you sign in as a seeded person or as any account by its email.
- **With an SMTP service**, the page becomes one email form: any address gets a code, `@northsouth.edu` addresses sign in as students (or as staff, if the Staff page added them), and any other address signs in as a visitor. Run `bash scripts/demo-email-setup.sh` yourself: it asks for the SMTP server, login and password (hidden), stores them in Vercel and redeploys. With Brevo, turn off "Authorized IPs" (Vercel has no fixed IPs) and send from a verified sender address. Time travel on `/dev/tools` only moves the clock of the function instance that handles the request. Practice mode has its own address (below).

## Practice mode (FR-21)

Practice mode is the second tenant, with the same people and catalog and its own sample records, so officers can rehearse without touching the main demo. It needs its own address: `PRACTICE_ORIGIN=https://lnf-for-enterprises-practice.vercel.app` is set in Vercel, the app trusts it for sign-in and forms, and the seed (run by every deploy) adds its host to the practice tenant.

**One step for you** (domain changes are yours to make): Vercel → `lnf-for-enterprises` → Settings → Domains → add `lnf-for-enterprises-practice.vercel.app`, or run `npx vercel@65.14.0 domains add lnf-for-enterprises-practice.vercel.app` in the repo folder. Then open `https://lnf-for-enterprises-practice.vercel.app/dev/tools`; a banner on every screen says it is practice mode.

Locally, add `PRACTICE_ORIGIN=http://practice.localhost:5173` to `.env` (new copies of `.env.example` have it) so writes work on `http://practice.localhost:5173`.

## Automatic deploys (CI/CD)

`.github/workflows/ci.yml` has two jobs:

1. **`verify`** runs on every push and pull request: every `pnpm verify` gate (format, types, lint, unit, API, end-to-end with axe, mutation, migrations, secrets, semgrep) against the local stand-ins.
2. **`deploy`** runs only for `main`, and only after `verify` passes (also from the Actions tab with "Run workflow"). It pulls the production settings from Vercel, runs `pnpm db:migrate` (as Neon's owner role) and `pnpm db:seed` (idempotent: it refreshes the catalog, people and tenant hosts and adds sample records only when they are missing), runs `pnpm build:vercel`, deploys with `vercel deploy --prebuilt --prod`, then checks `/healthz`. Deploys run one at a time in order, and the repo's "demo" environment shows the latest one.

So deepening the project needs no deploy steps: merge to `main`, and a new migration, seed change or screen goes live once the checks pass. Pull requests get CI only; there is no preview deploy, because a preview would share the demo database.

**To turn it on**, add one repository secret (until then the deploy job skips with a warning):

1. Vercel → Account Settings → Tokens → Create: name `github-actions`, scope the `nsu-232` team.
2. GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret: name `VERCEL_TOKEN`, value the token.

The workflow holds the team and project IDs; they identify the project but grant nothing without the token.

## One-time setup (done for the live demo)

The project `lnf-for-enterprises` (team `nsu-232`) is linked in `.vercel/project.json` (git-ignored).

1. **Create the database.** You accept Neon's terms yourself, so run this in your own terminal:

   ```bash
   npx vercel@65.14.0 integration add neon --name lnf-demo-db --billing-plan free_v3 \
     --meta region=sin1 --prefix NEON_ -e production --no-env-pull
   ```

   It adds `NEON_DATABASE_URL`, `NEON_DATABASE_URL_UNPOOLED` and friends to the project. The `NEON_` prefix keeps them apart from the app's own `DATABASE_URL`.

2. **Roles.** The app connects as `lf_app`, which has only the privileges the migrations grant (ADR-0004). Connect with `NEON_DATABASE_URL_UNPOOLED` (Neon's owner role) and run:

   ```sql
   CREATE ROLE lf_app LOGIN PASSWORD '<random 32+ characters>';
   GRANT CONNECT ON DATABASE neondb TO lf_app;
   ```

3. **Environment variables** (Vercel → Production). Generate the secrets fresh; never reuse `.env.example` values (demo mode refuses them).

   | Name                                                  | Value                                                                                |
   | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
   | `NODE_ENV` / `APP_ENV`                                | `production` / `demo`                                                                |
   | `APP_ORIGIN`                                          | `https://<production domain>` (for example `https://lnf-for-enterprises.vercel.app`) |
   | `PORT`, `LOG_LEVEL`, `ENABLE_DEV_TOOLS`               | `3000`, `info`, `true`                                                               |
   | `DATABASE_URL`                                        | the unpooled Neon URL with `lf_app` and its password                                 |
   | `DATABASE_POOL_MAX`                                   | `3`                                                                                  |
   | `BETTER_AUTH_SECRET`, `CRON_SECRET`                   | random, 32+ characters each                                                          |
   | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | `https://sso.invalid/nsu`, `demo`, random (SSO is off in the demo)                   |
   | `EMAIL_TRANSPORT`, `EMAIL_FROM`                       | `memory`, `NSU Lost & Found <no-reply@example.edu>`                                  |
   | `SMS_PROVIDER`, `REGISTRAR_PROVIDER`                  | `dev`, `dev`                                                                         |
   | `STORAGE_DRIVER`, `TRUSTED_CLIENT_IP_HEADER`          | `database`, `x-real-ip`                                                              |
   | `PRIVATE_DETAILS_KEYS`, `PRIVATE_DETAILS_KEY_VERSION` | `1:<base64 of 32 random bytes>`, `1`                                                 |

4. **Migrate and seed** from your machine with the same values (the seed encrypts private details, so it must use the same key ring). Set `DATABASE_OWNER_URL` to the unpooled owner URL, then run `pnpm db:migrate` and `pnpm db:seed`. The seed adds `APP_ORIGIN`'s host to the main tenant.

## Deploy by hand

CI does this for you (above). From your machine, with `vercel login`:

```bash
pnpm build:vercel                         # writes .vercel/output (git-ignored)
npx vercel@65.14.0 deploy --prebuilt --prod
```

Then open `https://<production domain>/dev/tools`, pick an account (Rafiq Ahmed is a student, Nusrat Jahan the desk officer, Farhana Islam a supervisor, Tanvir Alam the IT admin) and start from there. `GET /healthz` reports the database, jobs and storage.
