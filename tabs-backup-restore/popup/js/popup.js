document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('menuItem_backupNow'       ).addEventListener('click', menu_backupNow);
  document.getElementById('menuItem_options'         ).addEventListener('click', menu_ShowOptions);
  document.getElementById('menuItem_showAdvancedView').addEventListener('click', menu_ShowAdvancedView);
  document.getElementById('menuItem_showOlderBackups').addEventListener('click', menu_ShowOlderBackups);

  initbackupList (false /*showAll*/);
});

function compareBackupListItemsByName (listItemA, listItemB) {
  var textA = listItemA.name.toUpperCase();
  var textB = listItemB.name.toUpperCase();
  return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
}

function initbackupList (showAll, callback) {
  var backupsDiv          = $('#backupsDiv');
  var showOlderBackupsDiv = $('#showOlderBackupsDiv');

  backupsDiv.html('');
  backupsDiv.hide();

  showOlderBackupsDiv.hide();

  chrome.storage.local.get(null, function(items) {
    var backupList = [];
    if(items.backups_list) {
      backupList = items.backups_list;
    }

    var named, unnamed;
    named      = backupList.filter(listItem => !!listItem.name).sort(compareBackupListItemsByName);  // sort by name alphabetically (ascending)
    unnamed    = backupList.filter(listItem =>  !listItem.name).reverse();                           // sort by creation timestamp (descending, newest first)
    backupList = ([]).concat(named, unnamed);
    named      = null;
    unnamed    = null;

    var numInsertedItems = 0;
    for (var i=0; i < backupList.length; i++) {
      var backupListItem = backupList[i];
      if (!backupListItem || !backupListItem.id) {
        continue;
      }

      var fullBackup = items[backupListItem.id];
      if (!fullBackup) {
        continue;
      }

      if (fullBackup.isAutomatic === undefined) {
        fullBackup.isAutomatic = true;
      }

      insertBackupItem(backupListItem, fullBackup, false /*insertAtBeginning*/, false /*doAnimation*/);
      numInsertedItems++;
    }

    if (!showAll) {
      if (numInsertedItems > 10) {
        backupsDiv.find('.backupItem').slice(10).hide();
        backupsDiv.slideDown(400, function() {
          showOlderBackupsDiv.show();
        });
      }
      else if (numInsertedItems) {
        backupsDiv.slideDown();
      }
      else {
        backupsDiv.show();
      }
    }

    if (callback) {
      callback(numInsertedItems);
    }
  });

  updateStorageInfo();
}

function menu_ShowOlderBackups () {
  var backupsDiv          = $('#backupsDiv');
  var showOlderBackupsDiv = $('#showOlderBackupsDiv');

  backupsDiv.find('.backupItem').show();
  backupsDiv.slideDown(400, function() {
    showOlderBackupsDiv.hide();
  });
}

var lastTimeBackupNowClicked = 0;

function menu_backupNow () {
  // debounce: cannot run more than 1x per 1 second
  if (lastTimeBackupNowClicked != 0) {
    var diffTime = Math.abs(Date.now() - lastTimeBackupNowClicked);
    if (diffTime < 1000) {
      return;
    }
  }

  lastTimeBackupNowClicked = Date.now();

  state.bg_window.backupNowManual(function(success, backupListItem, fullBackup) {
    if (success) {
      insertBackupItem (backupListItem, fullBackup, true /*insertAtBeginning*/, true /*doAnimation*/);
      updateStorageInfo();

      //bootbox.alert('Backup successfully created!');
    } else {
      bootbox.alert('An error occured while creating the backup!');
    }
  });
}

function menu_ShowOptions () {
  chrome.tabs.create({url:chrome.extension.getURL('options.html')});
}

function menu_ShowAdvancedView () {
  chrome.tabs.create({url:chrome.extension.getURL('advanced_restore.html')});
}

function getDomId (backupID) {
  return backupID.replace(/[:\.\s-]+/g, '_');
}

