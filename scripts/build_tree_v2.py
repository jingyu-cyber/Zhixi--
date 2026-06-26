"""为 demo 用户基于收藏视频构建知识树
使用 claims.concept_id 直接关联概念和视频
"""
import sqlite3
from collections import defaultdict

DB_PATH = "/opt/bilimind/data/bilibili_rag.db"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 1. Get collected bvids
cur.execute("SELECT bvid, title FROM user_collections WHERE owner_mid = 0")
collected_rows = cur.fetchall()
collected_bvids = {bvid: title for bvid, title in collected_rows}
print(f"Collected: {list(collected_bvids.keys())}")

# 2. For each collected bvid, get concepts via claims
video_concepts = defaultdict(list)  # bvid -> [(nid, name)]

for bvid, vtitle in collected_rows:
    cur.execute("""
        SELECT DISTINCT kn.id, kn.name
        FROM claims c
        JOIN knowledge_nodes kn ON c.concept_id = kn.id
        WHERE c.video_bvid = ? AND kn.owner_mid = 0
    """, (bvid,))
    results = cur.fetchall()
    print(f"\n{bvid} ({vtitle}): {len(results)} concepts from claims")
    for nid, name in results:
        print(f"  node={nid}: {name[:60]}")
    video_concepts[bvid].extend(results)

# 3. Also get concepts via segments->NSL (fallback for any not covered by claims)
for bvid in collected_bvids:
    cur.execute("""
        SELECT DISTINCT kn.id, kn.name
        FROM knowledge_nodes kn
        JOIN node_segment_links nsl ON kn.id = nsl.node_id
        JOIN segments s ON nsl.segment_id = s.id
        WHERE s.video_bvid = ?
        AND kn.owner_mid = 0
        AND kn.id NOT IN (
            SELECT c.concept_id FROM claims c WHERE c.video_bvid = ?
        )
    """, (bvid, bvid))
    extra = cur.fetchall()
    if extra:
        print(f"\n{bvid}: {len(extra)} extra from NSL")
        video_concepts[bvid].extend(extra)

# 4. Clean existing edges
cur.execute("DELETE FROM knowledge_edges WHERE owner_mid = 0")
conn.commit()
print("\nCleaned existing edges")

# 5. Create topic nodes and edges
edge_count = 0
topic_count = 0
cross_count = 0

for bvid, concepts in video_concepts.items():
    if not concepts:
        print(f"Skipping {bvid}: no concepts found")
        continue

    title = collected_bvids.get(bvid, bvid)

    # Create/get topic node
    cur.execute(
        "SELECT id FROM knowledge_nodes WHERE owner_mid = 0 AND name = ? AND node_type = 'topic'",
        (title,)
    )
    topic_row = cur.fetchone()

    if topic_row:
        topic_id = topic_row[0]
    else:
        cur.execute(
            """INSERT INTO knowledge_nodes
               (node_type, name, normalized_name, definition, difficulty, confidence,
                source_count, review_status, session_id, owner_mid)
               VALUES ('topic', ?, ?, ?, 1, 0.5, ?, 'auto', 'demo_session', 0)""",
            (title, title.lower().strip(),
             f"来自收藏视频《{title}》的知识",
             len(concepts))
        )
        topic_id = cur.lastrowid
        topic_count += 1
        print(f"Created topic: {title} (id={topic_id})")

    # Create concept→topic edges
    for nid, _ in concepts:
        cur.execute(
            "SELECT id FROM knowledge_edges WHERE source_node_id = ? AND target_node_id = ? AND relation_type = 'belongs_to'",
            (nid, topic_id)
        )
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO knowledge_edges
                   (source_node_id, target_node_id, relation_type, weight, confidence,
                    evidence_video_bvid, session_id, owner_mid)
                   VALUES (?, ?, 'belongs_to', 1.0, 0.7, ?, 'demo_session', 0)""",
                (nid, topic_id, bvid)
            )
            edge_count += 1

    # Cross-concept edges (within same video)
    unique_concepts = list(set(concepts))
    if 1 < len(unique_concepts) <= 80:
        for i in range(len(unique_concepts)):
            for j in range(i+1, len(unique_concepts)):
                nid1, _ = unique_concepts[i]
                nid2, _ = unique_concepts[j]
                cur.execute(
                    """SELECT id FROM knowledge_edges
                       WHERE ((source_node_id = ? AND target_node_id = ?)
                           OR (source_node_id = ? AND target_node_id = ?))
                       AND relation_type = 'co_occurrence'""",
                    (nid1, nid2, nid2, nid1)
                )
                if not cur.fetchone():
                    cur.execute(
                        """INSERT INTO knowledge_edges
                           (source_node_id, target_node_id, relation_type, weight, confidence,
                            evidence_video_bvid, session_id, owner_mid)
                           VALUES (?, ?, 'co_occurrence', 0.5, 0.3, ?, 'demo_session', 0)""",
                        (nid1, nid2, bvid)
                    )
                    cross_count += 1

conn.commit()

# 6. Verify
cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = 0")
total_edges = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
total_topics = cur.fetchone()[0]

print(f"\n=== DONE ===")
print(f"Topics: {total_topics}")
print(f"Topic edges: {edge_count}")
print(f"Cross edges: {cross_count}")
print(f"Total edges for demo: {total_edges}")

# Which topics?
cur.execute("SELECT id, name FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
for tid, tname in cur.fetchall():
    cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE target_node_id = ? AND relation_type = 'belongs_to'", (tid,))
    ec = cur.fetchone()[0]
    print(f"  Topic {tid}: '{tname}' -> {ec} concepts")

conn.close()
