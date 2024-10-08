// Set default values if needed
if (!localStorage.prefsMaxBackupItems) {
  localStorage.prefsMaxBackupItems = '30';
}

if (!localStorage.prefsBackupTimer) {
  localStorage.prefsBackupTimer = '5';
}

if (!localStorage.lastTimerIntervalId) {
  localStorage.lastTimerIntervalId = 0;
}

if (!localStorage.lastTabsEdit) {
  localStorage.lastTabsEdit = 0;
}

if (!localStorage.lastBackupTime) {
  localStorage.lastBackupTime = -1;

  // Create a backup now
  var d = new Date();
  var formattedDate = date_format (d);

  backupNow(true, formattedDate, function(success, backupListItem, fullBackup) {
    // backup completed
  });

  localStorage.lastBackupTime = localStorage.lastTabsEdit;
}

chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  //console.log('tabs.onRemoved');

  tabsEdited(true);
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  //console.log('tabs.onUpdated');

  tabsEdited(true);
});

chrome.tabs.onAttached.addListener(function(tabId, attachInfo) {
  //console.log('tabs.onAttached');

  tabsEdited(false);
});

chrome.tabs.onMoved.addListener(function(tabId, moveInfo) {
  //console.log('tabs.onMoved');

  tabsEdited(false);
});

chrome.tabs.onDetached.addListener(function(tabId, detachInfo) {
  //console.log('tabs.onDetached');

  tabsEdited(false);
});

chrome.tabs.onCreated.addListener(function(tab) {
  //console.log('tabs.onCreated');

  tabsEdited(true);
});

function tabsEdited (isImportant) {
  var d = new Date();
  var millis = d.getTime();

  //console.log('tabsEdited - lastTabsEdit: ' + localStorage.lastTabsEdit);
  //console.log('tabsEdited - new lastTabsEdit: ' + millis);

  localStorage.lastTabsEdit = millis;
}

var BACKUP_ALARM_NAME = 'backup_alarm';

function onAlarm (alarm) {
  // undefined when called by setInterval timer
  if (
    (alarm === undefined) ||
    (
      (alarm instanceof Object) &&
      (alarm !== null)          &&
      (alarm.name === BACKUP_ALARM_NAME)
    )
  ) {
    var d = new Date();
    var formattedDate = date_format (d);

    //console.log('Alarm {' + alarm + '} fired up: ' + formattedDate + ' last tabs edit: ' + localStorage.lastTabsEdit + ' last backup time: ' + localStorage.lastBackupTime);

    if (localStorage.lastBackupTime != localStorage.lastTabsEdit) {
      backupNow(true, formattedDate, function(success, backupListItem, fullBackup) {
        // automatic backup completed

        if (success) {
          insertBackupItems ([backupListItem], [fullBackup], true /*insertAtBeginning*/, true /*doAnimation*/);
        }
      });

      localStorage.lastBackupTime = localStorage.lastTabsEdit;
    }
  }
}

function initAlarm () {
  //console.log('initAlarm');

  // Clear any previous alarm
  chrome.alarms.clearAll();
  chrome.alarms.onAlarm.removeListener(onAlarm);
  clearInterval(localStorage.lastTimerIntervalId);

  var timerMinutes = parseInt(localStorage.prefsBackupTimer, 10);

  if (timerMinutes <= 0) {
    // disabled
    return;
  }
  else if (timerMinutes < 5) {
    // apparently once the extension is published in the Chrome Store, it's no-longer possible to create alarms that have a period of less than 5 minutes.

    //console.log('Created interval alarm - id: ' + localStorage.lastTimerIntervalId + ' time: ' + timerMinutes + ' minutes');

    var timerMillis = timerMinutes * 60 * 1000;
    localStorage.lastTimerIntervalId = setInterval (onAlarm, timerMillis);
  }
  else {
    // minimum alarm delay is 1 minute.

    //console.log('Creating chrome.alarm "backup_alarm" - time: ' + timerMinutes + ' minutes');

    chrome.alarms.create(BACKUP_ALARM_NAME, {periodInMinutes: timerMinutes, delayInMinutes: 1});
    chrome.alarms.onAlarm.addListener(onAlarm);
  }
}

