from datetime import datetime, timezone

from migrate_daily_bk_orders_jobs import connect, load_runtime_env


load_runtime_env()
db = connect()
try:
    now = datetime.now(timezone.utc).isoformat()
    cur = db.cursor()
    cur.execute(
        "UPDATE whatsapp_configs SET active=%s, updatedBy=%s, updateTimestamp=%s WHERE active=%s",
        ("No", "Migration - WhatsApp disabled", now, "Yes"),
    )
    updated = cur.rowcount
    db.commit()
    cur.execute("SELECT menu, active FROM whatsapp_configs ORDER BY menu")
    print(f"Updated active configurations: {updated}")
    for row in cur.fetchall():
        print(row)
finally:
    db.close()
