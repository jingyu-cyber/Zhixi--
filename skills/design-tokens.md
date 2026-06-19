# 设计 Token Skill

## CSS Custom Properties System

### Colors
```css
:root {
  --primary: #059669;
  --primary-light: #34d399;
  --primary-dark: #047857;
  --secondary: #6366f1;
  --accent: #f59e0b;
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-surface: #334155;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --border-color: #334155;
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #06b6d4;
}
```

### Dark/Light via data-theme
```css
[data-theme="light"] {
  --bg-primary: #f8fafc;
  --bg-secondary: #f1f5f9;
  --bg-surface: #ffffff;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --border-color: #e2e8f0;
}
```

### Border Radius
- `--radius-sm`: 6px (buttons, inputs)
- `--radius-md`: 10px (cards)
- `--radius-lg`: 16px (panels, modals)
- `--radius-full`: 9999px (pills, avatars)

### Shadow
- `--shadow-sm`: 0 1px 2px rgba(0,0,0,0.1)
- `--shadow-md`: 0 4px 12px rgba(0,0,0,0.15)
- `--shadow-lg`: 0 8px 24px rgba(0,0,0,0.2)
- `--shadow-glow`: 0 0 20px rgba(5,150,105,0.3)
