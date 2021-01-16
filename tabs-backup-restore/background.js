// Set default values if needed
if (!localStorage.prefsMaxBackupItems) {
  localStorage.prefsMaxBackupItems = "30";
}

if (!localStorage.prefsBackupTimer) {
  localStorage.prefsBackupTimer = "5";
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

function initAlarm () {
  //console.log("initAlarm");

  var BACKUP_ALARM_NAME = "backup_alarm";

  // Clear any previous alarm
  chrome.alarms.clearAll();
  clearInterval(parseInt(localStorage.lastTimerIntervalId));

  var timerMinutes = parseInt(localStorage.prefsBackupTimer);

  // Apparantely once the app is on the Chrome Store it's not possible
  // to create alarms that have period less than 5 minutes..
  if (timerMinutes < 5) {
    var timerMillis = timerMinutes * 60 * 1000;
    localStorage.lastTimerIntervalId = setInterval (onAlarm, timerMillis);
    //console.log("Created interval alarm - id: " + localStorage.lastTimerIntervalId + " time: " + timerMinutes + " minutes");
  } else {
    //console.log("Creating chrome.alarm 'backup_alarm' - time: " + timerMinutes + " minutes");
    chrome.alarms.create(BACKUP_ALARM_NAME, {periodInMinutes: timerMinutes});
  }
}

initAlarm();

function onAlarm (alarm) {
  var d = new Date();
  var formattedDate = date_format (d);

  //console.log("Alarm {" + alarm + "} fired up: " + formattedDate + " last tabs edit: " + localStorage.lastTabsEdit + " last backup time: " + localStorage.lastBackupTime);

  // localStorage.lastBackupTime
  // if last backup time != lastTabsEdit
  //  perform automatic backup
  if (localStorage.lastBackupTime != localStorage.lastTabsEdit) {
    backupNow(true, formattedDate, function(success, backupListItem, fullBackup) {
      // automatic backup completed
      var popupViews = chrome.extension.getViews({type: "popup"});
      if (popupViews.length > 0) {
        for (var i = 0; i < popupViews.length; i++) {
          var popupView = popupViews[i];
          if (!popupView.insertBackupItem) {
            continue;
          }

          popupView.insertBackupItem(backupListItem, fullBackup, true /*insertAtBeginning*/, true /*doAnimation*/);
          popupView.updateStorageInfo();
        }
      }
    });

    localStorage.lastBackupTime = localStorage.lastTabsEdit;
  }
}

chrome.alarms.onAlarm.addListener(onAlarm);

function date_prependZero (val) {
  return val < 10 ? "0" + val : "" + val;
}

// yyyy-m-d h:i:s
function date_format (d) {
  var monthOneOffset = d.getMonth() + 1; // convert from 0-11 to 1-12

  var formattedDate = d.getFullYear() + "-" + date_prependZero(monthOneOffset) + "-" + date_prependZero(d.getDate())
    + " " + date_prependZero(d.getHours()) + ":" + date_prependZero(d.getMinutes()) + ":" + date_prependZero(d.getSeconds());

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
    var popupViews = chrome.extension.getViews({type: "popup"});
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
  //console.log("backupNow - isAutomatic: " + isAutomatic + " ID: " + backupID);

  if (isCreatingBackup === true) {
    //console.log("backupNow - already running. Skipping..");
    return;
  }
  isCreatingBackup = true;

  var fullBackup = {
    windows: [],
    isAutomatic: (isAutomatic !== false),
    totNumTabs: 0
  };

  chrome.windows.getAll({populate : true}, function (window_list) {
    var totNumTabs = 0;

    for(var i=0;i<window_list.length;i++) {
      //console.log ("backupNow Window #" + i);

      var windowToBackup = window_list[i];
      var windowTabs     = windowToBackup.tabs;
      var bkpWindow = {
        tabs: []
      };

      for (var j = 0; j < windowTabs.length; j++) {
        var tab = windowTabs[j];

        //console.log("==> Tab " + j + " (" + tab.index + "): " + tab.url);

        var bkpTab = {
          url: tab.url,
          title: tab.title
        };

        // Add tab to tabs arrays
        bkpWindow.tabs.push(bkpTab);
      }

      totNumTabs += windowTabs.length;

      fullBackup.windows.push(bkpWindow);
    }

    fullBackup.totNumTabs = totNumTabs;

    var storageSetValues = {};
    storageSetValues[backupID] = fullBackup;

    // Store backup
    chrome.storage.local.set(storageSetValues, function () {
      if (chrome.runtime.lastError) {
        isCreatingBackup = false;

        //console.log("Error: " + chrome.runtime.lastError.message);
        updateBrowserActionIcon (1);

        callbackDone(false);
      } else {
        //console.log("Backup saved successfully");

        chrome.storage.local.get("backups_list", function(items) {
          var backupList = [];
          if(items.backups_list) {
            backupList = items.backups_list;
          }
          //console.log("Updating 'backups_list' - cur. size: " + backupList.length);

          var backupListItem = {id: backupID, name: null};
          backupList.push(backupListItem);

          chrome.storage.local.set({"backups_list": backupList}, function () {
            isCreatingBackup = false;

            if (chrome.runtime.lastError) {
              //console.log ("Error saving backups_list: " + chrome.runtime.lastError.message);

              updateBrowserActionIcon (1);
              callbackDone(false);
            } else {
              //console.log("Backups list saved successfully");

              updateBrowserActionIcon (0);
              callbackDone(true, backupListItem, fullBackup);

              // garbage collect oldest backups that exceed the max allowed
              var unnamed, max_allowed, num_delete, unnamed_delete;

              unnamed     = backupList.filter(backup => !backup.name);
              max_allowed = parseInt(localStorage.prefsMaxBackupItems);
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
      icon = "background/img/icon_ok.png";
      break;
    default:
      icon = "background/img/icon_error.png";
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
  //console.log("Deleting backup " + backupID);

  chrome.storage.local.remove(backupID, function() {
    //console.log ("Deleted backup " + backupID);

    chrome.storage.local.get("backups_list", function(items) {
      if(!items.backups_list) {
        callback();
        return;
      }

      var backupList    = items.backups_list;
      var backupListIDs = backupList.map(backup => backup.id);
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
  //console.log("restoreNow backup " + backupID);

  chrome.storage.local.get(backupID, function(items) {
    if(!items[backupID]) {
      //console.log("No Backup found");
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

      var windowProperties = {
        url: urlsToOpen
      };

      chrome.windows.create(windowProperties, function(createdWindow) {
      });
    }
  });
}

function renameBackup (backupListItem, name, callback) {
  var backupID = backupListItem.id;
  //console.log("Renaming backup " + backupID);

  chrome.storage.local.get("backups_list", function(items) {
    if(!items.backups_list) {
      callback();
      return;
    }

    var backupList    = items.backups_list;
    var backupListIDs = backupList.map(backup => backup.id);
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
