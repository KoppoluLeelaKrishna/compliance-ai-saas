import sqlite3

SCAN_ID = "df6685c8-decb-4f53-9111-5dfd47514d69"
with sqlite3.connect("local.db") as c:
    rows = c.execute(
        "select service,title,check_id from findings where scan_id=?",
        (SCAN_ID,),
    ).fetchall()

print(rows)