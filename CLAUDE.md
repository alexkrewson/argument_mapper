# iDisagree (argument_mapper) — notes for future sessions

Read the shared conventions first: `CHANGELOG.md`, then `best-practices.md`,
`css-best-practices.md` and `testing-guidelines.md`. They live in the
`apps-shared` repo — `../apps-shared/` here, `/home/alex/apps/shared/` on the
Ubuntu box, otherwise `github.com/alexkrewson/apps-shared`. Say "sync shared"
to have them re-applied to this project.

**Start at the `START HERE NEXT SESSION` block in `maintenance_todo.txt`.** It
carries the current state, what's deliberately unpushed and why, and what's
blocking Play submission.

## Machine setup

`ANDROID_SETUP_WINDOWS.md` (Windows) or `ANDROID_SETUP_HANDOFF.md` (Ubuntu).
They are not interchangeable — paths, JDK and emulator differ.

## Non-negotiables

- **`supabase.from("debates")` is the live table name.** User-facing copy says
  "productive disagreement", but the schema, `data-debate-id`, the
  `debate-flow` anchor and the identifiers are deliberately unchanged.
- **Auth is shared across every app in this Supabase project.** One pool per
  project, not per schema (see `apps-shared/todo.md`). Deleting `auth.users`
  costs that person their Analyzer and packing-list access too.
- **Never delete rows by position.** Always by id — a test once deleted a real
  user's debate by assuming "topmost History row = mine".
- **`npm run build:mobile`, never `npm run build`, for Android.** The Vite
  `base` differs. `npm run build:apk` does the whole chain.
- APK suites run with `--test-concurrency=1`. They share one device and one app
  instance; parallel files corrupt each other's state.

## Commands

```bash
npm run dev · npm run lint · npm run validate:apk   # build + 55 checks + report
npm run test:apk            # static only, ~1s, no device
npm run test:apk:costly     # spends real credits, opt-in
npm run ship                # deploy to Cloudflare + verify live + build APK
```

Device suites need an emulator. Launch it **detached** or it dies with the
shell and takes the run with it:

```powershell
Start-Process "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" `
  -ArgumentList "-avd","idisagree_api36","-no-window","-no-audio",`
  "-no-boot-anim","-gpu","swiftshader_indirect" -WindowStyle Hidden
```

## Deployment

Cloudflare Pages, project `idisagree`, building from `master` — **not** GitHub
Pages, despite the Pages API still reporting `build_type: workflow`. A pushed
commit that fails to build is silent from outside, so confirm with
`npm run deploy:verify` rather than assuming the push was enough.
