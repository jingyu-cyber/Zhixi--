"""Analyze knowledge node-to-video relationships for demo user"""
import sqlite3
from collections import defaultdict

conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

# 1. Clean up my arbitrary edges
cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = 0")
before = cur.fetchone()[0]
cur.execute("DELETE FROM knowledge_edges WHERE owner_mid = 0")
cur.execute("DELETE FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic' AND name = '未分类知识'")
conn.commit()
print(f"Cleaned up {before} arbitrary edges")

# 2. Check segments structure
cur.execute("PRAGMA table_info(segments)")
print("\nSegments columns:", [c[1] for c in cur.fetchall()])

cur.execute("SELECT COUNT(*) FROM segments")
print(f"Total segments: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM segments WHERE bvid IS NOT NULL")
print(f"With bvid: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM segments WHERE bvid IS NULL")
print(f"Without bvid: {cur.fetchone()[0]}")

# 3. Check node_segment_links
cur.execute("PRAGMA table_info(node_segment_links)")
print("\nNSL columns:", [c[1] for c in cur.fetchall()])

cur.execute("SELECT COUNT(*) FROM node_segment_links")
print(f"Total NSL: {cur.fetchone()[0]}")

# 4. Check claims table (might link nodes to bvid)
cur.execute("PRAGMA table_info(claims)")
print("\nClaims columns:", [c[1] for c in cur.fetchall()])

cur.execute("SELECT COUNT(*) FROM claims WHERE owner_mid = 0")
print(f"Claims for owner_mid=0: {cur.fetchone()[0]}")

# Claims sample
cur.execute("SELECT id, concept_name, bvid, session_id FROM claims WHERE owner_mid = 0 LIMIT 5")
print("Sample claims:")
for r in cur.fetchall():
    print(f"  id={r[0]}, concept={r[1]}, bvid={r[2]}, session={r[3]}")

# Group by bvid
cur.execute("SELECT bvid, COUNT(*) FROM claims WHERE owner_mid = 0 GROUP BY bvid")
print("\nClaims by bvid:")
for r in cur.fetchall():
    print(f"  bvid={r[0]}: {r[1]} claims")

# Also check concept_relations
cur.execute("PRAGMA table_info(concept_relations)")
print("\nConcept relations columns:", [c[1] for c in cur.fetchall()])

# 5. Check knowledge_nodes for demo user
cur.execute("SELECT node_type, COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 GROUP BY node_type")
print("\nNode types for owner_mid=0:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

# 6. Find bvid mapping via claims concepts -> knowledge_nodes
print("\n=== Finding bvid for each concept ===")
cur.execute("""
    SELECT DISTINCT kn.id, kn.name, c.bvid
    FROM knowledge_nodes kn
    JOIN claims c ON kn.name = c.concept_name
    WHERE kn.owner_mid = 0 AND c.owner_mid = 0
    ORDER BY c.bvid, kn.id
    LIMIT 20
""")
results = cur.fetchall()
print(f"Matched via claims: {len(results)}")
for r in results[:10]:
    print(f"  node={r[0]} name={r[1][:40]} bvid={r[2]}")

# 7. Get video titles
cur.execute("SELECT DISTINCT c.bvid, vc.title FROM claims c LEFT JOIN video_cache vc ON c.bvid = vc.bvid WHERE c.owner_mid = 0")
print("\nVideo titles from claims:")
for r in cur.fetchall():
    print(f"  bvid={r[0]}, title={r[1]}")

conn.close()
print("\nDone!")