initAlarm();

function date_prependZero (val) {
  return val < 10 ? '0' + val : '' + val;
}

// yyyy-m-d h:i:s
function date_format (d) {
  var monthOneOffset = d.getMonth() + 1; // convert from 0-11 to 1-12

  var formattedDate = d.getFullYear() + '-' + date_prependZero(monthOneOffset) + '-' + date_prependZero(d.getDate())
    + ' ' + date_prependZero(d.getHours()) + ':' + date_prependZero(d.getMinutes()) + ':' + date_prependZero(d.getSeconds());

  return formattedDate;
}


function backupNowManual (callbackDone) {
  var d = new Date();
  var formattedDate = date_format (d);

  backupNow(false, formattedDate, callbackDone);
}

async function deleteBackups (backupsToDelete) {
  if (!backupsToDelete || !Array.isArray(backupsToDelete) || !backupsToDelete.length) {
    return;
  }

  // remove deleted backups from popup UI
  var updateUI = function(backupListItem, finalize) {
    var popupViews = chrome.extension.getViews({type: 'popup'});
    if (popupViews.length > 0) {
      for (var i = 0; i < popupViews.length; i++) {
        var popupView = popupViews[i];
        if (!popupView.removeBackupItemDiv) {
          continue;
        }

        popupView.removeBackupItemDiv(backupListItem);

        if (finalize) {
          popupView.updateStorageInfo();
        }
      }
    }
  }

  var backupListItem;

  while (backupsToDelete.length) {
    backupListItem = backupsToDelete.shift();

    await promise_deleteBackup(backupListItem);
    updateUI(backupListItem, !backupsToDelete.length);
  }
}

var isCreatingBackup = false;

function backupNow(isAutomatic, backupID, callbackDone) {
  //console.log('backupNow - isAutomatic: ' + isAutomatic + ' ID: ' + backupID);

  if (isCreatingBackup === true) {
    //console.log('backupNow - already running. Skipping..');
    return;
  }
  isCreatingBackup = true;

  chrome.windows.getAll({windowTypes: ['normal'], populate : true}, function (window_list) {
    var backupListItem = {id: backupID, name: null};

    var fullBackup = {
      windows: [],
      isAutomatic: (isAutomatic !== false),
      totNumTabs: 0
    };

    var windowToBackup, windowTabs, bkpWindow;
    var tab, bkpTab;
    var backupListItemArray, fullBackupArray, callbackDoneWrapper;

    for (var i = 0; i < window_list.length; i++) {
      //console.log ('backupNow Window #' + i);

      windowToBackup = window_list[i];
      windowTabs     = windowToBackup.tabs;
      bkpWindow = {
        incognito: !!windowToBackup.incognito,
        tabs: []
      };

      for (var j = 0; j < windowTabs.length; j++) {
        tab = windowTabs[j];

        //console.log('==> Tab ' + j + ' (' + tab.index + '): ' + tab.url);

        bkpTab = {
          url: tab.url,
          title: tab.title
        };

        // Add tab to tabs arrays
        bkpWindow.tabs.push(bkpTab);
      }

      fullBackup.totNumTabs += windowTabs.length;
      fullBackup.windows.push(bkpWindow);
    }

    backupListItemArray = [backupListItem];
    fullBackupArray     = [fullBackup];
    callbackDoneWrapper = function(isSuccess, backupList, storageSetValues) {
      isCreatingBackup = false;

      if (isSuccess) {
        updateBrowserActionIcon (0);
        callbackDone(true, backupListItem, fullBackup);
      }
      else {
        updateBrowserActionIcon (1);
        callbackDone(false);
      }
    }

    saveBackups (backupListItemArray, fullBackupArray, callbackDoneWrapper);
  });
}

// keep backups in ascending chronological order (oldest first)
function compareBackupListItemsById (listItemA, listItemB) {
  var textA = listItemA.id.toUpperCase();
  var textB = listItemB.id.toUpperCase();
  return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
}

