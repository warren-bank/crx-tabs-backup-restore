// ----------------------------------------------------------------------------- identical to popup()

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('menuItem_backupNow'       ).addEventListener('click', menu_backupNow);
  document.getElementById('menuItem_options'         ).addEventListener('click', menu_ShowOptions);
//document.getElementById('menuItem_showAdvancedView').addEventListener('click', menu_ShowAdvancedView);
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

  chrome.extension.getBackgroundPage().backupNowManual(function(success, backupListItem, fullBackup) {
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

            chrome.extension.getBackgroundPage().renameBackup(backupListItem, name, function() {
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
          chrome.extension.getBackgroundPage().restoreNow(backupListItem);
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
          chrome.extension.getBackgroundPage().deleteBackup(backupListItem, function() {
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

// ----------------------------------------------------------------------------- glue

function insertBackupItemHook (elem, backupListItem, domId) {
  var backupTitleDivId  = 'backup_title_' + domId;

  var toggleAdvancedRestoreDivFuncHandler = (function(backupListItem) {
    return function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      var restoreDivId = 'restoreDiv_' + domId;
      var restoreDiv = $('#' + restoreDivId);
      if (! restoreDiv.length) {
        showAdvancedRestoreFor(backupListItem);
      }
      else {
        if (restoreDiv.is(':visible')) {
          restoreDiv.slideUp();
        } else {
          restoreDiv.slideDown();
        }
      }
    };
  })(backupListItem);

  elem.querySelector('.backupItemWrapper').setAttribute('id', backupTitleDivId);
  elem.addEventListener('click', toggleAdvancedRestoreDivFuncHandler);
}

function removeBackupItemHook (backupListItem) {
  updateRestoreSelectedDiv();
}

// ----------------------------------------------------------------------------- advanced

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('restoreSelectedDiv'               ).addEventListener('click', menu_RestoreSelected);
  document.getElementById('restoreSelectedClearSelectionLink').addEventListener('click', menu_ClearSelection);

  document.getElementById('restoreSelectedRadioSingleWindowSpanLabel').addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    $('#restoreSelectedRadioSingleWindow').prop('checked', true);
  });

  document.getElementById('restoreSelectedRadioMultipleWindowsSpanLabel').addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    $('#restoreSelectedRadioMultipleWindows').prop('checked', true);
  });

  document.getElementById('deleteAllBackups').addEventListener('click', menu_DeleteAllBackups);

  document.getElementById('data-export').addEventListener('click', menu_ExportJsonData);
  document.getElementById('data-import').addEventListener('click', menu_ImportJsonData);
});

function menu_RestoreSelected (event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  bootbox.confirm('Restore Selection?', function(confirmed) {
    if (confirmed) {
      menu_RestoreSelected_Real();
    }
  });
}

