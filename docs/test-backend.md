# Local test backend (Appwrite)

Used by the sync integration tests and the `SyncRemote` contract suite (Req 19.4, 19.11).
Tests that need it skip with a visible message when the variables below are absent.

## 1. Start a throwaway Appwrite (optional, needs Docker Desktop running)

```
docker compose -f docker-compose.test.yml run --rm appwrite-installer
```

This runs the official Appwrite installer, which writes the real compose file and `.env`
into `./.appwrite-test/` (gitignored) and starts the stack on http://localhost. Open
http://localhost, create a root account, a project, and an API key with scopes
`databases.*`, `tables.*`, `columns.*`, `indexes.*`, `rows.*`, `users.write`.
If the installer's non-interactive mode differs for your version, run Appwrite's
documented installer by hand; only the endpoint, project id and key below matter.

Tear down: `docker compose --project-directory .appwrite-test -f .appwrite-test/docker-compose.yml down -v`

## 2. Environment variables (export in your shell; never commit)

| Variable                      | Meaning                                                |
| ----------------------------- | ------------------------------------------------------ |
| `APPWRITE_TEST_ENDPOINT`      | e.g. `http://localhost/v1`                             |
| `APPWRITE_TEST_PROJECT_ID`    | test project id                                        |
| `APPWRITE_TEST_API_KEY`       | server key with the scopes above                       |
| `APPWRITE_TEST_USER_PASSWORD` | optional password for the seeded users (local default) |

## 3. Seed

```
node scripts/seed-test-backend.mjs --dry-run   # validate, no network
node scripts/seed-test-backend.mjs             # apply schema + create test-user-a / test-user-b
```

Reuses `appwrite/setup.mjs`; idempotent. Refuses non-local endpoints unless `--allow-remote`
is passed, so a real project is never touched by accident. A hosted Appwrite test project
also works the same way with `--allow-remote`.

Not verified on the authoring machine: Docker was installed but its daemon was not running,
so the compose/installer flow has not been exercised.

## 4. Running the real-Appwrite suites from `.env.local` (PowerShell)

Status: the real-Appwrite runs of the `SyncRemote` contract suite (task 22.6) and the
isolation suite (task 22.7) have NOT been done. Every automated run so far skipped them with
a visible message, because `APPWRITE_TEST_*` was not set. A skip is not a pass.

Use a dedicated test project only. The seed creates `test-user-a` and `test-user-b`, and the
contract suite signs up one throwaway `contract-<uuid>@example.test` user per test, which is
not cleaned up. Email/password sign-up must be enabled on the project.

Run these from the repo root in one PowerShell session. They load `.env.local` into the
session's environment without printing any values, and map the server-side `APPWRITE_*`
names (see `.env.example`) to the `APPWRITE_TEST_*` names the tests read.

```powershell
# 1. Load KEY=VALUE lines from .env.local into this session only (comments are skipped).
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $value = $Matches[2].Trim().Trim('"').Trim("'")
    Set-Item -Path "Env:$($Matches[1])" -Value $value
  }
}

# 2. Map to the names the tests expect.
$env:APPWRITE_TEST_ENDPOINT   = $env:APPWRITE_ENDPOINT
$env:APPWRITE_TEST_PROJECT_ID = $env:APPWRITE_PROJECT_ID
$env:APPWRITE_TEST_API_KEY    = $env:APPWRITE_API_KEY

# 3. Check presence without echoing values (expect three "True").
'APPWRITE_TEST_ENDPOINT','APPWRITE_TEST_PROJECT_ID','APPWRITE_TEST_API_KEY' |
  ForEach-Object { "$_ set: $([bool](Get-Item "Env:$_" -ErrorAction SilentlyContinue).Value)" }

# 4. Apply schema and create the two isolation users (idempotent).
#    --allow-remote is required for Appwrite Cloud or any non-localhost endpoint.
node scripts/seed-test-backend.mjs --dry-run
node scripts/seed-test-backend.mjs --allow-remote

# 5. Contract suite (task 22.6). Uses only endpoint + project id, never the API key.
pnpm vitest run packages/sync-engine/src/remote-contract.test.ts

# 6. Isolation suite (task 22.7). Uses the API key only to mint user JWTs and clean up.
pnpm vitest run tests/integration/appwrite-isolation.test.ts

# 7. Clear the variables when done.
Get-ChildItem Env: | Where-Object Name -like 'APPWRITE_*' | ForEach-Object { Remove-Item "Env:$($_.Name)" }
```

What to expect:

- Step 5: three `runRemoteContract` groups run (`InMemoryRemote`, `AppwriteRemote (mocked SDK port)`
  and `AppwriteRemote (real test backend)`). The real group must report its tests as passed,
  not skipped. If it still shows the skip reason `set APPWRITE_TEST_ENDPOINT, ...`, step 2 did
  not take effect in this session.
- Step 6: the stderr line `[appwrite-isolation] SKIPPED` must be absent, and all 8 tests must
  pass: owner sanity read, cross-team get/list/update/delete denied (401, 403 or 404), and
  bills not updatable or deletable even by the owning team.
- Common failures: 401 on sign-up means email/password auth is disabled; a failing
  `jwt for test-user-a` means step 4 was skipped or the key lacks `users.write`; 404 on a
  table means the schema was not applied to database `awaaz`.

Once both pass, record the date, Appwrite version (Cloud or self-hosted) and pass counts here.
