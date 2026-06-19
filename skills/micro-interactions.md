# 微交互动效 Skill

## Micro-Interactions System

### Button States
- **Default**: normal styling
- **Hover**: scale(1.02), shadow increase, 150ms
- **Active/Pressed**: scale(0.98), 100ms
- **Disabled**: opacity: 0.5, cursor: not-allowed
- **Loading**: spinner + disabled text

### Card Interactions
- Hover: translateY(-2px), shadow-lg, 200ms
- Click: translateY(0), shadow-md, 100ms
- Expand: max-height transition, 300ms ease

### Input Fields
- Focus: border-color change + ring-2, 150ms
- Error: shake animation (3x, 4px amplitude)
- Success: green border + checkmark fade-in

### Knowledge Tree
- Node expand: children slide-down, 200ms
- Node select: background highlight + left-border accent
- Node hover: slight background tint

### 3D Graph
- Node hover: emissive glow intensify, scale(1.3)
- Node click: camera fly-to, 600ms ease
- Edge hover: line width increase + highlight

### Feedback Patterns
- Toast/Snackbar: slide-in from top-right, auto-dismiss 4s
- Tooltip: fade-in 100ms, delay 300ms
- Modal: backdrop fade + scale-up entrance
