# 响应式设计 Skill

## Mobile-First Responsive Design

### Breakpoints
- sm: 640px (phone landscape)
- md: 768px (tablet)
- lg: 1024px (laptop)
- xl: 1280px (desktop)
- 2xl: 1536px (wide)

### Rules
1. Design mobile layout first, enhance for larger screens
2. Use max-width containers (not fixed width)
3. Touch targets minimum 44x44px
4. Stack columns vertically on mobile, side-by-side on desktop
5. Hide non-essential elements on mobile (use `hidden md:block`)

### Patterns
- Sidebar → bottom tabs on mobile
- Data tables → card list on mobile
- 3D graph → simplified 2D view on mobile
- Forms → full-width on mobile
