# 空状态 Skill

## Empty State Design

### Common Empty States in Bilimind

#### Knowledge Tree (empty)
- Icon: 🌳 tree outline
- Title: "知识树还是空的"
- Description: "编译视频后，知识点会自动出现在这里"
- CTA: "去编译视频" → /workspace

#### Search (no results)
- Icon: 🔍 magnifying glass
- Title: "没有找到相关内容"
- Description: "尝试更换关键词，或导入更多视频"
- CTA: "查看知识树" → /tree

#### Chat (no conversations)
- Icon: 💬 chat bubble
- Title: "开始新的对话"
- Description: "在下方输入你的问题，AI 会基于你的知识库回答"
- No CTA needed (input is visible)

#### Workspace (no videos)
- Icon: 📹 video camera
- Title: "还没有导入视频"
- Description: "点击上方扫码登录 B 站，选择收藏夹导入视频"
- CTA: "扫码登录"

### Empty State Pattern
```tsx
<div className="empty-state">
  <div className="empty-icon">{icon}</div>
  <h3>{title}</h3>
  <p>{description}</p>
  {cta && <button>{cta}</button>}
</div>
```
