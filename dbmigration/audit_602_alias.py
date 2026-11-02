from import_reel_mrr_full_workflow import load_runtime_env, sheets_values, s

load_runtime_env()
sid = "1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ"
mv = sheets_values().get(spreadsheetId=sid, range="'MRR FORM'!A1:S10000").execute().get("values", [])
hv = sheets_values().get(spreadsheetId=sid, range="'HELPER SHEET'!A1:Q10043").execute().get("values", [])
keys = {"602", "26-27/0602"}
print("PARENTS")
for i, row in enumerate(mv):
    if len(row) > 2 and s(row[2]) in keys:
        print(i + 1, row[:19])
print("HELPERS")
for i, row in enumerate(hv):
    if len(row) > 1 and s(row[1]) in keys:
        print(i + 1, row[:13])
