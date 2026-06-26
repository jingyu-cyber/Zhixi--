"""统一脚本：为所有用户清理知识树，只保留收藏视频的概念"""
import sqlite3

conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

# Get all user owner_mids (including demo with mid=0)
cur.execute("SELECT DISTINCT owner_mid FROM knowledge_nodes ORDER BY owner_mid")
all_mids = [r[0] for r in cur.fetchall()]
print("All owner_mids: " + str(all_mids))

for owner_mid in all_mids:
    # Get user name
    if owner_mid == 0:
        uname = "演示用户"
    else:
        cur.execute("SELECT bili_uname FROM user_sessions WHERE bili_mid = ? LIMIT 1", (owner_mid,))
        row = cur.fetchone()
        uname = row[0] if row and row[0] else "unknown"

    print("\n=== Processing: " + str(uname) + " (mid=" + str(owner_mid) + ") ===")

    # Get collected bvids
    cur.execute("SELECT bvid, title FROM user_collections WHERE owner_mid = ?", (owner_mid,))
    collected = cur.fetchall()
    print("  Collected videos: " + str(len(collected)))

    if not collected:
        # No collections -> clear all knowledge tree data for this user
        cur.execute("DELETE FROM knowledge_edges WHERE owner_mid = ?", (owner_mid,))
        cur.execute("DELETE FROM knowledge_nodes WHERE owner_mid = ?", (owner_mid,))
        print("  No collections - cleared all tree data")
        continue

    # Step 1: Clear existing knowledge tree for this user
    cur.execute("DELETE FROM knowledge_edges WHERE owner_mid = ?", (owner_mid,))
    del_edges = cur.rowcount
    cur.execute("DELETE FROM knowledge_nodes WHERE owner_mid = ?", (owner_mid,))
    del_nodes = cur.rowcount
    print("  Deleted " + str(del_edges) + " edges, " + str(del_nodes) + " nodes")

    # Step 2: For each collected video, sync concepts
    total_concepts = 0
    total_edges = 0
    total_cross = 0

    for bvid, title in collected:
        # Get concepts for this video (from any owner - share compiled knowledge)
        cur.execute("SELECT id, name, definition, difficulty FROM concepts WHERE video_bvid = ?", (bvid,))
        concepts = cur.fetchall()
        if not concepts:
            print("  " + str(bvid) + ": no concepts found (not compiled yet)")
            continue

        # Create topic node
        cur.execute(
            "INSERT INTO knowledge_nodes (node_type, name, normalized_name, definition, difficulty, confidence, source_count, review_status, session_id, owner_mid) VALUES ('topic', ?, ?, ?, 1, 0.5, ?, 'auto', ?, ?)",
            (title, title.lower().strip() if title else bvid, "B站收藏: " + str(title), len(concepts), "user_session", owner_mid)
        )
        topic_id = cur.lastrowid

        node_ids = []
        for cid, name, defn, diff in concepts:
            if not name:
                continue
            safe_name = name if name else "unknown"
            cur.execute(
                "INSERT INTO knowledge_nodes (node_type, name, normalized_name, definition, difficulty, confidence, source_count, review_status, session_id, owner_mid) VALUES ('concept', ?, ?, ?, ?, 0.7, 1, 'auto', ?, ?)",
                (safe_name, safe_name.lower().strip(), defn or "", diff or 1, "user_session", owner_mid)
            )
            kn_id = cur.lastrowid
            node_ids.append(kn_id)
            total_concepts += 1

            # Concept -> Topic edge
            cur.execute(
                "INSERT INTO knowledge_edges (source_node_id, target_node_id, relation_type, weight, confidence, evidence_video_bvid, session_id, owner_mid) VALUES (?, ?, 'belongs_to', 1.0, 0.7, ?, ?, ?)",
                (kn_id, topic_id, bvid, "user_session", owner_mid)
            )
            total_edges += 1

        # Cross-concept edges
        unique_ids = list(set(node_ids))
        if 1 < len(unique_ids) <= 60:
            for i in range(len(unique_ids)):
                for j in range(i+1, len(unique_ids)):
                    n1, n2 = unique_ids[i], unique_ids[j]
                    cur.execute(
                        "INSERT INTO knowledge_edges (source_node_id, target_node_id, relation_type, weight, confidence, evidence_video_bvid, session_id, owner_mid) VALUES (?, ?, 'co_occurrence', 0.5, 0.3, ?, ?, ?)",
                        (n1, n2, bvid, "user_session", owner_mid)
                    )
                    total_cross += 1

        print("  " + str(bvid) + " (" + str(title) + "): " + str(len(concepts)) + " concepts")

    print("  Result: " + str(total_concepts) + " concepts, " + str(total_edges) + " topic edges, " + str(total_cross) + " cross edges")

# Verify
print("\n=== Final State ===")
cur.execute("SELECT owner_mid, COUNT(*) FROM knowledge_nodes GROUP BY owner_mid ORDER BY owner_mid")
for r in cur.fetchall():
    mid = r[0]
    if mid == 0:
        name = "demo"
    else:
        cur.execute("SELECT bili_uname FROM user_sessions WHERE bili_mid = ? LIMIT 1", (mid,))
        row = cur.fetchone()
        name = row[0] if row else "unknown"
    cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = ?", (mid,))
    ec = cur.fetchone()[0]
    print("  " + str(name) + " (mid=" + str(mid) + "): " + str(r[1]) + " nodes, " + str(ec) + " edges")

conn.commit()
conn.close()
print("\nDone!")
