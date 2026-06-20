# 暗色模式 Skill

## Dark/Light Theme System

### Implementation
- CSS custom properties for colors: `--bg-primary`, `--text-primary`, etc.
- `data-theme="dark|light"` attribute on `<html>`
- System preference detection via `prefers-color-scheme`
- localStorage persistence for user preference
- Smooth transition: `transition: background-color 200ms, color 200ms`

### Color Mapping
| Element | Light | Dark |
|---------|-------|------|
| Background | #f8fafc | #0f172a |
| Surface | #ffffff | #1e293b |
| Text primary | #0f172a | #e2e8f0 |
| Text secondary | #475569 | #94a3b8 |
| Border | #e2e8f0 | #334155 |

### Contrast
- Minimum 4.5:1 for body text (WCAG AA)
- Minimum 3:1 for large text
- Test with axe DevTools or Lighthouse