function menu_RestoreSelected_Real () {
  var selectedCheckboxes       = $('input[type="checkbox"]:checked');
  var restoreToMultipleWindows = $('#restoreSelectedRadioMultipleWindows').is(':checked');

  var allUrls     = [];
  var windows     = {};
  var windowsKeys = [];

  var i, checkbox, tabUrl, windowIdx, bkpName, key, urls, incognito, windowProperties;

  for (i = 0; i < selectedCheckboxes.length; i++) {
    checkbox = selectedCheckboxes[i];

    if (
      (checkbox.tbrBackupName  === undefined) ||
      (checkbox.tbrWindowIndex === undefined) ||
      (checkbox.tbrTabUrl      === undefined)
    ){
      continue;
    }

    //console.log('Restoring ' + checkbox.tbrBackupName + ' --> ' + checkbox.tbrWindowIndex);

    tabUrl    = checkbox.tbrTabUrl;
    windowIdx = checkbox.tbrWindowIndex;
    bkpName   = checkbox.tbrBackupName;
    key       = bkpName + '_' + windowIdx;

    if (!(key in windows)) {
      windows[key] = [];
      windowsKeys.push({key, windowIdx});
    }

    windows[key].push(tabUrl);
    allUrls.push(tabUrl);
  }

  // sanity check: return if empty datasets
  if (!windowsKeys.length || !allUrls.length) {
    return;
  }

  if (restoreToMultipleWindows) {
    for (i = 0; i < windowsKeys.length; i++) {
      key  = windowsKeys[i].key;
      urls = windows[key];

      // incognito:
      checkbox  = $(`input[type="checkbox"][data-window-index="${ windowsKeys[i].windowIdx }"]`).get(0);
      incognito = checkbox && checkbox.tbrIsIncognito;

      chrome.extension.getBackgroundPage().createWindow(urls, incognito, function(createdWindow) {
      });
    }
  } else {
    // incognito: only true if ALL selected tabs belong to incognito windows
    incognito = windowsKeys.reduce(
      function (accumulator, currentValue) {
        if (accumulator) {
          checkbox    = $(`input[type="checkbox"][data-window-index="${ currentValue.windowIdx }"]`).get(0);
          accumulator = checkbox && checkbox.tbrIsIncognito;
        }
        return accumulator;
      },
      true
    );

    chrome.extension.getBackgroundPage().createWindow(allUrls, incognito, function(createdWindow) {
    });
  }
}

function menu_ClearSelection (event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  var selectedCheckboxes = $('input[type="checkbox"]:checked');
  for (var i = 0; i < selectedCheckboxes.length; i++) {
    var checkbox = selectedCheckboxes[i];
    if (checkbox.type == 'checkbox') {
      checkbox.checked = false;
    }
  }

  updateRestoreSelectedDiv();
}

function updateRestoreSelectedDiv () {
  var selectedCheckboxes = $('input[type="checkbox"]:checked');

  var numSelectedTabs = 0;
  var numSelectedWindows = 0;
  for (var i = 0; i < selectedCheckboxes.length; i++) {
    var checkbox = selectedCheckboxes[i];

    if (checkbox.tbrIsWindow !== undefined) {
      if (checkbox.tbrIsWindow) {
        numSelectedWindows++;
      }
    }

    if (
      (checkbox.tbrBackupName  === undefined) ||
      (checkbox.tbrWindowIndex === undefined) ||
      (checkbox.tbrTabUrl      === undefined)
    ){
      continue;
    }

    numSelectedTabs++;
  }

  $('#restoreSelectedInfoNumTabs').html(numSelectedTabs);

  var restoreDiv = $('#floatingRightDiv');

  if (numSelectedTabs > 0) {
    if (!restoreDiv.is(':visible')) {
      restoreDiv.fadeIn(600);
    }
  } else if (restoreDiv.is(':visible')) {
    restoreDiv.fadeOut(600);
  }
}

function addClickListenerForWindowTitle (windowTitleDiv, tabsDivId) {
  windowTitleDiv.addEventListener('click', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    var clickedElem = event.target;
    if (clickedElem) {
      if (clickedElem.className.indexOf('parentIgnoreClick') !== -1) {
        return;
      }
    }
    $('#' + tabsDivId).slideToggle();
  });
}

function addClickListenerForWindowCheckbox (checkboxWindowElem, windowTabs, domId, i) {
  checkboxWindowElem.addEventListener('click', function(event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    var isChecked = checkboxWindowElem.checked;

    for (var j = 0; j < windowTabs.length; j++) {
      var checkboxId = 'checkbox_tab_' + domId + '_' + i + '_' + j;

      $('#' + checkboxId).prop('checked', isChecked);
    }

    updateRestoreSelectedDiv();
  });
}

