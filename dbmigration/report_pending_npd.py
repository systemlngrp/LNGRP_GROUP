import sys
sys.path.insert(0, 'dbmigration')
from import_workbook_orders_schedules import db_connect

db = db_connect(); c = db.cursor()
c.execute("SHOW COLUMNS FROM npd")
print('npd columns:', [r[0] for r in c.fetchall()])
c.execute("""SELECT COUNT(*) FROM orders_schedule s
JOIN orders o ON o.id=s.orderId
JOIN npd n ON n.id=o.itemId
WHERE COALESCE(o.status,'')<>'Cancelled' AND COALESCE(o.itemSource,'FG')='FG'
AND COALESCE(TRIM(n.boxType),'')='' AND COALESCE(TRIM(n.rapc),'')=''""")
print('pending_npd_count', c.fetchone()[0])
c.execute("""SELECT o.externalOrderId,o.orderNo,o.erpCode,n.itemName,o.companyId,s.scheduledDate
FROM orders_schedule s JOIN orders o ON o.id=s.orderId JOIN npd n ON n.id=o.itemId
WHERE COALESCE(o.status,'')<>'Cancelled' AND COALESCE(o.itemSource,'FG')='FG'
AND COALESCE(TRIM(n.boxType),'')='' AND COALESCE(TRIM(n.rapc),'')=''
ORDER BY s.scheduledDate,o.externalOrderId LIMIT 25""")
for row in c.fetchall(): print(row)
db.close()