function saveBackups (backupListItemArray, fullBackupArray, callbackDone) {
  var storageSetValues = {};
  var backupListItem, backupID, fullBackup;

  if (
    (!backupListItemArray || !Array.isArray(backupListItemArray) || !backupListItemArray.length) ||
    (!fullBackupArray     || !Array.isArray(fullBackupArray)     || !fullBackupArray.length)     ||
    (backupListItemArray.length !== fullBackupArray.length)
  ) {
    callbackDone(false);
    return;
  }

  for (var i = 0; i < backupListItemArray.length; i++) {
    backupListItem = backupListItemArray[i];
    backupID       = backupListItem.id;
    fullBackup     = fullBackupArray[i];

    // note: this will replace an existing backup having the same ID (identical creation timestamp)
    storageSetValues[backupID] = fullBackup;
  }

  // Store backup
  chrome.storage.local.set(storageSetValues, function () {
    if (chrome.runtime.lastError) {
      //console.log('Error: ' + chrome.runtime.lastError.message);

      callbackDone(false);
    } else {
      //console.log('Backup saved successfully');

      chrome.storage.local.get('backups_list', function(items) {
        var backupList;
        if (items.backups_list) {
          // merge

          backupList = items.backups_list;

          var backupListIDs = backupList.map(listItem => listItem.id);
          var index;

          for (var i = 0; i < backupListItemArray.length; i++) {
            backupListItem = backupListItemArray[i];
            backupID       = backupListItem.id;
            index          = backupListIDs.indexOf(backupID);

            if (index === -1) {
              // new backup

              backupList.push(backupListItem);
              backupListIDs.push(backupListItem.id);
            }
            else {
              // update name

              backupList[index].name = backupListItem.name;
            }
          }
        }
        else {
          // replace

          backupList = backupListItemArray;
        }

        // maintain sort order
        backupList.sort(compareBackupListItemsById);

        chrome.storage.local.set({'backups_list': backupList}, function () {
          if (chrome.runtime.lastError) {
            //console.log ('Error saving backups_list: ' + chrome.runtime.lastError.message);

            callbackDone(false);
          } else {
            //console.log('Backups list saved successfully');

            callbackDone(true, backupList, storageSetValues);

            // garbage collect oldest backups that exceed the max allowed
            var unnamed, max_allowed, num_delete, unnamed_delete;

            unnamed     = backupList.filter(listItem => !listItem.name);
            max_allowed = parseInt(localStorage.prefsMaxBackupItems, 10);
            num_delete  = (unnamed.length - max_allowed);

            if (num_delete > 0) {
              unnamed_delete = unnamed.slice(0, num_delete);

              // async method, returns a Promise
              deleteBackups(unnamed_delete);
            }
          }
        });
      });
    }
  });
}

/**
 * 0 ==> OK
 * 1 ==> ERROR
 */
function updateBrowserActionIcon (status) {
  var icon;
  switch(status) {
    case 0:
      icon = 'background/img/icon_ok.png';
      break;
    default:
      icon = 'background/img/icon_error.png';
      break;
  }

  chrome.browserAction.setIcon({path: icon});
}

function promise_deleteBackup (backupListItem) {
  return new Promise(function(resolve, reject) {
    deleteBackup (backupListItem, resolve);
  });
}

function deleteBackup (backupListItem, callback) {
  var backupID = backupListItem.id;
  //console.log('Deleting backup ' + backupID);

  chrome.storage.local.remove(backupID, function() {
    //console.log ('Deleted backup ' + backupID);

    chrome.storage.local.get('backups_list', function(items) {
      if(!items.backups_list) {
        callback();
        return;
      }

      var backupList    = items.backups_list;
      var backupListIDs = backupList.map(listItem => listItem.id);
      var index         = backupListIDs.indexOf(backupID);
      if (index >= 0) {
        backupList.splice(index, 1);

        chrome.storage.local.set({"backups_list": backupList}, function() {
          callback();
        });
      }
    });
  });
}

function restoreNow(backupListItem) {
  var backupID = backupListItem.id;
  //console.log('restoreNow backup ' + backupID);

  chrome.storage.local.get(backupID, function(items) {
    if(!items[backupID]) {
      //console.log('No Backup found');
      return;
    }

    var fullBackup = items[backupID];

    for (var i=0; i < fullBackup.windows.length; i++) {
      var windowToRestore = fullBackup.windows[i];
      var windowTabs      = windowToRestore.tabs;
      var urlsToOpen      = [];

      var tab, tabUrl;

      for (var j=0; j < windowTabs.length; j++) {
        tab    = windowTabs[j];
        tabUrl = tab.url;
        urlsToOpen.push(tabUrl);
      }

      createWindow(urlsToOpen, windowToRestore.incognito, function(createdWindow) {
      });
    }
  });
}

