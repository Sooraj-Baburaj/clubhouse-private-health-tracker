# Deploying Clubhouse

Production runs on **Vercel Hobby** (static apps + one Node function in `bom1`, Mumbai) and **Supabase Free**
(Postgres, Storage through its S3 API, Realtime broadcast) in `ap-south-1`. A free **cron-job.org** job drives the
minute-level scheduler, **Resend** sends the few admin emails, and **GitHub Actions** runs migrations and nightly backups.

Nothing here commits or pushes for you: review the changes, commit, and push `main` when you are ready.

## 1. Supabase

1. Create a project in **ap-south-1 (Mumbai)**. Save the database password.
2. **Database › Connection pooling**: copy two URLs.
   - Transaction pooler, port **6543** → `DATABASE_URL` (the app; prepared statements are already disabled).
   - Session pooler, port **5432** → `DATABASE_URL_MIGRATE` (migrations, seeds, backups).
   Append `?sslmode=require` to both.
3. **Storage**: create a **private** bucket `clubhouse-media`. Under **Storage › Settings › S3 connection** enable the S3
   protocol and create an access key. Note the endpoint (`https://<ref>.storage.supabase.co/storage/v1/s3`) and region.
4. **Project settings › API**: copy the project URL, the `anon` key and the `service_role` key (server only).
5. Apply the schema from your machine once (later changes go through the migrate workflow):

   ```bash
   DATABASE_URL_MIGRATE='postgres://…:5432/postgres?sslmode=require' pnpm db:migrate
   DATABASE_URL_MIGRATE='…' pnpm seed:all
   ```

## 2. Secrets and keys

Generate once and keep them in a password manager:

```bash
openssl rand -hex 32   # SESSION_PEPPER
openssl rand -hex 32   # TOTP_ENC_KEY (never change it: it decrypts enrolled authenticators)
openssl rand -hex 32   # CRON_SECRET
openssl rand -hex 16   # SETUP_TOKEN (only for the first-run endpoint)
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (never rotate casually: it breaks every subscription)
```

## 3. Vercel

1. Import the GitHub repository. Framework preset **Other**, root directory `/`. `vercel.json` sets the install and
   build commands; the build writes `.vercel/output` (both apps, the API function and the cron schedule).
2. **Settings › Functions**: region **Mumbai (bom1)**.
3. **Settings › Environment Variables** (Production and Preview):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `APP_ORIGIN` | `https://<your-domain>` (exact origin; used for CSRF checks and links) |
   | `DATABASE_URL` | transaction pooler URL (6543) |
   | `SESSION_PEPPER`, `TOTP_ENC_KEY`, `CRON_SECRET`, `SETUP_TOKEN` | from step 2 |
   | `STORAGE_DRIVER` | `s3` |
   | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Supabase Storage S3 values |
   | `REALTIME_ENABLED` | `true` |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase API values |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | keys + `mailto:you@yourdomain` |
   | `AI_MODE` | `live` |
   | `ANTHROPIC_API_KEY` | your Claude API key |
   | `AI_FALLBACKS` | `on` (server-side refusal fallback; set `off` for strictly predictable costs) |
   | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAILS` | Resend key, verified sender, comma-separated admin emails |

4. Deploy. Check `https://<domain>/api/health`: it should return `ok: true` with a database round-trip in milliseconds.
5. Add your custom domain, then update `APP_ORIGIN` to match it exactly and redeploy.

## 4. First Super Admin

Either run the CLI against the session pooler:

```bash
DATABASE_URL_MIGRATE='…:5432/postgres?sslmode=require' pnpm setup:super-admin --username you --name "Your Name" --email you@example.com
```

or call the one-time endpoint (works only while there are no users):

```bash
curl -X POST https://<domain>/api/setup -H "x-setup-token: $SETUP_TOKEN" -H 'content-type: application/json' \
  -d '{"teamName":"Clubhouse","timezone":"Asia/Kolkata","username":"you","displayName":"Your Name","password":"a-long-password-1"}'
```

Then sign in at `/admin`, enrol an authenticator (Settings › Security in the member app), set the AI monthly cap in
Admin › AI, switch AI on, and add members from Admin › Members. Remove `SETUP_TOKEN` afterwards.

## 5. Scheduler (cron-job.org)

Vercel Hobby crons run once a day, so a free cron-job.org job calls the tick every minute:

- URL `https://<domain>/api/jobs/tick`, method **POST**, every minute.
- Header `Authorization: Bearer <CRON_SECRET>`.
- Enable failure notifications.

The tick answers within a second and finishes its work in the background. Vercel also calls the tick and
`/api/jobs/daily` once a day as a catch-up. If the pinger stops for 15 minutes, the daily job emails and notifies the
Super Admins. Admin › Jobs shows the last runs and can run any step by hand.

## 6. Email (Resend)

Verify your sending domain in Resend, then set `EMAIL_FROM` to an address on it. Emails are only sent for AI budget
alerts (50/80/100 %) and the scheduler dead-man's switch.

## 7. GitHub Actions

Create a `production` environment with these secrets:

| Secret | Used by |
|---|---|
| `DATABASE_URL_MIGRATE` | `migrate.yml` (on pushes that touch migrations) and `backup.yml` |
| `BACKUP_AGE_RECIPIENT` | `backup.yml`: an `age` public key (`age-keygen -o key.txt`; keep `key.txt` offline) |

`ci.yml` runs typecheck, lint, unit, integration, build and Playwright on every push and pull request.

Deploys and migrations are not atomic, so schema changes follow expand → deploy → contract: add columns/tables first,
ship code that uses them, and remove old ones in a later release.

## 8. Backups and restore drill

Supabase Free has no automated backups and pauses projects after 7 idle days (the minute pinger keeps it awake).
`backup.yml` stores an encrypted `pg_dump` every night for 90 days. To restore:

```bash
gh run download <run-id> -n clubhouse-db-<stamp>
age -d -i key.txt clubhouse-<stamp>.dump.age > clubhouse.dump
pg_restore --clean --if-exists --no-owner -d "$NEW_DATABASE_URL_MIGRATE" clubhouse.dump
```

Do the drill once into a scratch Supabase project before relying on it. Meme and avatar images live only in Storage;
copy the bucket periodically (for example with `rclone` against the S3 endpoint).

## 9. Monitoring

- `/api/health` (DB round-trip) and Admin › Jobs (last 100 runs).
- Vercel › Logs: JSON lines with request id, route, status and latency.
- Admin › AI: spend against the cap, outcomes, per-member usage and the call log.
- Resend logs for alert emails.

## 10. Rotating secrets

- `CRON_SECRET`: update Vercel and cron-job.org together.
- `SESSION_PEPPER`: signs everyone out.
- `S3_*`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`: rotate at the provider, update Vercel, redeploy.
- `TOTP_ENC_KEY` and the VAPID keys should not be rotated; if you must, members re-enrol authenticators or re-enable push.

## 11. Trial checklist (SRS exit criterion)

Run 14 days with AI on and 7 days with AI off. Each day: every member logs, reminders arrive at the right local times,
Today's numbers match a hand check, streaks pause and resume as designed, chat and meme triggers behave, and Admin › Jobs
shows a tick every minute. File anything blocking before calling v1 done.
