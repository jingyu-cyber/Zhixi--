"""清理知识树：只保留收藏视频相关的节点和边"""
import sqlite3

DB_PATH = "/opt/bilimind/data/bilibili_rag.db"
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# 1. 找到收藏视频的 topic 节点
cur.execute("SELECT id, name FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
topics = cur.fetchall()
print("Topics for owner_mid=0:")
for tid, tname in topics:
    cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE target_node_id = ? AND relation_type = 'belongs_to'", (tid,))
    ec = cur.fetchone()[0]
    print("  id=" + str(tid) + " name=" + str(tname) + " concepts=" + str(ec))

# 2. 收集所有需要保留的节点 ID（话题 + 连接到话题的概念）
keep_node_ids = set()
for tid, tname in topics:
    keep_node_ids.add(tid)
    # 找到所有连接到这个话题的概念
    cur.execute(
        "SELECT source_node_id FROM knowledge_edges WHERE target_node_id = ? AND owner_mid = 0",
        (tid,)
    )
    for (nid,) in cur.fetchall():
        keep_node_ids.add(nid)

print("\nNodes to keep: " + str(len(keep_node_ids)))

# 3. 统计要删除的
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0")
total_nodes = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = 0")
total_edges = cur.fetchone()[0]

delete_nodes = total_nodes - len(keep_node_ids)
print("Total nodes: " + str(total_nodes))
print("To delete: " + str(delete_nodes))
print("Total edges: " + str(total_edges))

# 4. 删除不需要的节点（先删边，再删节点）
if keep_node_ids:
    # 构建 IN 子句
    placeholders = ','.join('?' * len(keep_node_ids))
    keep_list = list(keep_node_ids)

    # 删除不在保留列表中的节点的边
    cur.execute(
        "DELETE FROM knowledge_edges WHERE owner_mid = 0 AND source_node_id NOT IN (" + placeholders + ") AND target_node_id NOT IN (" + placeholders + ")",
        keep_list + keep_list
    )
    deleted_edges = cur.rowcount
    print("Deleted edges: " + str(deleted_edges))

    # 删除不在保留列表中的节点
    cur.execute(
        "DELETE FROM knowledge_nodes WHERE owner_mid = 0 AND id NOT IN (" + placeholders + ")",
        keep_list
    )
    deleted_nodes = cur.rowcount
    print("Deleted nodes: " + str(deleted_nodes))

conn.commit()

# 5. 验证
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0")
remaining_nodes = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = 0")
remaining_edges = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
remaining_topics = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'concept'")
remaining_concepts = cur.fetchone()[0]

print("\n=== AFTER CLEANUP ===")
print("Nodes: " + str(remaining_nodes) + " (topics=" + str(remaining_topics) + ", concepts=" + str(remaining_concepts) + ")")
print("Edges: " + str(remaining_edges))

# Show remaining topics
cur.execute("SELECT id, name FROM knowledge_nodes WHERE owner_mid = 0 AND node_type = 'topic'")
for tid, tname in cur.fetchall():
    cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE target_node_id = ? AND relation_type = 'belongs_to'", (tid,))
    ec = cur.fetchone()[0]
    print("  Topic: " + str(tname) + " -> " + str(ec) + " concepts")

conn.close()
print("\nDone!")
