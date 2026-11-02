"""Create MRR 2 through Indent -> PO -> Gate Entry -> MRR approvals."""
from __future__ import annotations
import json, re, uuid
from datetime import datetime, timezone
from collections import OrderedDict
from migrate_daily_bk_orders_jobs import load_runtime_env, sheets_values, connect

SID='1MAZwiGb5bgNXyAW-Bv4LfrdBF6mtYLyNco5IUDPnCfQ'
def s(v): return '' if v is None else str(v).strip()
def n(v):
    try: return float(s(v).replace(',','') or 0)
    except: return 0.0
def norm(v): return re.sub(r'\s+',' ',s(v)).casefold()
def next_no(cur, table, col, prefix):
    cur.execute(f"SELECT {col} FROM {table} WHERE {col} LIKE %s ORDER BY CAST(SUBSTRING_INDEX({col}, '/', -1) AS UNSIGNED) DESC LIMIT 1", (prefix+'%',))
    row=cur.fetchone(); return f"{prefix}{int(s(row[0]).split('/')[-1] or 0)+1:05d}" if row else f"{prefix}00001"

def main():
    load_runtime_env(); mv=sheets_values().get(spreadsheetId=SID,range="'MRR FORM'!A1:S10000").execute()['values']; hv=sheets_values().get(spreadsheetId=SID,range="'HELPER SHEET'!A1:Q10043").execute()['values']
    mrr=next(r for r in mv[1:] if len(r)>2 and s(r[2])=='2'); helpers=[r for r in hv[1:] if len(r)>1 and s(r[1])=='2']
    db=connect(); cur=db.cursor(); now=datetime.now(timezone.utc).isoformat(); date='2026-04-04'; truck='AS01LC8245'
    try:
        cur.execute("SELECT id,firmName FROM firms ORDER BY firmName"); firm=next(x for x in cur.fetchall() if re.search(r'unit\s*[- ]?i\b',s(x[1]),re.I) and not re.search(r'unit\s*[- ]?ii\b',s(x[1]),re.I))
        cur.execute("SELECT id,name FROM suppliers"); supplier=next(x for x in cur.fetchall() if norm(x[1])==norm(helpers[0][5]))
        cur.execute("SELECT id,erpCode FROM materials WHERE firmId=%s AND LOWER(type)='reel'",(firm[0],)); mats={s(x[1]):x[0] for x in cur.fetchall()}
        groups=OrderedDict()
        for r in helpers:
            erp=s(r[9]); groups.setdefault(erp,{'materialId':mats[erp],'qty':0,'rate':n(r[14]),'reels':[]}); g=groups[erp]; g['qty']+=n(r[13]); g['reels'].append((s(r[7]),s(r[6]),n(r[13]),s(r[3])))
        cur.execute("SELECT id FROM material_in WHERE transactionNo='2'");
        if cur.fetchone(): raise RuntimeError('MRR 2 already exists')
        indent_id, po_id, gate_id, mrr_id = [str(uuid.uuid4()) for _ in range(4)]
        indent_no=next_no(cur,'indents','indentNo','IND/26-27/'); po_no=next_no(cur,'purchase_orders','poNo','PO/26-27/'); gate_no=next_no(cur,'gate_entries','gateEntryNo','GE/26-27/')
        # Indent and approval.
        db.begin(); cur.execute("INSERT INTO indents (id,firmId,firmName,indentNo,requestedBy,requisitionDate,requiredDate,indentType,status,approvedTimestamp,approvedBy,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,'Raw Material','Approved',%s,'Migration Pilot','Migration Pilot',%s)",(indent_id,firm[0],firm[1],indent_no,'Migration Pilot',date,date,now,now))
        indent_lines=[]
        for erp,g in groups.items():
            lid=str(uuid.uuid4()); indent_lines.append((lid,erp,g)); cur.execute("INSERT INTO indent_lines (id,indentId,erpCode,materialId,uom,qty,targetDeliveryDate,orderedQty,cancelledQty,balanceQty,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,'KG',%s,%s,0,0,%s,'Migration Pilot',%s)",(lid,indent_id,erp,g['materialId'],g['qty'],date,g['qty'],now))
        db.commit(); print(f'Indent committed: {indent_no}')
        # PO and approval.
        db.begin(); taxable=sum(g['qty']*g['rate'] for _,_,g in indent_lines); qty=sum(g['qty'] for _,_,g in indent_lines); gst=round(taxable*.05,2); cur.execute("INSERT INTO purchase_orders (id,firmId,poNo,indentId,supplierId,poDate,requiredDate,totalQty,totalAmount,taxableAmount,cgst,sgst,igst,grandTotal,status,approvedBy,approvedTimestamp,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,%s,'Approved','Migration Pilot',%s,'Migration Pilot',%s)",(po_id,firm[0],po_no,indent_id,supplier[0],date,date,qty,taxable+gst,taxable,gst/2,gst/2,taxable+gst,now,now))
        for lid,erp,g in indent_lines:
            plid=str(uuid.uuid4()); amount=round(g['qty']*g['rate'],2); cur.execute("INSERT INTO purchase_order_lines (id,purchaseOrderId,indentLineId,materialId,erpCode,uom,qty,rate,amount,gstRate,cgst,sgst,igst,lineTotal,targetDeliveryDate,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,'KG',%s,%s,%s,5,%s,%s,0,%s,%s,'Migration Pilot',%s)",(plid,po_id,lid,g['materialId'],erp,g['qty'],g['rate'],amount,amount*.025,amount*.025,amount*1.05,date,now)); g['poLineId']=plid
        db.commit(); print(f'PO committed: {po_no}')
        # Gate entry.
        db.begin(); cur.execute("INSERT INTO gate_entries (id,gateEntryNo,firmId,firmName,date,supplierId,purpose,invoiceNo,invoiceValue,truckNo,status,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,'Material Receipt',%s,%s,%s,'Active','Migration Pilot',%s)",(gate_id,gate_no,firm[0],firm[1],date,supplier[0],s(mrr[4]),n(mrr[18]),truck,now)); db.commit(); print(f'Gate Entry committed: {gate_no}')
        # MRR with approvals through MD.
        db.begin(); lines=[]; total_actual=0; total_invoice=n(mrr[18]);
        for erp,g in groups.items():
            lid=str(uuid.uuid4()); value=round(g['qty']*g['rate'],2); total_actual+=value; reels=[]
            for supplier_reel,our_reel,weight,supplier_po in g['reels']:
                sid=str(uuid.uuid4()); cur.execute("INSERT INTO material_in_packing_slips (id,firmId,supplierId,materialInId,materialLineId,materialId,supplierReelNo,ourReelNo,weightKg,openingRate,supplierPoNo,ourPoId,ourPoNo,updatedBy,updateTimestamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Migration Pilot',%s)",(sid,firm[0],supplier[0],mrr_id,lid,g['materialId'],supplier_reel,our_reel,weight,g['rate'],supplier_po,g['poLineId'],po_no,now)); reels.append({'supplierReelNo':supplier_reel,'ourReelNo':our_reel,'weightKg':weight,'ourPoId':g['poLineId'],'ourPoNo':po_no})
            lines.append({'id':lid,'itemId':g['materialId'],'itemSource':'MAT','qty':g['qty'],'invoiceQty':g['qty'],'actualQty':g['qty'],'uom':'KG','invoiceRate':g['rate'],'rate':g['rate'],'poRate':g['rate'],'invoiceValue':value,'actualValue':value,'gstRate':5,'cgstRate':2.5,'sgstRate':2.5,'reels':reels})
        gst=round(total_invoice*.05,2)
        values=(mrr_id,'2','Reel',gate_id,gate_no,now,'Migration Pilot',date,s(mrr[4]),date,supplier[0],sum(g['qty']*g['rate'] for g in groups.values()),total_invoice,total_actual,gst/2,gst/2,0,total_invoice+gst,0,0,0,0,0,0,total_invoice+gst,json.dumps(lines),now,'Migration Pilot',now,'Migration Pilot',now,'Migration Pilot','Completed','Migration Pilot',now,firm[0])
        cur.execute("INSERT INTO material_in (id,transactionNo,mrrType,gateEntryId,gateEntryNo,timestamp,entryEmailId,date,invoiceNo,invDate,supplierId,totalPoValue,totalInvoiceValue,totalActualValue,totalCgst,totalSgst,totalIgst,totalInvoiceValueAfterGst,insurance,otherCharges,expenseCGST,expenseSGST,expenseIGST,roundOff,totalAmount,`lines`,phTimestamp,phEmailId,accTimestamp,accEmailId,mdTimestamp,mdEmailId,status,updatedBy,updateTimestamp,firmId) VALUES ("+','.join(['%s']*36)+")",values)
        cur.execute("UPDATE gate_entries SET mrrId=%s,mrrDate=%s,mrrNo=%s WHERE id=%s",(mrr_id,date,'2',gate_id)); db.commit(); print(f'MRR committed and approved through MD: 2; reels={len(helpers)}')
    except Exception as e: db.rollback(); raise
    finally: db.close()
if __name__=='__main__': main()
