# 动画与过渡 Skill

## Animation System

### Duration Tokens
- `--duration-fast`: 100ms (micro-interactions)
- `--duration-normal`: 200ms (hover states)
- `--duration-slow`: 400ms (page transitions)
- `--duration-entrance`: 500ms (hero animations)

### Easing Tokens
- `--ease-out`: cubic-bezier(0, 0, 0.2, 1) — elements appearing
- `--ease-in`: cubic-bezier(0.4, 0, 1, 1) — elements disappearing
- `--ease-bounce`: cubic-bezier(0.34, 1.56, 0.64, 1) — celebratory

### Patterns
1. **Fade In**: `opacity: 0 → 1` with translateY 8px → 0
2. **Scale In**: `scale(0.95) → scale(1)` with opacity
3. **Slide In**: from edge with translateX/Y
4. **Stagger**: delay children by 50ms each (use index * 50ms)

### For 3D Graph
- Camera zoom: smooth lerp over 800ms
- Node hover: scale(1.2) over 150ms
- Bloom intensity: animate from 0 → 1.2 over 500ms on load

### Performance
- Use `transform` and `opacity` only (GPU composited)
- Avoid animating `width`, `height`, `left`, `top`
- Use `will-change` sparingly
- Respect `prefers-reduced-motion` media query
