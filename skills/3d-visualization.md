# 3D 可视化 Skill

## 3D Knowledge Graph Visualization

### Performance Targets
- <500 nodes: full render + bloom
- 500-1000 nodes: render with reduced bloom, cooldownTicks=200
- >1000 nodes: show notice, paginate, no bloom

### Force Layout
- d3-force-3d with center force
- cooldownTicks: min(nodeCount * 1.5, 300)
- d3Force("charge").strength(-80)
- d3Force("link").distance(60)

### Node Styling
- Topic: emerald glow (#34d399), size 6
- Concept: blue glow (#60a5fa), size 4
- Method: purple glow (#a78bfa), size 4  
- Tool: amber glow (#fbbf24), size 3.5
- Task: red glow (#f87171), size 3.5

### Bloom Post-Processing
- Primary method: UnrealBloomPass
- Fallback: increased node opacity + size without post-processing
- Detected via renderer.userData._bloomAvailable flag

### Camera Controls
- OrbitControls with damping
- Zoom range: 50-800
- Double-click node → focus camera
- Reset view button

### Color Modes
1. **By Type**: topic/concept/method/tool/task colors
2. **By Community**: 10-color palette
3. **By Grade**: core(green)/normal(blue)/weak(grey)
