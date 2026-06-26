"""为 demo 用户从已有编译数据创建知识边"""
import sqlite3
from collections import defaultdict

DB_PATH = "/opt/bilimind/data/bilibili_rag.db"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 1. Get all concept nodes for demo user
cur.execute("SELECT id, name FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'concept'")
concepts = cur.fetchall()
print(f"Demo user concepts: {len(concepts)}")

# 2. Try to get bvid for each concept from node_segment_links
concept_videos = defaultdict(list)
concept_bvids = {}

for nid, name in concepts:
    cur.execute("""
        SELECT DISTINCT s.bvid
        FROM segments s
        JOIN node_segment_links nsl ON s.id = nsl.segment_id
        WHERE nsl.node_id = ?
    """, (nid,))
    bvids = [r[0] for r in cur.fetchall() if r[0]]
    concept_bvids[nid] = bvids
    if bvids:
        for bvid in bvids:
            concept_videos[bvid].append((nid, name))
    else:
        # No bvid - group under "未分类知识"
        concept_videos["_no_bvid"].append((nid, name))

print(f"Concepts with bvid: {sum(1 for v in concept_bvids.values() if v)}")
print(f"Concepts without bvid: {sum(1 for v in concept_bvids.values() if not v)}")

# 3. Get video titles
for bvid in list(concept_videos.keys()):
    if bvid == "_no_bvid":
        continue
    cur.execute("SELECT title FROM video_cache WHERE bvid = ?", (bvid,))
    row = cur.fetchone()
    title = row[0] if row and row[0] else bvid
    print(f"Video {bvid} ({title}): {len(concept_videos[bvid])} concepts")

# 4. Create topic nodes and edges
edge_count = 0
topic_count = 0
cross_edge_count = 0

for bvid, vid_concepts in concept_videos.items():
    if bvid == "_no_bvid":
        title = "未分类知识"
    else:
        cur.execute("SELECT title FROM video_cache WHERE bvid = ?", (bvid,))
        row = cur.fetchone()
        title = row[0] if row and row[0] else bvid

    # Check/create topic node
    cur.execute(
        "SELECT id FROM knowledge_nodes WHERE owner_mid = 0 AND name = ? AND node_type = 'topic'",
        (title,)
    )
    topic_row = cur.fetchone()

    if not topic_row:
        safe_title = title if title else "未知主题"
        cur.execute(
            """INSERT INTO knowledge_nodes
               (node_type, name, normalized_name, definition, difficulty, confidence,
                source_count, review_status, session_id, owner_mid)
               VALUES ('topic', ?, ?, ?, 1, 0.5, 1, 'auto', 'demo_session', 0)""",
            (safe_title, safe_title.lower().strip(), f"From: {safe_title}")
        )
        topic_id = cur.lastrowid
        topic_count += 1
        print(f"Created topic: id={topic_id}, name={safe_title}")
    else:
        topic_id = topic_row[0]

    # Create edges from each concept to topic
    for nid, name in vid_concepts:
        cur.execute(
            """SELECT id FROM knowledge_edges
               WHERE source_node_id = ? AND target_node_id = ? AND relation_type = 'related_to'""",
            (nid, topic_id)
        )
        if not cur.fetchone():
            effective_bvid = bvid if bvid != "_no_bvid" else None
            cur.execute(
                """INSERT INTO knowledge_edges
                   (source_node_id, target_node_id, relation_type, weight, confidence,
                    evidence_video_bvid, session_id, owner_mid)
                   VALUES (?, ?, 'related_to', 1.0, 0.5, ?, 'demo_session', 0)""",
                (nid, topic_id, effective_bvid)
            )
            edge_count += 1

    # Cross-concept edges within same video group
    if len(vid_concepts) >= 2:
        for i in range(len(vid_concepts)):
            for j in range(i + 1, len(vid_concepts)):
                nid1, _ = vid_concepts[i]
                nid2, _ = vid_concepts[j]
                cur.execute(
                    """SELECT id FROM knowledge_edges
                       WHERE ((source_node_id = ? AND target_node_id = ?)
                           OR (source_node_id = ? AND target_node_id = ?))
                       AND relation_type = 'co_occurrence'""",
                    (nid1, nid2, nid2, nid1)
                )
                if not cur.fetchone():
                    effective_bvid = bvid if bvid != "_no_bvid" else None
                    cur.execute(
                        """INSERT INTO knowledge_edges
                           (source_node_id, target_node_id, relation_type, weight, confidence,
                            evidence_video_bvid, session_id, owner_mid)
                           VALUES (?, ?, 'co_occurrence', 0.7, 0.4, ?, 'demo_session', 0)""",
                        (nid1, nid2, effective_bvid)
                    )
                    cross_edge_count += 1

conn.commit()

# Verify
cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = 0")
total = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
topics = cur.fetchone()[0]

print(f"\n=== RESULT: {topic_count} topics, {edge_count} topic edges, {cross_edge_count} cross edges ===")
print(f"Total edges for owner_mid=0: {total}")
print(f"Total topics for owner_mid=0: {topics}")

conn.close()
print("Done!")

