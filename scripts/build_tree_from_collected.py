"""为 demo 用户基于其收藏的视频构建知识树边
只包含 user_collections 表中的视频
使用 segments.video_bvid（不是 bvid）来关联概念和视频
"""
import sqlite3
from collections import defaultdict

DB_PATH = "/opt/bilimind/data/bilibili_rag.db"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 1. Get user's collected videos
cur.execute("""
    SELECT bvid, title FROM user_collections
    WHERE owner_mid = 0
""")
collected = cur.fetchall()
print(f"Collected videos: {len(collected)}")
collected_bvids = set()
for bvid, title in collected:
    print(f"  {bvid}: {title}")
    collected_bvids.add(bvid)

if not collected_bvids:
    print("No collected videos found!")
    conn.close()
    exit(1)

# 2. For each collected video, find its concepts via segments
video_concepts = defaultdict(list)  # bvid -> [(node_id, node_name)]

for bvid in collected_bvids:
    cur.execute("""
        SELECT DISTINCT kn.id, kn.name
        FROM knowledge_nodes kn
        JOIN node_segment_links nsl ON kn.id = nsl.node_id
        JOIN segments s ON nsl.segment_id = s.id
        WHERE s.video_bvid = ? AND kn.owner_mid = 0
    """, (bvid,))
    concepts = cur.fetchall()
    video_concepts[bvid] = concepts
    print(f"\n  {bvid}: {len(concepts)} concepts")
    for nid, name in concepts[:5]:
        print(f"    node={nid} name={name[:50]}")

# 3. Also find concepts via claims (claims also have video_bvid)
for bvid in collected_bvids:
    cur.execute("""
        SELECT DISTINCT kn.id, kn.name
        FROM knowledge_nodes kn
        JOIN claims c ON kn.id = c.concept_id
        WHERE c.video_bvid = ? AND kn.owner_mid = 0
        AND kn.id NOT IN (
            SELECT kn2.id FROM knowledge_nodes kn2
            JOIN node_segment_links nsl2 ON kn2.id = nsl2.node_id
            JOIN segments s2 ON nsl2.segment_id = s2.id
            WHERE s2.video_bvid = ?
        )
    """, (bvid, bvid))
    extra = cur.fetchall()
    if extra:
        print(f"\n  {bvid}: {len(extra)} ADDITIONAL concepts via claims")
        video_concepts[bvid].extend(extra)

# 4. Get video titles
video_titles = {}
for bvid in collected_bvids:
    cur.execute("SELECT title FROM video_cache WHERE bvid = ?", (bvid,))
    row = cur.fetchone()
    if row and row[0]:
        video_titles[bvid] = row[0]
    else:
        # Fallback to user_collections title
        cur.execute("SELECT title FROM user_collections WHERE bvid = ? AND owner_mid = 0", (bvid,))
        row = cur.fetchone()
        video_titles[bvid] = row[0] if row and row[0] else bvid

# 5. Clear any existing edges for owner_mid=0 (from my previous arbitrary build)
cur.execute("DELETE FROM knowledge_edges WHERE owner_mid = 0")
cur.execute("DELETE FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic' AND name IN (SELECT title FROM user_collections WHERE owner_mid = 0)")
conn.commit()

# 6. Create topic nodes and edges
edge_count = 0
topic_count = 0
cross_count = 0

for bvid in collected_bvids:
    concepts = video_concepts[bvid]
    if not concepts:
        continue

    title = video_titles.get(bvid, bvid)
    safe_title = title if title else bvid

    # Create topic node for this video
    cur.execute(
        "SELECT id FROM knowledge_nodes WHERE owner_mid = 0 AND name = ? AND node_type = 'topic'",
        (safe_title,)
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
            (safe_title, safe_title.lower().strip(),
             f"收藏视频《{safe_title}》的知识主题",
             len(concepts))
        )
        topic_id = cur.lastrowid
        topic_count += 1
        print(f"Created topic: id={topic_id}, name={safe_title}")

    # Create edges from each concept to topic
    for nid, name in concepts:
        cur.execute(
            """SELECT id FROM knowledge_edges
               WHERE source_node_id = ? AND target_node_id = ?
               AND relation_type = 'related_to'""",
            (nid, topic_id)
        )
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO knowledge_edges
                   (source_node_id, target_node_id, relation_type, weight, confidence,
                    evidence_video_bvid, session_id, owner_mid)
                   VALUES (?, ?, 'related_to', 1.0, 0.5, ?, 'demo_session', 0)""",
                (nid, topic_id, bvid)
            )
            edge_count += 1

    # 7. Cross-concept edges (concepts in same video are topically related)
    if len(concepts) >= 2 and len(concepts) <= 100:  # Skip if too many to avoid explosion
        for i in range(len(concepts)):
            for j in range(i + 1, len(concepts)):
                nid1, _ = concepts[i]
                nid2, _ = concepts[j]
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
                           VALUES (?, ?, 'co_occurrence', 0.7, 0.4, ?, 'demo_session', 0)""",
                        (nid1, nid2, bvid)
                    )
                    cross_count += 1

conn.commit()

# 8. Verify
cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = 0")
total_edges = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
total_topics = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'concept'")
total_concepts = cur.fetchone()[0]

print(f"\n=== RESULT ===")
print(f"Topics: {total_topics} (new: {topic_count})")
print(f"Concepts: {total_concepts}")
print(f"Topic edges: {edge_count}")
print(f"Cross edges: {cross_count}")
print(f"Total edges: {total_edges}")

conn.close()
print("Done!")