function insertBackupItem (backupListItem, fullBackup, insertAtBeginning, doAnimation) {
  var backupID = backupListItem.id;
  var domId    = getDomId(backupID);

  var divId             = 'div_'                   + domId;
  var backupItemTitleId = 'renameSelectedBackup_'  + domId;
  var restoreButtonId   = 'restoreSelectedBackup_' + domId;
  var deleteButtonId    = 'deleteSelectedBackup_'  + domId;

  var elem = document.createElement('div');

  elem.id = divId;
  elem.className = 'backupItem' + (backupListItem.name ? ' isNamed' : '');
  elem.innerHTML = `
<div class="backupItemWrapper">
  <div class="backupItemContent">
    <div id="${ backupItemTitleId }" class="backupItemTitle">${ backupListItem.name || backupListItem.id }</div>
    <div class="backupItemDetails">
      <div>Nr. Windows: <span class="backupItemDetailsNr">${ fullBackup.windows.length }</span></div>
      <div>Nr. Tabs: <span class="backupItemDetailsNr">${ fullBackup.totNumTabs }</span></div>
    </div>
    <div class="backupItemToolbar">
      <a id="${ restoreButtonId }"><img src="icon/icon_48.png"       title="Restore Backup" style="border: 0; width: 24px; height: 24px" /></a>
      <a id="${ deleteButtonId  }"><img src="popup/img/trash_48.png" title="Delete Backup"  style="border: 0; width: 22px; height: 22px" /></a>
    </div>
    <div class="backupItemFooter">
      ${
         fullBackup.isAutomatic
           ? '<span class="backupItemFooterAutoBackup">AUTO BACKUP</span>'
           : '<span class="backupItemFooterManualBackup">MANUAL BACKUP</span>'
      }
    </div>
  </div>
</div>
`;

  var renameFuncHandler = (function(backupListItem) {
    return function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      bootbox.prompt({
        title:   `Rename Backup?<br><code>${ backupListItem.name || backupListItem.id }</code>`,
        value:    backupListItem.name || '',
        callback: function(name) {
          if (name !== null) {
            name = name.trim();

            state.bg_window.renameBackup(backupListItem, name, function() {
            });

            event.target.innerText = name || backupListItem.id;
            backupListItem.name    = name;

            var newClassName       = 'backupItem' + (backupListItem.name ? ' isNamed' : '');
            if (newClassName !== elem.className) {
              elem.className = newClassName;

              insertBackupItemDiv(elem, backupListItem, true /*insertAtBeginning*/, true /*doAnimation*/);
            }
          }
        }
      });
    };
  })(backupListItem);

  var restoreFuncHandler = (function(backupListItem) {
    return function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      bootbox.confirm(`Restore Backup?<br><code>${ backupListItem.name || backupListItem.id }</code>`, function(confirmed) {
        if (confirmed) {
          state.bg_window.restoreNow(backupListItem);
        }
      });
    };
  })(backupListItem);

  var deleteFuncHandler = (function(backupListItem) {
    return function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      bootbox.confirm(`Delete Backup?<br><code>${ backupListItem.name || backupListItem.id }</code>`, function(confirmed) {
        if (confirmed) {
          state.bg_window.deleteBackup(backupListItem, function() {
            updateStorageInfo();
          });

          removeBackupItemDiv (backupListItem, function(obj) {
            obj.remove();

            if (typeof removeBackupItemHook === 'function') {
              removeBackupItemHook(backupListItem);
            }
          });
        }
      });
    };
  })(backupListItem);

  elem.querySelector('#' + backupItemTitleId).addEventListener('click', renameFuncHandler);
  elem.querySelector('#' + restoreButtonId  ).addEventListener('click', restoreFuncHandler);
  elem.querySelector('#' + deleteButtonId   ).addEventListener('click', deleteFuncHandler);

  if (typeof insertBackupItemHook === 'function') {
    insertBackupItemHook(elem, backupListItem, domId);
  }

  insertBackupItemDiv(elem, backupListItem, insertAtBeginning, doAnimation);
}

function removeBackupItemDiv (backupListItem, callback) {
  var divId = 'div_' + getDomId(backupListItem.id);
  var obj   = $('#' + divId);

  if (obj.length !== 1) {
    callback(null);
    return;
  }

  obj.animate(
    { height: 0, opacity: 0 },
    {
      duration: 1000,
      complete: function(){
        if (callback) {
          obj.detach();
          callback(obj);
        }
        else {
          obj.remove();
        }
      }
    }
  );
}

function insertBackupItemDiv (elem, backupListItem, insertAtBeginning, doAnimation) {
  removeBackupItemDiv(backupListItem, function(obj) {
    if (doAnimation) {
      elem.style.cssText = 'display: none';
    }

    var backupsDiv = document.getElementById ('backupsDiv');

    var node;
    if (! backupsDiv.childNodes.length) {
      backupsDiv.appendChild(elem);
    }
    else if (backupListItem.name) {
      // named backup

      if (insertAtBeginning) {
        node = backupsDiv.childNodes[0];
        backupsDiv.insertBefore(elem, node);
      }
      else {
        node = backupsDiv.querySelector(':scope > .backupItem:not(.isNamed)');

        if (node) {
          backupsDiv.insertBefore(elem, node);
        }
        else {
          backupsDiv.appendChild(elem);
        }
      }
    }
    else {
      // unnamed backup

      if (insertAtBeginning) {
        node = backupsDiv.querySelector(':scope > .backupItem:not(.isNamed)');

        if (node) {
          backupsDiv.insertBefore(elem, node);
        }
        else {
          backupsDiv.appendChild(elem);
        }
      }
      else {
        backupsDiv.appendChild(elem);
      }
    }

    if (doAnimation) {
      $('#' + elem.id).slideDown(1000);
    }
  });
}

function updateStorageInfo () {
  chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
    var storageText;
    if (bytesInUse < 1024) {
      storageText = bytesInUse.toFixed(2) + ' bytes';
    } else if (bytesInUse < 1024 * 1024) {
      storageText = (bytesInUse / 1024).toFixed(2)  + ' Kb';
    } else {
      storageText = (bytesInUse / (1024 * 1024)).toFixed(2) + ' Mb';
    }

    var storageSpan = document.getElementById('storageSpan');
    storageSpan.innerHTML = storageText;
  });
}