var tabsLoading = [];

function onTabUpdate (tabId, changeInfo, tab) {
  if (!tabId || !changeInfo || !changeInfo.url || !tab) {
    return;
  }

  var index = tabsLoading.indexOf(tabId);
  if (index === -1) {
    return;
  }

  tabsLoading.splice(index, 1);

  // lazy load non-visible tabs to reduce/defer CPU and RAM usage.
  // similar to:
  //   https://github.com/jman/lazy_tab

  if (!tab.discarded && !tab.pinned && !tab.active) {
    try {
      chrome.tabs.discard( tab.id );
    }
    catch(error) {}
  }
}

chrome.tabs.onUpdated.addListener(onTabUpdate);

function createWindow (urlsToOpen, isIncognito, callback) {
  if (!urlsToOpen || !Array.isArray(urlsToOpen) || !urlsToOpen.length) {
    if (callback) {
      callback(null);
    }
    return;
  }

  var windowProperties = {
    url:       urlsToOpen,
    incognito: !!isIncognito,
    type:      'normal',
    state:     'maximized'
  };

  chrome.windows.create(windowProperties, function(createdWindow) {
    if (createdWindow && createdWindow.tabs) {
      for (var i = 0; i < createdWindow.tabs.length; i++) {
        tabsLoading.push( createdWindow.tabs[i].id );
      }
    }

    if (callback) {
      callback(createdWindow);
    }
  });
}

function renameBackup (backupListItem, name, callback) {
  var backupID = backupListItem.id;
  //console.log('Renaming backup ' + backupID);

  chrome.storage.local.get('backups_list', function(items) {
    if(!items.backups_list) {
      callback();
      return;
    }

    var backupList    = items.backups_list;
    var backupListIDs = backupList.map(listItem => listItem.id);
    var index         = backupListIDs.indexOf(backupID);
    if (index >= 0) {
      var newName = (typeof name === 'string') ? name.trim() : '';

      if (newName !== backupList[index].name) {
        backupList[index].name = newName;

        chrome.storage.local.set({"backups_list": backupList}, function() {
          callback();
        });
      }
    }
  });
}

function deleteAllBackups (callbackDone) {
  chrome.storage.local.clear(function() {
    var success = !chrome.runtime.lastError;

    callbackDone(success);
  });
}

function getExportJsonData (namedBackupsOnly, callbackDone) {
  chrome.storage.local.get(null, function(items) {
    var filtered = {
      "backups_list": []
    };
    var json;

    if (!items || !Array.isArray(items.backups_list) || !items.backups_list.length) {
      json = JSON.stringify(filtered, null, 2);
    }
    else if (!namedBackupsOnly) {
      json = JSON.stringify(items, null, 2);
    }
    else {
      var backupList, named, backupListItem, backupID, fullBackup;

      backupList = items.backups_list;
      named      = backupList.filter(listItem => !!listItem.name);

      for (var i = 0; i < named.length; i++) {
        backupListItem = named[i];
        backupID       = backupListItem.id;
        fullBackup     = items[backupID];

        if (fullBackup) {
          filtered.backups_list.push(backupListItem);
          filtered[backupID] = fullBackup;
        }
      }

      json = JSON.stringify(filtered, null, 2);
    }

    callbackDone(json);
  });
}

