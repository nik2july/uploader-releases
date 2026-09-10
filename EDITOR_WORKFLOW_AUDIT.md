# Baawaray Flow editor workflow audit

Updated: 10 September 2026

## Implemented in this update

- Replaced the editor-facing **Partner studio work** navigation with workflow-first sidebar items: Download, In Process, Sent for Review, Finalization, My Day Off, On Time, and Payments.
- Removed partner/client identity from editor project cards, search, empty states, and the payment table. Editors see Baawaray assignments, not the source studio.
- Remembered each completed download folder per signed-in editor and project on that Mac.
- Added **Open Folder**, **Locate Folder**, **Re-download**, and **Reset to Download Pending** actions after a download completes.
- Added an admin **Choose files to upload** path alongside folder upload. A batch intentionally accepts files from one Finder folder so names and relative paths remain deterministic.
- Preserved Unicode, spaces, punctuation, and the actual native basename for Dropbox deliverables instead of converting characters to underscores.
- Corrected the Backblaze B2 raw-data round trip so every manifest filename and nested path is reconstructed exactly; B2 project-prefix searches now use an exact folder boundary and cannot mix similarly named jobs.
- Added recursive authenticated Google Drive folder downloads and retained nested folder paths.
- Added path-containment checks for Drive and Backblaze downloads so a malformed cloud filename cannot write outside the selected destination.

## Release blocker: studio cloud credentials

The current implementation stores Dropbox and Backblaze credentials inside `studio_config/main`. Firestore allows every signed-in account to read that document, and the desktop context passes the credentials into the native process for editor sessions. Hiding the settings fields in the UI does not protect those credentials. A technically capable editor—or any other signed-in account—can recover them and gain the permissions carried by those tokens.

Do not distribute this build to external editors with production cloud credentials in that document.

Required architecture:

1. Move Dropbox and Backblaze secrets out of `studio_config/main` into an owner-only secret store or deployment environment variables.
2. Validate the Firebase user, active team membership, project assignment, requested operation, and project storage prefix on the server for every transfer authorization.
3. Give the desktop app only short-lived, project-scoped capability—not the studio refresh token or master B2 application key.
4. Make deletion, archival, sharing-policy changes, and credential configuration owner-only. This update already closes the native delete handlers to non-owner sessions, but the cloud-token design still needs the server boundary.
5. Revoke and replace the current Dropbox refresh token and B2 application key after the migration, because they have already been stored in a broadly readable document.

For raw footage, Backblaze's S3-compatible multipart flow with server-created, short-lived per-project authorizations is a good fit. For Dropbox, a personal Plus account has no true per-editor project permissions when one master OAuth token is installed on every editor Mac. Either mediate Dropbox operations through a trusted transfer service that keeps the token, or move to a Dropbox team model with real project-folder membership. Do not treat a path check in the desktop UI as access control.

## Important workflow gaps still present

### 1. Downloads are cancellable, not truly resumable

The current raw downloader streams into a new file and an interrupted attempt restarts that file. It does not persist byte offsets, ETags/checksums, or Range state across an app restart. Before using it for 1–2 TB jobs, add a durable per-file download journal equivalent to the existing upload journal:

- `.part` files plus saved byte offsets;
- HTTP Range / provider range requests;
- ETag, size, and checksum validation before resuming;
- pause and resume controls rather than only Cancel;
- restart recovery and final manifest reconciliation;
- retry/backoff per file, without restarting completed files.

### 2. Own-client deliverables are not unified in the desktop queue

The editor dashboard currently consumes assigned `freelance_jobs`. The web endpoint `/api/my-deliverables` can list own-client deliverables, but those records are not merged into the desktop workflow and the endpoint does not yet expose the complete raw-data/delivery/version model. The editor app therefore cannot yet honestly claim that every Baawaray assignment is available in one place.

Create one server-owned `editor_assignments` projection (or a normalized work-item API) that maps both sources to the same fields: assignment ID, title, service, stage, due date, raw package, download receipt, revision round, latest submitted version, pay, and permissions. Keep the original commercial client/studio fields out of this projection.

The current UI no longer displays the partner/client name, but the editor's Firestore query still downloads the full assigned freelance-job document, which contains that field. Treat the present change as presentation privacy only. If the identity must be confidential against inspection, the server projection is required.

### 3. Dropbox revision history is not enough for production versioning

The current editor action overwrites one Dropbox path. Dropbox may retain provider history, but Studio OS records only one `deliveryLink`, so V1/V2, feedback rounds, approvals, and rollback are not auditable in the workflow.

Use immutable app versions:

- first upload creates V1;
- each client-change round creates V2, V3, and so on;
- never delete or replace the prior app version;
- store uploader, timestamp, size, checksum, Dropbox path/link, feedback-round ID, and status for every version;
- show one clearly marked **Current review version** and keep older versions collapsed;
- final approval locks the approved version; later changes create a new paid change order/version instead of rewriting history.

Suggested Dropbox layout:

`/Deliverables/<job-code>/<deliverable-name>/V001/<original filename>`

### 4. Public Google Drive folders remain a compatibility fallback

Authenticated Drive folders now download recursively with their names and structure. Public-folder HTML parsing is not a stable API and cannot reliably discover every nested folder. Prefer an authenticated provider grant or Baawaray-controlled B2 package for large editor downloads; label public Drive links as browser fallback when API access is unavailable.

## Reliability improvements recommended next

1. Add a preflight manifest comparison before download: remote file count, total bytes, local free space, duplicate paths, and unsupported files.
2. Verify every completed package using provider checksum where available; display **Verified**, not merely **Downloaded**.
3. Add connection health and speed history, with an ETA range rather than a single optimistic ETA.
4. Detect unplugged external drives and pause cleanly; resume only after the same volume and source identity are confirmed.
5. Add a transfer event log visible to the editor and admin: selected, started, paused, resumed, failed, verified, opened, submitted.
6. Add deadline notifications based on working days and My Day Off, but allow the admin to override a generated due date with a reason.
7. Separate client feedback into numbered rounds with timecodes, attachments, assignee acknowledgement, and a resolved checkbox.
8. Add a project handoff checklist: footage verified, proxies present, brief read, fonts/assets received, sequence settings confirmed, and music/license notes present.
9. Remove the unused prototype editor screen once confirmed unused, to prevent two editor workflows drifting apart.

## Verification performed

- Node and renderer TypeScript checks pass.
- Production Electron/Vite build passes.
- All 105 automated tests pass, including new coverage for selected-file scans, exact Backblaze upload/download filename round trips, Unicode/original filenames, nested safe download paths, and per-editor downloaded-folder persistence.
