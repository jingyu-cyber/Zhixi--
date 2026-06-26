import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

cur.execute("""
    SELECT srs.node_id, srs.name, kn.name as kn_name
    FROM srs_records srs
    LEFT JOIN knowledge_nodes kn ON srs.node_id = kn.id
    WHERE srs.session_id = 'demo_session'
    LIMIT 10
""")
print("=== SRS records sample ===")
for r in cur.fetchall():
    print("  node_id=" + str(r[0]) + " srs_name=" + str(r[1]) + " kn_name=" + str(r[2]))

cur.execute("""
    SELECT COUNT(*)
    FROM srs_records srs
    LEFT JOIN knowledge_nodes kn ON srs.node_id = kn.id
    WHERE srs.session_id = 'demo_session' AND kn.id IS NULL
""")
print("\nOrphan SRS records: " + str(cur.fetchone()[0]))

# Delete orphans
cur.execute("""
    DELETE FROM srs_records
    WHERE session_id = 'demo_session'
    AND node_id NOT IN (SELECT id FROM knowledge_nodes)
""")
print("Deleted orphans: " + str(cur.rowcount))

# Delete all demo SRS records and regenerate from current knowledge_nodes
cur.execute("DELETE FROM srs_records WHERE session_id = 'demo_session'")
print("Cleared all demo SRS records")

# Re-init from current knowledge_nodes
cur.execute("""
    INSERT INTO srs_records (node_id, name, definition, node_type, session_id, easiness_factor, interval_days, repetitions, next_review_date)
    SELECT id, name, definition, node_type, 'demo_session', 2.5, 1, 0, datetime('now')
    FROM knowledge_nodes
    WHERE owner_mid = 0 AND node_type = 'concept'
    ORDER BY source_count DESC
    LIMIT 50
""")
print("Created SRS records: " + str(cur.rowcount))

conn.commit()
conn.close()
print("Done!")
