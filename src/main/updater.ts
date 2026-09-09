import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

// Configure logging for the auto-updater so we can see what it's doing
autoUpdater.logger = log
// @ts-ignore
autoUpdater.logger.transports.file.level = 'info'

export function setupAutoUpdater() {
  log.info('App starting, checking for updates...')
  
  // This will check the URL specified in electron-builder.yml
  // If an update is found, it will automatically download it in the background
  autoUpdater.checkForUpdatesAndNotify()

  autoUpdater.on('update-available', () => {
    log.info('Update available.')
  })

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded. Prompting user to restart.')
    // Here you would normally send an IPC message to the renderer 
    // to show a "Restart to Update" button in the UI.
  })
}
