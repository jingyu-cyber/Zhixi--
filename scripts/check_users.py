import sqlite3
conn = sqlite3.connect("/opt/bilimind/data/bilibili_rag.db")
cur = conn.cursor()

cur.execute("SELECT session_id, bili_mid, bili_uname FROM user_sessions WHERE bili_mid != 0 AND bili_mid IS NOT NULL LIMIT 10")
print("=== Real users ===")
for r in cur.fetchall():
    print("  session=" + str(r[0]) + " mid=" + str(r[1]) + " name=" + str(r[2]))

cur.execute("SELECT DISTINCT owner_mid FROM knowledge_nodes WHERE owner_mid != 0 AND owner_mid IS NOT NULL ORDER BY owner_mid")
real_mids = [r[0] for r in cur.fetchall()]
print("\nReal owner_mids with knowledge nodes: " + str(real_mids))

for mid in real_mids:
    cur.execute("SELECT bili_uname FROM user_sessions WHERE bili_mid = ? LIMIT 1", (mid,))
    uname = cur.fetchone()
    uname = uname[0] if uname else "unknown"

    cur.execute("SELECT COUNT(*) FROM knowledge_nodes WHERE owner_mid = ?", (mid,))
    kn = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM knowledge_edges WHERE owner_mid = ?", (mid,))
    ke = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM user_collections WHERE owner_mid = ?", (mid,))
    uc = cur.fetchone()[0]

    print("\n  User " + str(uname) + " (mid=" + str(mid) + "):")
    print("    Nodes: " + str(kn) + " edges: " + str(ke) + " collections: " + str(uc))

    cur.execute("SELECT bvid, title FROM user_collections WHERE owner_mid = ?", (mid,))
    for bvid, title in cur.fetchall():
        print("    Collected: " + str(bvid) + " - " + str(title))
        cur.execute("SELECT COUNT(*) FROM concepts WHERE video_bvid = ?", (bvid,))
        cc = cur.fetchone()[0]
        print("      -> " + str(cc) + " concepts in concepts table")

conn.close()
