window.state = {}

document.addEventListener('DOMContentLoaded', function() {
  state.bg_window = chrome.extension.getBackgroundPage()

  if (!state.bg_window && (typeof browser !== 'undefined'))
    state.bg_window = {

      createWindow: (urlsToOpen, isIncognito, callback) => {
        // Promise
        return browser.runtime.sendMessage({"method": "createWindow", "params": {urlsToOpen, isIncognito}})
          .then(response => {
            const {windowId} = response
            return windowId
              ? browser.window.get(windowId)
              : null
          })
          .then(callback)
      },

      importJsonData: (json, callbackDone) => {
        // Promise
        return browser.runtime.sendMessage({"method": "importJsonData", "params": {json}})
          .then(response => {
            const {isSuccess, backupListItemArray, fullBackupArray} = response
            callbackDone(isSuccess, backupListItemArray, fullBackupArray)
          })
      },

      getExportJsonData: (namedBackupsOnly, callbackDone) => {
        // Promise
        return browser.runtime.sendMessage({"method": "getExportJsonData", "params": {namedBackupsOnly}})
          .then(response => {
            const {json} = response
            callbackDone(json)
          })
      },

      backupNowManual: (callbackDone) => {
        // Promise
        return browser.runtime.sendMessage({"method": "backupNowManual"})
          .then(response => {
            const {isSuccess, backupListItem, fullBackup} = response
            callbackDone(isSuccess, backupListItem, fullBackup)
          })
      },

      deleteAllBackups: (callbackDone) => {
        // Promise
        return browser.runtime.sendMessage({"method": "deleteAllBackups"})
          .then(response => {
            const {isSuccess} = response
            callbackDone(isSuccess)
          })
      },

      deleteBackup: (backupListItem, callback) => {
        // Promise
        return browser.runtime.sendMessage({"method": "deleteBackup", "params": {backupListItem}})
          .then(callback)
      },

      renameBackup: (backupListItem, name, callback) => {
        // Promise
        return browser.runtime.sendMessage({"method": "renameBackup", "params": {backupListItem, name}})
          .then(callback)
      },

      restoreNow: (backupListItem) => {
        // Promise
        return browser.runtime.sendMessage({"method": "restoreNow", "params": {backupListItem}})
      },

      initAlarm: () => {
        // Promise
        return browser.runtime.sendMessage({"method": "initAlarm"})
      }

    }
})
