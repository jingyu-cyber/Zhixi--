import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

# Check concepts table structure
cur.execute("PRAGMA table_info(concepts)")
print("Concepts table:")
for c in cur.fetchall():
    print("  " + str(c))

# Check if the claim concept_ids match concepts table
for bvid in ['BV1E94y1P7qv', 'BV1UZFfeMEvd']:
    cur.execute("SELECT DISTINCT c2.concept_id FROM claims c2 WHERE c2.video_bvid = ? AND c2.owner_mid = 0", (bvid,))
    cids = [r[0] for r in cur.fetchall()]
    print("\n" + bvid + " concept_ids: " + str(cids))

    # Check concepts table for these IDs
    for cid in cids:
        cur.execute("SELECT id, name, owner_mid FROM concepts WHERE id = ?", (cid,))
        row = cur.fetchone()
        if row:
            print("  concepts.id=" + str(row[0]) + " name=" + str(row[1])[:50] + " owner_mid=" + str(row[2]))
        else:
            print("  concepts.id=" + str(cid) + ": NOT FOUND in concepts table")

# Check owner_mid in concepts
cur.execute("SELECT owner_mid, COUNT(*) FROM concepts GROUP BY owner_mid")
print("\nConcepts by owner_mid:")
for r in cur.fetchall():
    print("  owner_mid=" + str(r[0]) + ": " + str(r[1]))

# Now: can we match concepts (by name) to knowledge_nodes for owner_mid=0?
cur.execute("SELECT c.name, c.owner_mid FROM concepts c WHERE c.id IN (1587, 1588)")
sample = cur.fetchall()
print("\nSample concepts for ids 1587,1588:")
for r in sample:
    print("  name=" + str(r[0]) + " owner_mid=" + str(r[1]))
    cur.execute("SELECT id, name FROM knowledge_nodes WHERE name = ? AND owner_mid = 0", (r[0],))
    kn = cur.fetchall()
    print("    KN matches: " + str(len(kn)))
    for k in kn[:3]:
        print("      id=" + str(k[0]) + " name=" + str(k[1])[:50])

conn.close()
