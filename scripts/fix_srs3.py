import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

cur.execute("DELETE FROM srs_records WHERE node_id NOT IN (SELECT id FROM knowledge_nodes)")
print("Deleted orphans: " + str(cur.rowcount))

cur.execute("DELETE FROM srs_records WHERE session_id = 'demo_session'")
print("Deleted demo: " + str(cur.rowcount))

cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'concept'")
total = cur.fetchone()[0]
print("Available concepts: " + str(total))

cur.execute("""
    INSERT INTO srs_records
    (session_id, node_id, easiness_factor, interval_days, repetitions,
     next_review_date, last_review_date, implicit_review, created_at, owner_mid)
    SELECT
        'demo_session', kn.id, 2.5, 1, 0,
        datetime('now'), datetime('now'), 0, datetime('now'), 0
    FROM knowledge_nodes kn
    WHERE kn.owner_mid = 0 AND kn.node_type = 'concept'
""")
print("Created: " + str(cur.rowcount))

cur.execute("SELECT COUNT(*) FROM srs_records WHERE session_id = 'demo_session'")
print("Total demo SRS: " + str(cur.fetchone()[0]))

cur.execute("""
    SELECT srs.node_id, kn.name
    FROM srs_records srs
    JOIN knowledge_nodes kn ON srs.node_id = kn.id
    WHERE srs.session_id = 'demo_session'
    LIMIT 5
""")
print("Sample:")
for r in cur.fetchall():
    print("  id=" + str(r[0]) + " name=" + str(r[1])[:50])

conn.commit()
conn.close()
print("Done!")
