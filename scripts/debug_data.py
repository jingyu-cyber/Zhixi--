import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

cur.execute("SELECT owner_mid, COUNT(*) FROM segments GROUP BY owner_mid")
print("Segments by owner_mid:")
for r in cur.fetchall():
    print(f"  owner_mid={r[0]}: {r[1]}")

cur.execute("SELECT owner_mid, COUNT(*) FROM node_segment_links GROUP BY owner_mid")
print("\nNSL by owner_mid:")
for r in cur.fetchall():
    print(f"  owner_mid={r[0]}: {r[1]}")

cur.execute("""
    SELECT s.video_bvid, s.owner_mid, COUNT(*)
    FROM segments s
    WHERE s.video_bvid IN ('BV1E94y1P7qv', 'BV1UZFfeMEvd')
    GROUP BY s.video_bvid, s.owner_mid
""")
print("\nSegments for collected bvids:")
for r in cur.fetchall():
    print(f"  bvid={r[0]} seg_owner={r[1]} count={r[2]}")

# Check linking WITHOUT owner_mid filter on segments
cur.execute("""
    SELECT DISTINCT kn.id, kn.name, s.video_bvid
    FROM knowledge_nodes kn
    JOIN node_segment_links nsl ON kn.id = nsl.node_id
    JOIN segments s ON nsl.segment_id = s.id
    WHERE s.video_bvid IN ('BV1E94y1P7qv', 'BV1UZFfeMEvd')
    AND kn.owner_mid = 0
    LIMIT 15
""")
print("\nDemo concepts (owner_mid=0) via collected bvids:")
results = cur.fetchall()
print(f"Count: {len(results)}")
for r in results[:10]:
    print(f"  node={r[0]} name={r[1][:50]} bvid={r[2]}")

# Also check via claims
cur.execute("""
    SELECT DISTINCT kn.id, kn.name, c.video_bvid
    FROM knowledge_nodes kn
    JOIN claims c ON kn.id = c.concept_id
    WHERE c.video_bvid IN ('BV1E94y1P7qv', 'BV1UZFfeMEvd')
    AND kn.owner_mid = 0
    LIMIT 15
""")
print("\nDemo concepts via claims:")
results2 = cur.fetchall()
print(f"Count: {len(results2)}")
for r in results2[:10]:
    print(f"  node={r[0]} name={r[1][:50]} bvid={r[2]}")

conn.close()