function showAdvancedRestoreFor (backupListItem) {
  var backupID = backupListItem.id;
  var domId    = getDomId(backupID);

  chrome.storage.local.get(backupID, function(items) {
    if(!items[backupID]) {
      bootbox.alert('An error occured. Please reload the page.');
      return;
    }

    var divId            = 'restoreDiv_'   + domId;
    var backupTitleDivId = 'backup_title_' + domId;

    var elem = document.createElement('div');

    elem.id        = divId;
    elem.className = 'restoreDiv';
    elem.innerHTML = '';

    var expandCollapseDiv = document.createElement('div');
    expandCollapseDiv.className = 'restoreDivCollapseExpand';

    var collapseAElem = document.createElement('a');
    collapseAElem.innerHTML = 'Collapse All';

    var expandAElem = document.createElement('a');
    expandAElem.innerHTML = 'Expand All';

    expandCollapseDiv.appendChild(collapseAElem);
    expandCollapseDiv.appendChild(document.createTextNode(' / '));
    expandCollapseDiv.appendChild(expandAElem);

    elem.appendChild(expandCollapseDiv);

    var allTabsDivsIds = [];
    var fullBackup     = items[backupID];

    for(var i = 0; i < fullBackup.windows.length; i++) {
      var windowToRestore = fullBackup.windows[i];
      var windowTabs      = windowToRestore.tabs;

      var windowTitleDiv = document.createElement('div');
      windowTitleDiv.className = 'windowTitleDiv';

      var tabsDiv = document.createElement('div');
      tabsDiv.id = 'tabsDiv_' + domId + '_' + i;
      tabsDiv.className = 'tabsDiv';
      tabsDiv.hidden = true;

      allTabsDivsIds.push(tabsDiv.id);

      addClickListenerForWindowTitle(windowTitleDiv, tabsDiv.id);

      var checkboxWindowId = 'checkbox_window_' + domId + '_' + i;

      var checkboxWindowElem = document.createElement('input');
      checkboxWindowElem.type = 'checkbox';
      checkboxWindowElem.id = checkboxWindowId;
      checkboxWindowElem.className = 'regular-checkbox parentIgnoreClick';
      checkboxWindowElem.tbrIsWindow = true;
      checkboxWindowElem.tbrIsIncognito = !!windowToRestore.incognito;
      checkboxWindowElem.setAttribute('data-window-index', '' + i);

      var checkboxWindowLabelElem = document.createElement('label')
      checkboxWindowLabelElem.className = 'parentIgnoreClick';
      checkboxWindowLabelElem.htmlFor = checkboxWindowId;
      checkboxWindowLabelElem.style.cssText = 'margin-bottom: -4px; margin-right: 8px;';

      addClickListenerForWindowCheckbox(checkboxWindowElem, windowTabs, domId, i);

      var windowTitleSpan = document.createElement('span');
      windowTitleSpan.innerHTML = '' +
        `<span style="font-weight: bold">Window ${i+1}${ windowToRestore.incognito ? ' (incognito)' : '' }</span>` +
        `<span style="float: right; font-size: 11px;">Tabs: ${windowTabs.length}</span>`;

      windowTitleDiv.appendChild(checkboxWindowElem);
      windowTitleDiv.appendChild(checkboxWindowLabelElem);
      windowTitleDiv.appendChild(windowTitleSpan);

      for (var j = 0; j < windowTabs.length; j++) {
        var tab        = windowTabs[j];
        var tabTitle   = tab.title;
        var tabUrl     = tab.url;
        var checkboxId = 'checkbox_tab_' + domId + '_' + i + '_' + j;

        var tabElem = document.createElement('div');
        tabElem.style.cssText = 'position: relative';

        var checkboxTabElem = document.createElement('input');
        checkboxTabElem.type = 'checkbox';
        checkboxTabElem.id = checkboxId;
        checkboxTabElem.className = 'regular-checkbox';

        // custom attributes
        checkboxTabElem.tbrBackupName  = domId;
        checkboxTabElem.tbrWindowIndex = i;
        checkboxTabElem.tbrTabUrl      = tabUrl;

        var checkboxTabLabelElem = document.createElement('label')
        checkboxTabLabelElem.htmlFor = checkboxId;

        var tabSpanElem = document.createElement('span');
        tabSpanElem.className = 'restoreTabSpan';
        var title = tabTitle === '' ? tabUrl : tabTitle;
        tabSpanElem.innerHTML = `<a href="${ tabUrl }" target="_blank">${ title }</a>`;

        tabElem.appendChild(checkboxTabElem);
        tabElem.appendChild(checkboxTabLabelElem);
        tabElem.appendChild(tabSpanElem);

        tabsDiv.appendChild(tabElem);

        checkboxTabLabelElem.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          var checkboxTabLabelElem = event.target;
          var checkboxTabElem      = checkboxTabLabelElem.previousSibling;

          // toggle checkbox
          checkboxTabElem.checked = !checkboxTabElem.checked;

          updateRestoreSelectedDiv();
        });
      }

      elem.appendChild(windowTitleDiv);
      elem.appendChild(tabsDiv);
    }

    collapseAElem.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      for (var i = 0; i < allTabsDivsIds.length; i++) {
        $('#' + allTabsDivsIds[i]).slideUp();
      }
    });

    expandAElem.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      for (var i = 0; i < allTabsDivsIds.length; i++) {
        $('#' + allTabsDivsIds[i]).slideDown();
      }
    });

    // prevent all other events within 'restoreDiv' from bubbling up
    elem.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    });

    var backupTitleDiv = document.getElementById(backupTitleDivId);
    backupTitleDiv.appendChild(elem);
    $('#' + elem.id).hide().slideDown();
  });
}

