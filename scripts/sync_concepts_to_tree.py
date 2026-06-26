"""从 concepts 表同步收藏视频的概念到 knowledge_nodes 并构建知识树
这是知识树正确的数据源：concepts 表包含所有编译产生的概念
"""
import sqlite3
from collections import defaultdict

DB_PATH = "/opt/bilimind/data/bilibili_rag.db"
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 1. Get collected bvids with titles
cur.execute("SELECT bvid, title FROM user_collections WHERE owner_mid = 0")
collected = cur.fetchall()
print("Collected videos:")
for bvid, title in collected:
    print("  " + bvid + ": " + str(title))

# 2. Get concepts from concepts table for each collected bvid
video_concept_data = {}  # bvid -> [(concept_name, definition, difficulty)]

for bvid, title in collected:
    cur.execute(
        "SELECT id, name, definition, difficulty FROM concepts WHERE owner_mid = 0 AND video_bvid = ?",
        (bvid,)
    )
    concepts = cur.fetchall()
    video_concept_data[bvid] = concepts
    print("\n" + bvid + " (" + str(title) + "): " + str(len(concepts)) + " concepts")
    for cid, name, defn, diff in concepts[:5]:
        print("  id=" + str(cid) + " name=" + str(name) + " diff=" + str(diff))

# 3. Clean previous attempts
cur.execute("DELETE FROM knowledge_edges WHERE owner_mid = 0")
cur.execute("DELETE FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
conn.commit()

# 4. For each collected video, create topic node and sync concepts
edge_count = 0
synced_count = 0
cross_count = 0

for bvid, title in collected:
    concepts = video_concept_data.get(bvid, [])
    if not concepts:
        print("\nSKIP " + bvid + ": no concepts found")
        continue

    # Create topic node
    cur.execute(
        "SELECT id FROM knowledge_nodes WHERE owner_mid = 0 AND name = ? AND node_type = 'topic'",
        (title,)
    )
    row = cur.fetchone()
    if row:
        topic_id = row[0]
    else:
        cur.execute(
            """INSERT INTO knowledge_nodes
               (node_type, name, normalized_name, definition, difficulty, confidence,
                source_count, review_status, session_id, owner_mid)
               VALUES ('topic', ?, ?, ?, 1, 0.5, ?, 'auto', 'demo_session', 0)""",
            (title, title.lower().strip() if title else bvid,
             "B站收藏视频: " + str(title),
             len(concepts))
        )
        topic_id = cur.lastrowid
        print("Created topic: " + str(title))

    # For each concept, find or create knowledge_node
    node_ids = []
    for cid, name, defn, diff in concepts:
        if not name:
            continue

        # Find existing knowledge_node by name for this owner
        cur.execute(
            "SELECT id FROM knowledge_nodes WHERE owner_mid = 0 AND name = ? AND node_type = 'concept'",
            (name,)
        )
        kn_row = cur.fetchone()
        if kn_row:
            kn_id = kn_row[0]
        else:
            safe_name = name if name else "unknown"
            cur.execute(
                """INSERT INTO knowledge_nodes
                   (node_type, name, normalized_name, definition, difficulty, confidence,
                    source_count, review_status, session_id, owner_mid)
                   VALUES ('concept', ?, ?, ?, ?, 0.7, 1, 'auto', 'demo_session', 0)""",
                (safe_name, safe_name.lower().strip(),
                 defn if defn else "",
                 diff if diff else 1)
            )
            kn_id = cur.lastrowid
            synced_count += 1
        node_ids.append(kn_id)

        # Create edge: concept -> topic
        cur.execute(
            "SELECT id FROM knowledge_edges WHERE source_node_id = ? AND target_node_id = ? AND relation_type = 'belongs_to'",
            (kn_id, topic_id)
        )
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO knowledge_edges
                   (source_node_id, target_node_id, relation_type, weight, confidence,
                    evidence_video_bvid, session_id, owner_mid)
                   VALUES (?, ?, 'belongs_to', 1.0, 0.7, ?, 'demo_session', 0)""",
                (kn_id, topic_id, bvid)
            )
            edge_count += 1

    # Cross-concept edges within video
    unique_nodes = list(set(node_ids))
    if 1 < len(unique_nodes) <= 60:
        for i in range(len(unique_nodes)):
            for j in range(i+1, len(unique_nodes)):
                n1, n2 = unique_nodes[i], unique_nodes[j]
                cur.execute(
                    """SELECT id FROM knowledge_edges
                       WHERE ((source_node_id = ? AND target_node_id = ?)
                           OR (source_node_id = ? AND target_node_id = ?))
                       AND relation_type = 'co_occurrence'""",
                    (n1, n2, n2, n1)
                )
                if not cur.fetchone():
                    cur.execute(
                        """INSERT INTO knowledge_edges
                           (source_node_id, target_node_id, relation_type, weight, confidence,
                            evidence_video_bvid, session_id, owner_mid)
                           VALUES (?, ?, 'co_occurrence', 0.5, 0.3, ?, 'demo_session', 0)""",
                        (n1, n2, bvid)
                    )
                    cross_count += 1

conn.commit()

# 5. Verify
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'concept'")
concept_count = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
topic_count = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = 0")
edge_total = cur.fetchone()[0]

print("\n=== RESULT ===")
print("New concepts synced: " + str(synced_count))
print("Total concepts: " + str(concept_count))
print("Total topics: " + str(topic_count))
print("Topic edges: " + str(edge_count))
print("Cross edges: " + str(cross_count))
print("Total edges: " + str(edge_total))

# Show topic breakdown
cur.execute("SELECT id, name FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
for tid, tname in cur.fetchall():
    cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE target_node_id = ? AND relation_type = 'belongs_to'", (tid,))
    ec = cur.fetchone()[0]
    print("  Topic '" + str(tname) + "': " + str(ec) + " concepts")

conn.close()
print("\nDone!")
