# 玻璃态设计 Skill

## Glassmorphism Design Pattern
*参考 B站视频 BV1cME46tEwD Codex作品集风格*

### Glass Panel CSS
```css
.glass-panel {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}
```

### Glass Card Variants
1. **Light glass**: `bg-white/10 backdrop-blur-md border-white/20`
2. **Dark glass**: `bg-slate-900/40 backdrop-blur-lg border-slate-700/30`
3. **Colored glass**: `bg-emerald-500/10 backdrop-blur-md border-emerald-500/20`

### Usage in Bilimind
- Knowledge tree panels: dark glass on gradient background
- Search results: light glass cards
- Chat messages: colored glass bubbles
- Modals: dark glass with strong blur

### Accessibility Notes
- Ensure 4.5:1 text contrast over glass background
- Provide solid fallback for browsers without backdrop-filter
- Test on low-end devices (blur is GPU-intensive)
