# 移动端优先 Skill

## Mobile-First Adaptation

### Breakpoints
- Base: < 640px (mobile)
- sm: 640px+ (large phone)
- md: 768px+ (tablet)
- lg: 1024px+ (laptop)
- xl: 1280px+ (desktop)

### Mobile Layout Rules
1. Sidebar → bottom tab bar (4-5 items max)
2. 3-panel layout → single panel with swipe/tab navigation
3. Data tables → stacked card list
4. 3D graph → simplified 2D tree view
5. Modals → full-screen sheets

### Touch Targets
- Minimum 44x44px touch area
- 8px gap between tappable elements
- Swipe gestures for common actions

### Mobile Navigation
```
Bottom tabs: Home | Tree | Search | Chat | Workspace
```
- Active tab: primary color fill
- Badge: unread count on chat tab

### Performance
- Reduce 3D particles on mobile
- Lazy load heavy components
- Use `loading="lazy"` on images
- Avoid backdrop-filter on mobile (GPU heavy)

### Test Devices
- iPhone SE (375px)
- iPhone 14 (390px)
- iPad (768px)
