# UI UX Pro Max Skill

## Description
Comprehensive UI/UX design system for Bilimind project. Applies modern web design principles: glassmorphism, neumorphism, micro-interactions, responsive layouts, and accessibility-first design.

## Design Tokens
- Primary: #059669 (emerald green) — actions, links, focus
- Secondary: #6366f1 (indigo) — knowledge nodes, learning
- Accent: #f59e0b (amber) — highlights, notifications
- Background: #0f172a (slate-900 dark) / #f8fafc (slate-50 light)
- Surface: #1e293b (slate-800 dark) / #ffffff (white light)
- Text: #e2e8f0 (slate-200 dark) / #334155 (slate-700 light)

## Typography
- Sans: Inter, system-ui, -apple-system
- Mono: JetBrains Mono, Fira Code (for code/knowledge snippets)
- Scale: 12/14/16/18/20/24/30/36/48

## Spacing
- Grid: 8px base
- Component padding: 16px, 24px, 32px
- Card gap: 16px
- Section gap: 48px

## Motion
- Hover: 150ms ease-out
- Page transition: 300ms ease-in-out
- Skeleton loading: pulse animation 1.5s

## Principles
1. Progressive disclosure — show complexity on demand
2. Consistent feedback — every action has a visual response
3. Accessible contrast — WCAG AA minimum
4. Mobile-first responsive — works on 320px+
5. Dark/light mode — auto-detect, manual toggle

## Implementation
- Use Tailwind CSS 4 utility classes
- Use CSS custom properties for dynamic theming
- Prefer `transition-all` for hover effects
- Use `backdrop-blur` for glass panels
- Use `animate-pulse` for loading states

## Reference
B站参考视频: BV1cME46tEwD (Codex个人作品集网站教程)
