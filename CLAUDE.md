# iDisagree (argument_mapper) — notes for future sessions

Read the shared conventions first: `CHANGELOG.md`, then `best-practices.md`,
`css-best-practices.md` and `testing-guidelines.md`. They live in the
`apps-shared` repo — `../apps-shared/` here, otherwise
`github.com/alexkrewson/apps-shared`. Say "sync shared" to have them re-applied
to this project.

**Start at the `START HERE` block in `maintenance_todo.txt`** — the one dated
2026-08-12, near the top. It carries the current state: the app is submitted to
Play closed testing, what is deferred and why, and the one thing about the
tester round that is still unproven. The 08-07, 08-08 and 08-09 blocks below it
are accurate history; everything under them is superseded, including the 08-03
one that used to be the entry point.

`manual-test-plan.md` is the on-device pass: ~50 cases weighted towards what the
automated suites can't reach (touch, the back button, a real inbox, a real
network). It records what's been verified and **on which build** — every local
build is `versionCode 2`, so nothing distinguishes them from the phone.

## Machine setup

`ANDROID_SETUP_WINDOWS.md`. Windows is the only dev machine — the Ubuntu box
was retired 2026-08-05, and `ANDROID_SETUP_HANDOFF.md` is kept only as a
record of it. Nothing needs copying between machines any more.

## Non-negotiables

- **`supabase.from("debates")` is the live table name.** User-facing copy says
  "productive disagreement", but the schema, `data-debate-id`, the
  `debate-flow` anchor and the identifiers are deliberately unchanged.
- **iDisagree has its own Supabase project: `hdhqpeevtofevymayvie`.** Production
  moved there 2026-08-02. The old shared project (`ycuuxnscbxiibsnefgef`, "the
  keeper") still holds packing_lists and comment_cluster/Analyzer, plus an
  untouched copy of everything as the rollback — do not point anything here at
  it. Auth is one pool per project, not per schema, so it is *no longer* shared
  with the other two apps: deleting `auth.users` here costs this app only. Alex
  consequently has two independent identities under the same email, one in each
  project; changing the password in one does not change the other.
- **Never delete rows by position.** Always by id — a test once deleted a real
  user's debate by assuming "topmost History row = mine".
- **`npm run build:mobile`, never `npm run build`, for Android.** The Vite
  `base` differs. `npm run build:apk` does the whole chain.
- APK suites run with `--test-concurrency=1`. They share one device and one app
  instance; parallel files corrupt each other's state.

## Commands

```bash
npm run dev · npm run lint · npm run validate:apk   # build + 55 checks + report
npm run test:web            # web suite, free tier (excludes @costly)
npm run test:web:costly     # spends real credits, opt-in
npm run test:apk            # static only, ~1s, no device
npm run test:apk:costly     # spends real credits, opt-in
npm run report              # rebuild test-results/report/index.html
npm run ship                # deploy to Cloudflare + verify live + build APK
```

**`npx playwright test` with no args RUNS THE @costly TIER** — there's no
grep-invert in the config, so the free tier is only free if you ask for it by
name. Use `npm run test:web`.

Every test screenshots every UI action; `test-results/report/index.html` is the
combined web + Android report (left navbar, collapsible per file). Each suite
writes its own manifest there, so running one refreshes only its half. Set
`REPORT_STEPS=0` to skip capture while iterating.

Device suites need an emulator. Launch it **detached** or it dies with the
shell and takes the run with it:

```powershell
Start-Process "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" `
  -ArgumentList "-avd","idisagree_api36","-no-window","-no-audio",`
  "-no-boot-anim","-gpu","swiftshader_indirect" -WindowStyle Hidden
```

## Crash reporting

Sentry, wired in `src/utils/monitoring.js`, live since 2026-08-05 — project
`idisagree`. **No-ops without `VITE_SENTRY_DSN`**, which is still true of a
fresh clone but **no longer true of this machine**: `.env` now holds the DSN, so
`npm run dev` and the APK suites report to the *production* project. Only
errors are sent, so a green run is silent, but a failing test can file an issue
that looks like a real user's crash. Unresolved on purpose — the fix is a
separate `environment` or a flag in `beforeSend`, not deleting the DSN from test
builds, because the suite is supposed to test the build that ships.

The DSN is a write-only ingest key and is meant to be public; web reads it from
Cloudflare Pages variables, the APK bakes in whatever `.env` held at build time
— so **changing it needs a rebuild**, same as the Supabase anon key.

Breadcrumbs from `console`, `dom` and `ui.*` are dropped on purpose: people
paste real arguments into this app, and those categories carry the user's own
words. A stack trace is what fixes a crash. `public/privacy.html` documents
exactly this, so keep the two in step.

## Deployment

Cloudflare Pages, project `idisagree`, building from `master` — **not** GitHub
Pages, despite the Pages API still reporting `build_type: workflow`. A pushed
commit that fails to build is silent from outside, so confirm with
`npm run deploy:verify` rather than assuming the push was enough.