function menu_DeleteAllBackups (event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  chrome.extension.getBackgroundPage().deleteAllBackups(function(success) {
    if (success) {
      $('#backupsDiv').slideUp(400, function() {
        // force a page refresh
        window.location.reload();
      });
    }
    else {
      bootbox.alert('An error occured while deleting the backups!');
    }
  });
}

function menu_ExportJsonData (event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  bootbox.prompt({
    title: "Export Backups",
    message: '<p>Include:</p>',
    inputType: 'radio',
    inputOptions: [{
      text: 'All (Named + Unnamed)',
      value: '1',
    },
    {
      text: 'Named Only',
      value: '2',
    }],
    callback: function (result) {
      if (result !== null) {
        var namedBackupsOnly = (result === '2');

        chrome.extension.getBackgroundPage().getExportJsonData(namedBackupsOnly, function(json) {
          var anchor   = document.createElement('a');
          var blob     = new Blob([json], {type: 'octet/stream'});
          var filename = 'full_export.json';
          var url      = window.URL.createObjectURL(blob);
          anchor.setAttribute('href', url);
          anchor.setAttribute('download', filename);
          anchor.click();
        });
      }
    }
  });
}

function menu_ImportJsonData (event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  var dialog = bootbox.dialog({
    title:   'Select Data File To Import:',
    message: '<div></div>'
  });

  var readFile = function (event) {
    event.stopPropagation();
    event.stopImmediatePropagation();

    var input = event.target;
    var files = input.files;

    if (files.length) {
      var reader = new FileReader();

      reader.onload = function(){
        var json = reader.result;

        chrome.extension.getBackgroundPage().importJsonData(json, function(isSuccess, backupListItemArray, fullBackupArray) {
          if (isSuccess) {
            dialog.modal('hide');

            // force a page refresh to view the newly imported backups
            window.location.reload();
          }
          else {
            dialog.find('.bootbox-body').empty().append($('<code>Import Failed!</code>'));

            setTimeout(
              function(){
                dialog.modal('hide');
              },
              3000
            );
          }
        });
      };
      reader.readAsText(files[0]);
    }
  };

  var input = document.createElement('input');
  input.setAttribute('type',   'file');
  input.setAttribute('accept', 'text/plain, application/json, .txt, .json');
  input.addEventListener('change', readFile);

  dialog.init(function(){
    dialog.find('.bootbox-body').empty().append(input);
  });
}
