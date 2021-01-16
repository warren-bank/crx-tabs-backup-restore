### [Tabs Backup &amp; Restore - Extended](https://github.com/warren-bank/crx-tabs-backup-restore)

Chrome extension that extends the functionality of the original [Tabs Backup &amp; Restore](https://chrome.google.com/webstore/detail/tabs-backup-restore/dehocbglhkaogiljpihicakmlockmlgd).

#### New Features:

* ability to give each backup a name
  - named backups aren't automatically deleted
    * for example:
      - when an automatic backup causes the total number of backups to exceed the maximum to keep, which triggers garbage collection
    * conceptually:
      - unnamed backups are stored in a FIFO queue, having a finite length
      - named backups are not

#### Screenshots:

![1](./etc/screenshots/1.jpg)
![2](./etc/screenshots/2.jpg)
