# 布局与网格 Skill

## Layout System

### Grid System (8px base)
- 4px (0.5x), 8px (1x), 12px (1.5x), 16px (2x), 24px (3x), 32px (4x), 48px (6x), 64px (8x)

### Page Layouts
1. **Landing page**: Full-width hero + 3-column features + 4-step process
2. **Workspace**: Sidebar (280px) + main content + chat panel (380px) — collapsible
3. **Tree page**: Left tree (320px) + center workspace (flex) + right evidence (400px) — 3-panel
4. **Search**: Full-width search bar + results grid (2-3 columns)

### Container Pattern
```css
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
}
```

### Panel Design
- Rounded corners: 12px for cards, 16px for panels
- Border: 1px solid var(--border-color)
- Shadow: 0 4px 12px rgba(0,0,0,0.08)
- Glass panels: `backdrop-blur-md bg-opacity-80`

### Spacing Rules
- Section margin-bottom: 48px
- Card padding: 24px
- Between cards: 16px gap
- Form field gap: 16px
- Sidebar item padding: 12px 16px
