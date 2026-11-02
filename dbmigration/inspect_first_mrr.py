from migrate_daily_bk_orders_jobs import load_runtime_env, sheets_values

load_runtime_env()
rows = sheets_values().get(
    spreadsheetId='1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ',
    range="'MRR FORM'!A1:S10000",
).execute().get('values', [])
for number, row in enumerate(rows[1:], 2):
    if len(row) > 2 and str(row[2]).strip() == '2':
        print({'sheetRow': number, 'values': row})
