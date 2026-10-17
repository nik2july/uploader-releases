# Desktop App (`DESKTOP APP`) — Project Rules

## 1. Project Overview
- macOS Electron + React + TypeScript application for Baawaray Films: resumable Google Drive uploader, freelance/editor workflow dashboard, Gallery Portal uploader, and studio media utilities (Duration, Missing Clips, Clip Delivery, Photo Delivery).

## 2. Cross-Project Links & Shared Hub (`COMMON`)
- Shared brand assets, fonts, and shared contracts live in `../COMMON/` (`/Users/baawaray/Documents/AI CODES/COMMON`).
- `src/shared/contracts.ts` imports shared billing types directly from `../COMMON/Shared Code & Contracts/utils/mediaPricing.ts`.
- Gallery Uploader (`src/main/galleryUploader.ts`) connects to the `GALLERY PORTAL` API.

## 3. Backups (30-Day Retention)
- Always back up files into `./Backups/` before making changes.
- Keep backups for only 30 days; prune older backups via `../COMMON/scripts/cleanup-backups-30d.sh`.
