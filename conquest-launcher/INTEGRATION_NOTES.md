# Conquest of AzerothCore Launcher v0.2.0

## Database

The existing launcher navigation and visual design are unchanged. The Database tab now hosts the live Ascension Database in an isolated Electron `WebContentsView`:

- `https://ascension-db.ascension-archive.workers.dev/`
- Node integration disabled
- context isolation + sandbox enabled
- permissions denied
- top-level navigation restricted to the database origin
- external HTTPS links open in the player's normal browser

The view is hidden whenever the user leaves the Database tab or opens a launcher modal.

## Bugtracker

The Bugtracker tab now reads live open issues from:

- `jealous-sound/azerothcore-wotlk-coa`

It supports live issue browsing, search, refresh, issue details, and opening a selected issue on GitHub.

The Report a Bug button now opens a native launcher form. `launcher.config.json` contains:

```json
"bugtracker": {
  "repository": "jealous-sound/azerothcore-wotlk-coa",
  "submitUrl": ""
}
```

`submitUrl` is intentionally blank. Do **not** put the private Railway `/v1/reports` endpoint plus its `REPORT_API_KEY` in the distributed launcher; Electron applications can be inspected by players.

With `submitUrl` blank, the native form creates a prefilled GitHub issue draft and opens it for the player to review/submit. Once a safe player-facing HTTPS intake is deployed, set `submitUrl` to that endpoint. The launcher sends only:

```json
{
  "title": "...",
  "body": "..."
}
```

A successful direct endpoint should return JSON containing a positive integer `issue_number`.

## Navigation

Preserved exactly:

Home | News | Store | Bugtracker | Wiki | Database | Addons

## Local AddonCatalog (v0.3.0)

`src/assets/AddonCatalog/` is now a functional local addon source in development builds. The launcher scans each top-level addon folder and reads its `.toc` metadata. Companion suites are grouped into one catalog package (for example DBM, Details, ElvUI, TradeSkillMaster and WeakAuras) while preserving every bundled folder.

When a WoW client is selected, the Addons page scans `<client>/Interface/AddOns/` and reports Available, Installed, Update Available or Needs Repair. Install/Repair copies the catalog package into that folder. Required dependencies that are also present in the catalog are installed first. Uninstall removes only the package's catalog folders and leaves `WTF` / SavedVariables untouched. A package cannot be removed while another installed catalog package declares it as a required dependency.

Addon changes are blocked while the game process launched by this launcher is running. File replacement is staged in the target AddOns directory and existing folders are temporarily renamed so an interrupted copy can be rolled back instead of leaving a half-copied package.

For packaged Electron builds the catalog is emitted through `extraResources` as `resources/AddonCatalog` instead of being trapped inside `app.asar`. This local provider can later be replaced by the launcher backend/CDN without redesigning the Addons page.
