"""Post the first qualifying Reel MRR from the Reel Management workbook."""
import json, re, sys, uuid
from datetime import datetime, timezone
from collections import OrderedDict
from migrate_daily_bk_orders_jobs import load_runtime_env, sheets_values, connect

SHEET_ID='1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ'
def s(v): return '' if v is None else str(v).strip()
def num(v): return float(s(v).replace(',','') or 0)
def norm(v): return re.sub(r'\s+',' ',s(v)).casefold()

def main():
    load_runtime_env()
    mrr=sheets_values().get(spreadsheetId=SHEET_ID,range="'MRR FORM'!A361:S361").execute()['values'][0]
    helpers=sheets_values().get(spreadsheetId=SHEET_ID,range="'HELPER SHEET'!A1:Q10043").execute()['values']
    rows=[v for v in helpers[1:] if len(v)>1 and s(v[1])==s(mrr[2])]
    if not rows: raise RuntimeError('No helper rows found')
    db=connect()
    try:
        db.begin(); cur=db.cursor()
        cur.execute("SELECT id,firmName FROM firms ORDER BY firmName")
        firm=next((x for x in cur.fetchall() if re.search(r'unit\s*[- ]?i\b',s(x[1]),re.I) and not re.search(r'unit\s*[- ]?ii\b',s(x[1]),re.I)),None)
        if not firm: raise RuntimeError('Unit-I firm not found')
        cur.execute("SELECT id,name FROM suppliers")
        supplier=next((x for x in cur.fetchall() if norm(x[1])==norm(rows[0][5])),None)
        if not supplier: raise RuntimeError('Supplier not found: '+s(rows[0][5]))
        cur.execute("SELECT id,erpCode FROM materials WHERE firmId=%s AND LOWER(type)='reel'",(firm[0],))
        materials={s(x[1]):x[0] for x in cur.fetchall()}
        groups=OrderedDict()
        for v in rows:
            erp=s(v[9]); material_id=materials.get(erp)
            if not material_id: raise RuntimeError('ERP material not found: '+erp)
            g=groups.setdefault(erp,{'materialId':material_id,'qty':0.0,'rate':num(v[14]),'reels':[]})
            g['qty']+=num(v[13]); g['reels'].append({'supplierReelNo':s(v[7]),'ourReelNo':s(v[6]),'weightKg':num(v[13]),'supplierPoNo':s(v[3]),'ourPoNo':s(v[2]).split(' - ')[0]})
        our=[r['ourReelNo'] for g in groups.values() for r in g['reels']]
        if len(our)!=len(set(our)): raise RuntimeError('Duplicate Our Reel number in source')
        marks=','.join(['%s']*len(our)); cur.execute(f"SELECT ourReelNo FROM material_in_packing_slips WHERE ourReelNo IN ({marks})",our)
        if cur.fetchall(): raise RuntimeError('One or more Our Reel numbers already exist')
        cur.execute("SELECT id FROM material_in WHERE transactionNo=%s LIMIT 1",(s(mrr[2]),))
        if cur.fetchone(): raise RuntimeError('MRR already exists: '+s(mrr[2]))
        parent_id=str(uuid.uuid4()); now=datetime.now(timezone.utc).isoformat(); total=sum(g['qty']*g['rate'] for g in groups.values()); gst=round(total*.05,2)
        lines=[]
        for erp,g in groups.items():
            lid=str(uuid.uuid4()); line={'id':lid,'itemId':g['materialId'],'itemSource':'MAT','qty':round(g['qty'],2),'invoiceQty':round(g['qty'],2),'actualQty':round(g['qty'],2),'uom':'KG','invoiceRate':g['rate'],'rate':g['rate'],'invoiceValue':round(g['qty']*g['rate'],2),'actualValue':round(g['qty']*g['rate'],2),'gstRate':5,'cgstRate':2.5,'sgstRate':2.5,'igstRate':0,'reels':g['reels']}; lines.append(line)
            for reel in g['reels']:
                sid=str(uuid.uuid4()); cur.execute("INSERT INTO material_in_packing_slips (id,supplierId,materialInId,materialLineId,materialId,supplierReelNo,ourReelNo,weightKg,openingRate,supplierPoNo,ourPoNo,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(sid,supplier[0],parent_id,lid,g['materialId'],reel['supplierReelNo'],reel['ourReelNo'],reel['weightKg'],g['rate'],reel['supplierPoNo'],reel['ourPoNo'],'Sheet MRR Import',now))
        args=(parent_id,s(mrr[2]),'Reel',now,'sheet-import','2026-04-04',s(mrr[4]),'2026-04-04',supplier[0],total,total,total,gst/2,gst/2,0,round(total+gst,2),0,0,0,0,0,0,round(total+gst,2),json.dumps(lines),'Pending PH','Sheet MRR Import',now,firm[0])
        cur.execute("INSERT INTO material_in (id,transactionNo,mrrType,timestamp,entryEmailId,date,invoiceNo,invDate,supplierId,totalPoValue,totalInvoiceValue,totalActualValue,totalCgst,totalSgst,totalIgst,totalInvoiceValueAfterGst,insurance,otherCharges,expenseCGST,expenseSGST,expenseIGST,roundOff,totalAmount,`lines`,status,updatedBy,updateTimestamp,firmId) VALUES (" + ",".join(["%s"]*len(args)) + ")", args)
        db.commit(); print(json.dumps({'mrrNo':s(mrr[2]),'date':'2026-04-04','erpLines':len(lines),'reels':len(our),'weight':round(sum(g['qty'] for g in groups.values()),2),'value':round(total,2),'gstRate':5,'status':'Pending PH'}))
    except Exception:
        db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
