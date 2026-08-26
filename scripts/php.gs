const PHP_ITEM_MASTER_SYNC_CONFIG = {
  targets: [
    {
      name: 'Hostinger',
      baseUrl: 'https://darkred-lobster-409686.hostingersite.com',
      secret: '1234567890',
    },
    {
      name: 'LNGRP System',
      baseUrl: 'https://system.lngrp.in',
      secret: '1234567890',
    },
  ],
  tabName: 'PHP ITEM MASTER',
  spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
  idHeader: 'phpid',
  hostingerSyncHeader: 'Hostinger Sync',
  flushDelayMs: 15000,
  pendingRowsPropertyKey: 'PHP_ITEM_MASTER_PENDING_ROWS',
  pendingFullSyncPropertyKey: 'PHP_ITEM_MASTER_PENDING_FULL_SYNC',
  flushTriggerHandler: 'flushQueuedPhpItemMasterSync',
};

function syncPhpItemMasterSheetToHostinger() {
  return forceFullPhpItemMasterSync();
}

function forceFullPhpItemMasterSync() {
  return performFullSync_(PHP_ITEM_MASTER_SYNC_CONFIG, true);
}

function flushQueuedPhpItemMasterSync() {
  return performFlush_(PHP_ITEM_MASTER_SYNC_CONFIG, PHP_ITEM_MASTER_SYNC_CONFIG.idHeader);
}
