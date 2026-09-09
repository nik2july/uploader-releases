# Baawaray Uploader

A Mac app for getting a wedding's worth of footage — routinely 1–2 TB — from a
drive on this desk into Google Drive, and handing the resulting link to the
person who has to edit it.

Uploading that much through drive.google.com in a browser has no pause, no
resume, and no way to find out afterwards which files did not make it, which is
what made folder-by-folder checking a regular job. This app uploads with Drive's
resumable protocol, journals every file's progress to disk, and verifies each
one by checksum before it will call a folder ready to share.

## What it does

| Screen | What it is for |
| --- | --- |
| **Uploads** | Everything in flight — progress, what is left, pause and resume, and anything needing attention. |
| **Partner studio work** | Freelance jobs read live from Studio OS. Pick one, pick its folder. |
| **Client deliverables** | Your own clients' deliverables, with raw footage and the finished delivery kept as separate links. |
| **Completed & links** | Copy the Drive link, grant the recipient access, open a written WhatsApp message, save the link back onto the job. |
| **Settings** | The Drive account for this Mac, and the measurement defaults shared with the web app. |

Choosing a folder also measures it: total video duration across all cameras,
photo counts with RAW+JPEG pairs counted once, and total size. Those feed the
billing preview, which uses the same pricing rules as the web app
(`WEB APP/src/utils/mediaPricing.ts`, imported directly rather than copied) so a
job priced here and the same job priced in the browser cannot disagree.

## Setting up Google Drive

The app talks to Drive as **your own** Google Cloud project, so nothing passes
through a third party. Once, per Mac:

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   enable the **Google Drive API** and create an OAuth client of type
   **Desktop app**.
2. Paste the client ID (and the secret, if Google issued one) into
   **Settings → Google Drive** and save.
3. Click **Connect Google Drive** and complete the sign-in that opens in your
   browser.

Credentials are encrypted with macOS `safeStorage` under your Mac account and
never reach the web app. The app requests only the `drive.file` scope, so it can
see the files it created and nothing else in your Drive.

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build:mac
```

`npm run build` runs the typechecks and bundles; `npm run build:mac` also
packages a `.dmg` into `dist/`.

## How it is put together

- `src/main` — the transfer engine. It owns the queue, so uploads keep going
  with the window closed and survive a quit or a crash.
  - `store.ts` — SQLite journal (`node:sqlite`). One row per file, holding its
    Drive id, upload session, confirmed byte offset and checksum.
  - `scanner.ts` — walks the folder, counts photos, measures clips with
    `ffprobe`, and records anything it could not read rather than counting it
    as zero.
  - `drive.ts` / `googleAuth.ts` — resumable uploads, PKCE sign-in, and the
    classification of Drive's errors into *retry*, *out of quota*, *reconnect*
    and *stop*.
  - `transferEngine.ts` — the queue itself: chunked uploads, resume from the
    byte Drive actually acknowledged, per-file checksum verification, and
    backoff.
  - `ipc.ts` — every channel the renderer may call, each one checked for a
    trusted sender frame and for the signed-in studio owner.
- `src/preload` — the only bridge; upload sessions and credentials never cross
  it.
- `src/renderer` — the five screens above. Its `types/`, `utils/` and `data/`
  are kept as a copy of the web app's so both price and format identically;
  those files build with `noUnusedLocals` off for the same reason the web app
  does (see `tsconfig.web.json`).
- `src/shared/contracts.ts` — the one description of what crosses the bridge.

## Things worth knowing

- **Google's daily limit.** Workspace accounts can upload about 750 GB a day. A
  1–2 TB folder therefore spans more than one day. The app shows *Waiting for
  Google upload limit*, keeps the queue, and retries when it is eligible again.
- **Sessions expire.** Drive resumable sessions last a week. A file whose
  session has expired restarts; files already uploaded and verified are not
  sent again.
- **A link is not access.** A Drive URL grants nothing on its own. Grant the
  recipient access from **Completed & links** before sending it.
- **WhatsApp is prepared, not sent.** The button opens the chat with the message
  written. Pressing send is still yours to do; the app records only that a
  message was prepared.
- **Nothing is ever deleted.** Verification failures stop and report; they never
  overwrite or remove anything, locally or in Drive.
- **Issued invoices are immutable.** Re-scanning or retrying an upload cannot
  reprice a job, and an agreed package price is never changed by measuring a
  folder.

## Not done yet

- **Code signing and notarisation.** `build:mac` produces an unsigned app —
  add a Developer ID identity, then set `notarize` in `electron-builder.yml`.
- **Auto-update.** `src/main/updater.ts` exists but is deliberately not wired
  up, and `electron-builder.yml` publishes nowhere. Point it at a real feed
  before calling it from `src/main/index.ts`.
- **Lint.** `npm run lint` reports pre-existing formatting and
  `explicit-function-return-type` complaints across the ported web-app files.
  It is not part of `npm run build`.
