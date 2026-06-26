import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

# What bvids do the 25 NSL (owner_mid=0) link to?
cur.execute("""
    SELECT DISTINCT s.video_bvid, COUNT(*)
    FROM node_segment_links nsl
    JOIN segments s ON nsl.segment_id = s.id
    WHERE nsl.owner_mid = 0
    GROUP BY s.video_bvid
""")
print("NSL (owner_mid=0) by video_bvid:")
for r in cur.fetchall():
    print(f"  bvid={r[0]}: {r[1]} links")

# What about ALL concepts (owner_mid=0) - how are they linked?
cur.execute("""
    SELECT kn.id, kn.name
    FROM knowledge_nodes kn
    LEFT JOIN node_segment_links nsl ON kn.id = nsl.node_id
    WHERE kn.owner_mid = 0 AND nsl.id IS NULL
    LIMIT 5
""")
no_links = cur.fetchall()
print(f"\nConcepts (owner_mid=0) with NO NSL: at least {len(no_links)}")
for r in no_links:
    print(f"  node={r[0]} name={r[1][:40]}")

# How many concepts have NSL links vs not?
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'concept'")
total = cur.fetchone()[0]
cur.execute("""
    SELECT COUNT(DISTINCT kn.id) FROM knowledge_nodes kn
    JOIN node_segment_links nsl ON kn.id = nsl.node_id
    WHERE kn.owner_mid = 0
""")
linked = cur.fetchone()[0]
print(f"\nTotal concepts: {total}, With NSL: {linked}, Without: {total-linked}")

# Check if concepts are linked through claims instead
cur.execute("""
    SELECT COUNT(DISTINCT kn.id)
    FROM knowledge_nodes kn
    JOIN claims c ON kn.id = c.concept_id
    WHERE kn.owner_mid = 0
""")
via_claims = cur.fetchone()[0]
print(f"Concepts linked via claims: {via_claims}")

# What bvids for concepts via claims?
cur.execute("""
    SELECT c.video_bvid, COUNT(DISTINCT kn.id)
    FROM knowledge_nodes kn
    JOIN claims c ON kn.id = c.concept_id
    WHERE kn.owner_mid = 0
    GROUP BY c.video_bvid
""")
print("\nClaims (owner_mid=0 concepts) by video_bvid:")
for r in cur.fetchall():
    print(f"  bvid={r[0]}: {r[1]} concepts")

# Check claims directly for owner_mid=0
cur.execute("SELECT owner_mid, COUNT(*) FROM claims GROUP BY owner_mid")
print("\nClaims by owner_mid:")
for r in cur.fetchall():
    print(f"  owner_mid={r[0]}: {r[1]}")

# Check claims for collected bvids but all owner_mid
cur.execute("""
    SELECT c.video_bvid, c.owner_mid, COUNT(*), COUNT(DISTINCT c.concept_id)
    FROM claims c
    WHERE c.video_bvid IN ('BV1E94y1P7qv', 'BV1UZFfeMEvd')
    GROUP BY c.video_bvid, c.owner_mid
""")
print("\nClaims for collected bvids:")
for r in cur.fetchall():
    print(f"  bvid={r[0]} owner_mid={r[1]} claims={r[2]} concepts={r[3]}")

# So claims for collected bvids exist but owner_mid != 0
# Let me check: do knowledge_nodes referenced by these claims exist with owner_mid=0?
cur.execute("""
    SELECT COUNT(DISTINCT kn.id)
    FROM knowledge_nodes kn
    JOIN claims c ON kn.name = (
        SELECT kn2.name FROM knowledge_nodes kn2 WHERE kn2.id = c.concept_id
    )
    WHERE c.video_bvid IN ('BV1E94y1P7qv', 'BV1UZFfeMEvd')
    AND kn.owner_mid = 0
""")
print(f"\nDemo concepts matching claim concept names: {cur.fetchone()[0]}")

# Direct approach: for each collected video, find all claims (any owner) and
# match them to demo user's concepts by name
for bvid in ['BV1E94y1P7qv', 'BV1UZFfeMEvd']:
    cur.execute("""
        SELECT DISTINCT kn.id, kn.name
        FROM claims c
        JOIN knowledge_nodes kn ON kn.name = (
            SELECT kn_inner.name FROM knowledge_nodes kn_inner
            WHERE kn_inner.id = c.concept_id
        )
        WHERE c.video_bvid = ? AND kn.owner_mid = 0
    """, (bvid,))
    results = cur.fetchall()
    print(f"\n{bvid}: {len(results)} demo concepts matched by claim->concept name")

conn.close()
