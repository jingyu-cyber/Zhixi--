import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM srs_records WHERE session_id = 'demo_session'")
print("Before: " + str(cur.fetchone()[0]))

cur.execute("SELECT node_id, name FROM srs_records WHERE session_id = 'demo_session' LIMIT 3")
for r in cur.fetchall():
    print("  " + str(r))

cur.execute("DELETE FROM srs_records WHERE session_id = 'demo_session'")
print("Deleted demo: " + str(cur.rowcount))

cur.execute("DELETE FROM srs_records WHERE node_id IN (SELECT id FROM knowledge_nodes WHERE owner_mid = 0)")
print("Deleted by KN: " + str(cur.rowcount))

cur.execute("""
    INSERT INTO srs_records
    (node_id, name, definition, node_type, session_id,
     easiness_factor, interval_days, repetitions, next_review_date)
    SELECT
        kn.id,
        COALESCE(kn.name, 'concept'),
        COALESCE(kn.definition, ''),
        kn.node_type,
        'demo_session',
        2.5, 1, 0, datetime('now')
    FROM knowledge_nodes kn
    WHERE kn.owner_mid = 0 AND kn.node_type = 'concept'
""")
print("Created: " + str(cur.rowcount))

cur.execute("SELECT node_id, name FROM srs_records WHERE session_id = 'demo_session' LIMIT 5")
print("After:")
for r in cur.fetchall():
    print("  " + str(r[0]) + " " + str(r[1])[:50])

conn.commit()
conn.close()
print("Done!")
