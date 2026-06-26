import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

# Sample of knowledge_nodes for owner_mid=0
cur.execute("SELECT id, name, node_type FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'concept' LIMIT 20")
print("Knowledge Nodes (owner_mid=0, concept type):")
for r in cur.fetchall():
    print("  id=" + str(r[0]) + " name='" + str(r[1]) + "' type=" + str(r[2]))

# Sample of concepts for owner_mid=0
cur.execute("SELECT id, name, video_bvid FROM concepts WHERE owner_mid = 0 LIMIT 20")
print("\nConcepts (owner_mid=0):")
for r in cur.fetchall():
    print("  id=" + str(r[0]) + " name='" + str(r[1]) + "' bvid=" + str(r[3]))

# Check concepts for collected bvids directly
for bvid in ['BV1E94y1P7qv', 'BV1UZFfeMEvd']:
    cur.execute("SELECT id, name FROM concepts WHERE owner_mid = 0 AND video_bvid = ?", (bvid,))
    results = cur.fetchall()
    print("\nConcepts for " + bvid + ": " + str(len(results)))
    for r in results:
        print("  id=" + str(r[0]) + " name=" + str(r[1]))

# Now check if we can CREATE knowledge_nodes from concepts if they don't exist
# This is the missing step: concepts table has the data, but knowledge_nodes wasn't populated from it for demo user

# Let me check: are there concept_relations for these concepts?
cur.execute("SELECT COUNT(*) FROM concept_relations WHERE (source_concept_id IN (SELECT id FROM concepts WHERE owner_mid = 0 AND video_bvid = 'BV1E94y1P7qv') OR target_concept_id IN (SELECT id FROM concepts WHERE owner_mid = 0 AND video_bvid = 'BV1E94y1P7qv'))")
print("\nConcept relations for BV1E94y1P7qv concepts: " + str(cur.fetchone()[0]))

conn.close()