function importJsonData (json, callbackDone) {
  try {
    json = JSON.parse(json);

    if (
      (!json || (typeof json !== 'object')) ||
      (!json['backups_list'] || !Array.isArray(json['backups_list']) || !json['backups_list'].length)
    ) {
      throw '';
    }

    var backupList          = json['backups_list'];
    var backupListItemArray = [];
    var fullBackupArray     = [];
    var callbackDoneWrapper = function(isSuccess, backupList, storageSetValues) {
      if (isSuccess) {
        updateBrowserActionIcon (0);
        insertBackupItems (backupListItemArray, fullBackupArray, true /*insertAtBeginning*/, false /*doAnimation*/);
        callbackDone(true, backupListItemArray, fullBackupArray);
      }
      else {
        updateBrowserActionIcon (1);
        callbackDone(false);
      }
    }

    var backupListItem, backupID, fullBackup;

    for (var i = 0; i < backupList.length; i++) {
      backupListItem = backupList[i];
      backupID       = backupListItem.id;
      fullBackup     = json[backupID];

      if (fullBackup) {
        backupListItemArray.push(backupListItem);
        fullBackupArray.push(fullBackup);
      }
    }

    saveBackups (backupListItemArray, fullBackupArray, callbackDoneWrapper);
  }
  catch (error) {
    callbackDone(false);
    return;
  }
}

function insertBackupItems (backupListItemArray, fullBackupArray, insertAtBeginning, doAnimation) {
  if (
    (!backupListItemArray || !Array.isArray(backupListItemArray) || !backupListItemArray.length) ||
    (!fullBackupArray     || !Array.isArray(fullBackupArray)     || !fullBackupArray.length)     ||
    (backupListItemArray.length !== fullBackupArray.length)
  ) {
    return false;
  }

  var popupViews, popupView;
  var backupListItem, fullBackup;

  popupViews = chrome.extension.getViews({type: 'popup'});
  if (popupViews.length > 0) {
    for (var i = 0; i < popupViews.length; i++) {
      popupView = popupViews[i];

      if (!popupView.insertBackupItem) {
        continue;
      }

      for (var j = 0; j < backupListItemArray.length; j++) {
        backupListItem = backupListItemArray[j];
        fullBackup     = fullBackupArray[j];

        popupView.insertBackupItem(backupListItem, fullBackup, insertAtBeginning, doAnimation);
      }
      popupView.updateStorageInfo();
    }
  }
}

// -----------------------------------------------------------------------------
// message sent from proxy

if (typeof browser !== 'undefined') {
  browser.runtime.onMessage.addListener((message) => {
    if (message && (typeof message === 'object') && message.method) {
      switch(message.method) {

        case "createWindow": {
            const {urlsToOpen, isIncognito} = message.params
            return new Promise((resolve, reject) => {
              const callback = (createdWindow) => {
                const windowId = createdWindow ? createdWindow.id : null
                resolve({windowId})
              }
              createWindow(urlsToOpen, isIncognito, callback)
            })
          }
          break

        case "importJsonData": {
            const {json} = message.params
            return new Promise((resolve, reject) => {
              const callbackDone = (isSuccess, backupListItemArray, fullBackupArray) => {
                resolve({isSuccess, backupListItemArray, fullBackupArray})
              }
              importJsonData(json, callbackDone)
            })
          }
          break

        case "getExportJsonData": {
            const {namedBackupsOnly} = message.params
            return new Promise((resolve, reject) => {
              const callbackDone = (json) => {
                resolve({json})
              }
              getExportJsonData(namedBackupsOnly, callbackDone)
            })
          }
          break

        case "backupNowManual": {
            return new Promise((resolve, reject) => {
              const callbackDone = (isSuccess, backupListItem, fullBackup) => {
                resolve({isSuccess, backupListItem, fullBackup})
              }
              backupNowManual(callbackDone)
            })
          }
          break

        case "deleteAllBackups": {
            return new Promise((resolve, reject) => {
              const callbackDone = (isSuccess) => {
                resolve({isSuccess})
              }
              deleteAllBackups(callbackDone)
            })
          }
          break

        case "deleteBackup": {
            const {backupListItem} = message.params
            return new Promise((resolve, reject) => {
              deleteBackup(backupListItem, resolve)
            })
          }
          break

        case "renameBackup": {
            const {backupListItem, name} = message.params
            return new Promise((resolve, reject) => {
              renameBackup(backupListItem, name, resolve)
            })
          }
          break

        case "restoreNow": {
            const {backupListItem} = message.params
            restoreNow(backupListItem, name)
            return Promise.resolve(true)
          }
          break

        case "initAlarm": {
            initAlarm()
            return Promise.resolve(true)
          }
          break
      }
    }
    return false
  })
}
