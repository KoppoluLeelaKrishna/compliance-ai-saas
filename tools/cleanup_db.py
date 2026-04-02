import sqlite3

DB = "local.db"

with sqlite3.connect(DB) as conn:
    cur = conn.cursor()

    # delete old rows where new columns are NULL
    cur.execute("DELETE FROM findings WHERE service IS NULL OR title IS NULL")
    deleted = cur.rowcount

    # show last 5 rows after cleanup
    cur.execute("SELECT service, title, check_id FROM findings ORDER BY id DESC LIMIT 5")
    rows = cur.fetchall()

print("deleted rows:", deleted)
print("last 5:", rows)