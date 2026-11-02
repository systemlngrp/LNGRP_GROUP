import sys
sys.path.insert(0, 'dbmigration')
from import_workbook_orders_schedules import db_connect

db = db_connect()
cur = db.cursor()
cur.execute("""SELECT COUNT(*) FROM orders o
LEFT JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
 AND LOWER(COALESCE(n.syncStatus,''))='active'
WHERE o.itemSource='FG' AND n.id IS NULL""")
print('orders_without_active_npd_by_erp', cur.fetchone()[0])
cur.execute("""SELECT o.erpCode,o.itemId,COUNT(*) FROM orders o
LEFT JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
 AND LOWER(COALESCE(n.syncStatus,''))='active'
WHERE o.itemSource='FG' AND n.id IS NULL
GROUP BY o.erpCode,o.itemId ORDER BY COUNT(*) DESC LIMIT 20""")
print(cur.fetchall())
cur.execute("""SELECT COUNT(DISTINCT o.erpCode) FROM orders o
JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
 AND LOWER(COALESCE(n.syncStatus,''))='active'
WHERE o.itemSource='FG'""")
print('matched_active_npds', cur.fetchone()[0])
cur.execute("SELECT erp, id, itemName, syncStatus FROM npd WHERE TRIM(erp) IN ('91780003','94960061','90290013','99970227')")
print('sample_npd_rows', cur.fetchall())
cur.execute("""SELECT COUNT(*) FROM orders o JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
WHERE o.itemSource='FG'""")
print('orders_with_npd_erp_any_status', cur.fetchone()[0])
cur.execute("""SELECT DISTINCT o.externalOrderId,o.erpCode,o.itemId FROM orders o
LEFT JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
WHERE o.itemSource='FG' AND n.id IS NULL""")
print('missing_npd_erp_orders', cur.fetchall())
cur.execute("""SELECT COUNT(*) FROM orders o JOIN npd n ON TRIM(n.erp)=TRIM(o.erpCode)
WHERE o.itemSource='FG' AND (o.itemId<>n.id OR o.npdId<>n.id)""")
print('remaining_wrong_links', cur.fetchone()[0])
db.close()
