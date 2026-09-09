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

**You only do this once, for the studio — not once per Mac.** Saving the client
also writes it to `studio_secrets/uploader_oauth` in Firestore, which the
security rules make readable by the studio owner alone. Any other Mac that signs
in fetches it and configures itself, so nobody has to be sent the secret in a
message.

It is deliberately not compiled into the app: the installer is published on a
public releases page, and anything inside it is public. On each Mac the client
is kept encrypted with macOS `safeStorage`, tied to that Mac's login, and it
never reaches the web app's own servers.

Connecting Drive is still per person — that grants this app access to *your*
Drive account and is nobody else's to give. The app requests only the
`drive.file` scope, so it can see the files it created and nothing else.

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

```bash
npm test
```

`npm run build` runs the typechecks, then the tests, then bundles;
`npm run build:mac` does all of that and packages a `.dmg` into `dist/`.

## Tests

`test/` covers the transfer engine, because the failures that matter are the
ones nobody is watching: a dropped connection at 3am, a session Drive forgot, a
laptop that slept. `DriveClient` takes its `fetch` as a constructor argument, so
`test/helpers.ts` supplies an in-process Drive and the real protocol code —
allow-list, error classification, `Content-Range` arithmetic — runs against it
unchanged. No credentials, no network, no terabytes.

What is covered: resuming from the byte Drive actually acknowledged; a
forgotten session restarting one file and no others; the 750 GB daily limit
parking a job with its queue intact; checksum and size mismatches stopping
rather than being reported as ready; a source file edited or a drive unplugged
mid-transfer; recovery after the app dies mid-upload; and the photo counting
and billing exclusions the invoice is built from.

Clip durations are measured by `ffprobe` against real media, so only the
*unmeasurable* case is tested — there are no video fixtures in the repo. That
path matters on its own: a clip whose duration cannot be read is reported as
unknown, never counted as zero.

## Installing it on another Mac

```bash
npm run build:mac
```

That produces `dist/Baawaray-Uploader-<version>.dmg`. Copy it to the other Mac,
open it, and drag the app into Applications. The `WEB APP` folder is only needed
to *build*; the packaged app carries everything it needs.

The build is **ad-hoc signed** — see `build/afterPack.cjs`. That is not a
Developer ID and does not make the app trusted, but it does seal the bundle, so
macOS reports it honestly as an app from an unidentified developer rather than
claiming it is *damaged and can't be opened*. Without it, electron-builder ships
a bundle whose only signature is the linker's stub on the Electron binary,
covering neither the Info.plist nor any resource, and Apple Silicon treats that
as corrupt.

**It is still not trusted**, so macOS will refuse to open it on first launch.
Two ways past that, depending on how the file arrived:

- **AirDrop or a USB stick** — usually no quarantine flag, so it just opens.
- **Downloaded in a browser** — right-click the app in Applications, choose
  **Open**, then **Open** again. If macOS still refuses, go to
  **System Settings → Privacy & Security** and click **Open Anyway**. Or strip
  the flag directly:

```bash
xattr -dr com.apple.quarantine "/Applications/Baawaray Uploader.app"
```

Signing with an Apple Developer ID ($99/year) removes all of this, and is also
what unsigned builds give up to make silent auto-updates impossible — see below.

One thing is per-Mac: connecting Drive, which each person does for their own
Google account. The OAuth client arrives on its own once you sign in — see
**Setting up Google Drive** above.

> The packaged app and `npm run dev` keep their settings in *different* folders,
> because Electron names that folder after the app. Connecting Drive in dev does
> not connect it in the installed app.

## Updates

`src/main/updater.ts` asks GitHub once at launch and every six hours whether a
release newer than the running version exists, and `UpdateBanner` shows a bar
offering the download. Failures are silent by design — a version check that
could not reach GitHub is not worth interrupting a two-terabyte upload for.

**It notifies; it does not install.** macOS will not let an application replace
itself unless it is signed with an Apple Developer ID — Apple's updater checks
the signature before it will touch anything. Without one, no auto-updater on
macOS works, whatever library it uses. So the banner links to the download and
the studio drags it into Applications, exactly as they did the first time.

To publish a release:

1. Bump `version` in `package.json`
2. `npm run build:mac`
3. Create a release on the `nik2july/uploader-releases` repository, tagged
   `v<version>` to match, and attach `dist/Baawaray-Uploader-<version>.dmg`

The repository is public so the check needs no token — anything shipped inside
the app is readable by whoever has the app. It holds releases only; the source
stays private. The repository name is a constant at the top of
`src/main/updater.ts`.

Builds are for the architecture of the Mac that built them. An Apple-silicon
build will not run on an Intel Mac; use `electron-builder --mac --universal` for
one binary that runs on both, at roughly double the size.

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

- **Code signing and notarisation.** `build:mac` produces an unsigned app, so
  every Mac has to be talked past Gatekeeper once, and updates can only ever be
  offered rather than installed. A Developer ID identity plus `notarize` in
  `electron-builder.yml` fixes both.
- **Lint.** `npm run lint` reports pre-existing formatting and
  `explicit-function-return-type` complaints across the ported web-app files.
  It is not part of `npm run build`.
- **The renderer has no tests.** The engine does. The screens are checked by
  the typechecker and by running the app.
