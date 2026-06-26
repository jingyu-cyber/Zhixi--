import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

for bvid in ['BV1E94y1P7qv', 'BV1UZFfeMEvd']:
    cur.execute("SELECT concept_id, statement FROM claims WHERE video_bvid = ? AND owner_mid = 0 LIMIT 5", (bvid,))
    print("\n" + bvid + " claims:")
    for cid, stmt in cur.fetchall():
        print("  concept_id=" + str(cid) + ": " + (stmt[:60] if stmt else "NONE"))
        cur.execute("SELECT id, name, owner_mid FROM knowledge_nodes WHERE id = ?", (cid,))
        kn = cur.fetchone()
        if kn:
            print("    -> KN: id=" + str(kn[0]) + " name=" + str(kn[1])[:40] + " owner_mid=" + str(kn[2]))
        else:
            print("    -> KNOWLEDGE NODE NOT FOUND!")

cur.execute("SELECT DISTINCT concept_id FROM claims WHERE owner_mid = 0 AND video_bvid = 'BV1E94y1P7qv'")
concept_ids = [r[0] for r in cur.fetchall()]
print("\nConcept IDs for BV1E94y1P7qv: " + str(concept_ids))

for cid in concept_ids:
    cur.execute("SELECT id, name, owner_mid FROM knowledge_nodes WHERE id = ?", (cid,))
    kn = cur.fetchone()
    print("  KN id=" + str(cid) + ": " + str(kn))

if concept_ids:
    placeholders = ','.join('?' * len(concept_ids))
    cur.execute("SELECT id, name, owner_mid FROM knowledge_nodes WHERE id IN (" + placeholders + ")", concept_ids)
    print("\nAll KNs for these IDs:")
    for r in cur.fetchall():
        print("  id=" + str(r[0]) + " name=" + str(r[1])[:40] + " owner_mid=" + str(r[2]))

# Also: check the name-based approach
cur.execute("SELECT DISTINCT cn.name FROM claims c JOIN knowledge_nodes cn ON c.concept_id = cn.id WHERE c.video_bvid = 'BV1E94y1P7qv' AND c.owner_mid = 0")
claim_names = [r[0] for r in cur.fetchall()]
print("\nClaim concept names for BV1E94y1P7qv: " + str(claim_names))

if claim_names:
    for name in claim_names:
        cur.execute("SELECT id, name, owner_mid FROM knowledge_nodes WHERE name = ? AND owner_mid = 0", (name,))
        matches = cur.fetchall()
        print("  Demo KNs matching '" + str(name)[:50] + "': " + str(len(matches)))
        for m in matches[:3]:
            print("    id=" + str(m[0]) + " owner_mid=" + str(m[2]))

conn.close()
