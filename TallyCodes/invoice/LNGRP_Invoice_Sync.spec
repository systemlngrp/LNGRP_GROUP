# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules


a = Analysis(
    ['invoice_sync_all.py'],
    pathex=[],
    binaries=[],
    datas=[('.env', '.')],
    hiddenimports=(
        ['invFirm1', 'invFirm2', 'invFirm3']
        + collect_submodules('mysql.connector.locales')
        + collect_submodules('mysql.connector.plugins')
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LNGRP_Invoice_Sync',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LNGRP_Invoice_Sync',
)
