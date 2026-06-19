# 加载状态 Skill

## Loading State Patterns

### Skeleton Screens
- Use `animate-pulse` for shimmer effect
- Match skeleton shape to content: rectangle for text, circle for avatar
- Show for min 300ms to avoid flash

### Spinners
- Use for async operations > 500ms
- Centered in container
- Brand color (#059669)

### Progress Bars
- Use for known-duration operations (compilation, upload)
- Animated width transition
- Show percentage text

### Empty States
- Icon + title + description + CTA button
- Centered layout
- Friendly copy: "还没有数据，去导入视频吧！"

### Error States
- Error icon + message
- Retry button
- Friendly error message, not raw stack trace

### Knowledge Loading
- Tree: skeleton nodes (grey rectangles with indent)
- Graph: pulsing sphere placeholder
- Search: skeleton result cards

### Compile Progress
- Progress bar with stages: "获取内容" → "知识抽取" → "构建图谱" → "完成"
- Each stage checkmark on completion
