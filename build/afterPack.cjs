const { execFileSync } = require('node:child_process');
const path = require('node:path');

/**
 * Ad-hoc sign the finished bundle.
 *
 * Without an Apple Developer ID, electron-builder skips signing altogether —
 * and what survives is the linker's own stub on the Electron binary, which does
 * not cover the Info.plist or any of the app's resources. On Apple Silicon a
 * bundle whose signature does not cover its contents is treated as corrupt, so
 * macOS reports it as "damaged and can't be opened" rather than as an app from
 * an unidentified developer. There is no Right-click → Open past that.
 *
 * Signing ad-hoc costs nothing, needs no certificate, and produces a signature
 * that genuinely seals the bundle. It does not make the app trusted — the first
 * launch still needs the quarantine flag cleared or an explicit Open — but the
 * app is now recognisably itself rather than apparently broken.
 *
 * A Developer ID would replace this and remove the prompt entirely.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', [
    '--force', '--deep', '--sign', '-',
    '--options', 'runtime',
    '--entitlements', path.join(__dirname, 'entitlements.mac.plist'),
    app,
  ], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed  ${path.basename(app)}`);
};
