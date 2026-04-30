/**
 * tree-renderer.js — Realistic SVG habit tree.
 * Modules: Sky/Ground, Trunk (tapered + bark), Branches (tapered path),
 *          Leaves (shaped: teardrop/bud/fallen), Grass blades, Roots.
 * Exports: TreeRenderer.render(treeState, svgEl, callbacks)
 */
const TreeRenderer = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  // ── SVG element helpers ──────────────────────────────────────────────────
  function el(tag, attrs = {}) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }
  function svgText(content, attrs = {}) {
    const n = document.createElementNS(NS, 'text');
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.textContent = content;
    return n;
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Deterministic pseudo-random — stable across re-renders (no Math.random)
  function rng(seed) {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  }

  // ── Colour helpers ────────────────────────────────────────────────────────
  function branchFill(h)      { return h > 0.7 ? '#4a7c3f' : h >= 0.4 ? '#8a6e2a' : '#7a3a2a'; }
  function branchHighlight(h) { return h > 0.7 ? '#6db860' : h >= 0.4 ? '#c4a842' : '#c45a42'; }

  // ── Module: SVG <defs> (gradients) ──────────────────────────────────────
  function _buildDefs(svgEl) {
    const defs = el('defs');
    function grad(id, isRadial, stops, attrs = {}) {
      const g = el(isRadial ? 'radialGradient' : 'linearGradient', { id, ...attrs });
      stops.forEach(([offset, color]) => {
        const s = el('stop');
        s.setAttribute('offset', offset);
        s.setAttribute('stop-color', color);
        g.appendChild(s);
      });
      defs.appendChild(g);
    }
    // Sky (top-to-bottom)
    grad('htSky', false, [['0%','#060f1e'],['55%','#0b1c36'],['100%','#102340']], { x1:'0%',y1:'0%',x2:'0%',y2:'100%' });
    // Trunk (left-to-right, simulates cylinder)
    grad('htTrunk', false, [['0%','#1a0800'],['22%','#5c2508'],['52%','#9e4a18'],['78%','#6b3010'],['100%','#1e0900']], { x1:'0%',y1:'0%',x2:'100%',y2:'0%' });
    // Ground surface
    grad('htGround', false, [['0%','#2a5a0e'],['45%','#1a380a'],['100%','#0d1f04']], { x1:'0%',y1:'0%',x2:'0%',y2:'100%' });
    svgEl.appendChild(defs);
  }

  // ── Module: Sky + Ground + Grass ──────────────────────────────────────────
  function _drawWorld(svgEl, W, H, groundY) {
    // Sky background
    svgEl.appendChild(el('rect', { x:0, y:0, width:W, height:H, fill:'url(#htSky)' }));

    // Stars (deterministic)
    for (let i = 0; i < 35; i++) {
      svgEl.appendChild(el('circle', {
        cx: rng(i*13)*W, cy: rng(i*17)*(groundY*0.75),
        r: 0.6 + rng(i*23)*1.1,
        fill: 'white', opacity: 0.35 + rng(i*7)*0.45,
      }));
    }

    // Earth fill
    svgEl.appendChild(el('rect', { x:0, y:groundY, width:W, height:H-groundY, fill:'url(#htGround)' }));

    // Wavy grass surface
    const g1 = groundY, w = W;
    const waveD = `M 0,${g1+3} C ${w*.12},${g1-7} ${w*.28},${g1+5} ${w*.45},${g1-2}
      C ${w*.6},${g1-9} ${w*.76},${g1+6} ${w*.9},${g1-1} C ${w*.96},${g1-4} ${w},${g1+2} ${w},${g1}
      L ${w},${g1} L 0,${g1} Z`;
    svgEl.appendChild(el('path', { d:waveD, fill:'#4a9a1e', opacity:0.9 }));

    // Grass blades
    for (let i = 0; i < 36; i++) {
      const x    = (W / 36) * i + rng(i*3) * (W / 36 * 0.7);
      const h    = 6 + rng(i*7) * 12;
      const lean = (rng(i*11) - 0.5) * 18;
      const cols = ['#3db31a','#52c82d','#2a9f0f','#60d030'];
      svgEl.appendChild(el('path', {
        d: `M ${x},${groundY} Q ${x+lean*.5},${groundY-h*.5} ${x+lean},${groundY-h}`,
        stroke: cols[i % 4], 'stroke-width': 1.4 + rng(i*5)*.6,
        fill: 'none', 'stroke-linecap': 'round',
      }));
    }
  }

  // ── Module: Trunk (tapered bezier + bark texture + roots) ───────────────
  function _drawTrunk(svgEl, W, topY, groundY, stemW) {
    const cx = W / 2;
    const bw = stemW;
    const tw = Math.max(stemW * 0.52, 3);
    const H  = groundY - topY;

    // Tapered trunk path (slightly curved bezier sides)
    const d = `M ${cx-bw/2},${groundY}
      C ${cx-bw/2},${groundY-H*.35} ${cx-tw/2},${topY+H*.28} ${cx-tw/2},${topY}
      L ${cx+tw/2},${topY}
      C ${cx+tw/2},${topY+H*.28} ${cx+bw/2},${groundY-H*.35} ${cx+bw/2},${groundY} Z`;
    svgEl.appendChild(el('path', { d, fill:'url(#htTrunk)', class:'trunk-body' }));

    // Bark knot lines
    const knots = Math.max(2, Math.floor(H / 30));
    for (let i = 1; i <= knots; i++) {
      const y = topY + (H * i) / (knots + 1);
      const prog = i / (knots + 1);
      const hw = (tw/2 + (bw/2 - tw/2) * prog) * 0.68;
      svgEl.appendChild(el('path', {
        d: `M ${cx-hw},${y} Q ${cx},${y+3} ${cx+hw},${y}`,
        fill:'none', stroke:'rgba(0,0,0,0.28)', 'stroke-width':0.9, 'stroke-linecap':'round',
      }));
    }

    // Highlight streak
    const hl = tw * 0.18;
    svgEl.appendChild(el('path', {
      d: `M ${cx+hl},${topY} C ${cx+hl},${topY+H*.4} ${cx+bw*.18},${groundY-H*.3} ${cx+bw*.18},${groundY}`,
      fill:'none', stroke:'rgba(255,255,255,0.11)', 'stroke-width':stemW*.14, 'stroke-linecap':'round',
    }));

    // Surface roots
    [[-1,1.0],[-1,1.7],[1,0.95],[1,1.65]].forEach(([dir, dist]) => {
      svgEl.appendChild(el('path', {
        d: `M ${cx+dir*bw*.38},${groundY} Q ${cx+dir*bw*dist*.7},${groundY+2} ${cx+dir*bw*dist},${groundY+5}`,
        fill:'none', stroke:'#4a2000', 'stroke-width':Math.max(bw*.12,1), 'stroke-linecap':'round',
      }));
    });
  }

  // ── Module: Branch (tapered trapezoid path) ───────────────────────────────
  function _drawBranchShape(g, ox, oy, tx, ty, baseW, tipW, fill, hlColor) {
    const dx = tx-ox, dy = ty-oy;
    const len = Math.sqrt(dx*dx+dy*dy) || 1;
    const nx = -dy/len, ny = dx/len;   // left-hand normal
    const p1 = [ox+nx*baseW/2, oy+ny*baseW/2];
    const p2 = [ox-nx*baseW/2, oy-ny*baseW/2];
    const p3 = [tx-nx*tipW/2,  ty-ny*tipW/2];
    const p4 = [tx+nx*tipW/2,  ty+ny*tipW/2];
    g.appendChild(el('path', {
      d: `M ${p1[0]},${p1[1]} L ${p4[0]},${p4[1]} L ${p3[0]},${p3[1]} L ${p2[0]},${p2[1]} Z`,
      fill,
    }));
    // Shadow edge along bottom side for depth
    g.appendChild(el('line', {
      x1: p2[0], y1: p2[1], x2: p3[0], y2: p3[1],
      stroke: 'rgba(0,0,0,0.28)', 'stroke-width': Math.max(baseW * 0.22, 1.2), 'stroke-linecap': 'round',
    }));
    // Highlight along centre
    g.appendChild(el('line', {
      x1:(p1[0]+p2[0])/2, y1:(p1[1]+p2[1])/2,
      x2:(p3[0]+p4[0])/2, y2:(p3[1]+p4[1])/2,
      stroke:hlColor, 'stroke-width':Math.max(tipW*.55,.8), 'stroke-linecap':'round', opacity:.48,
    }));
    // Bright top-edge highlight (simulates rounded bark surface catching light)
    g.appendChild(el('line', {
      x1: p1[0], y1: p1[1], x2: p4[0], y2: p4[1],
      stroke: 'rgba(255,255,255,0.12)', 'stroke-width': Math.max(baseW * 0.15, 0.8), 'stroke-linecap': 'round',
    }));
    // Bark texture — short perpendicular nicks along the branch
    if (baseW >= 5) {
      [0.28, 0.58, 0.82].forEach(t => {
        const mx = (p1[0]+p2[0])/2 + ((p3[0]+p4[0])/2 - (p1[0]+p2[0])/2) * t;
        const my = (p1[1]+p2[1])/2 + ((p3[1]+p4[1])/2 - (p1[1]+p2[1])/2) * t;
        const hw = (baseW*(1-t) + tipW*t) * 0.28;
        g.appendChild(el('line', {
          x1: mx + nx*hw, y1: my + ny*hw,
          x2: mx - nx*hw, y2: my - ny*hw,
          stroke: 'rgba(0,0,0,0.20)', 'stroke-width': 0.9, 'stroke-linecap': 'round',
        }));
      });
    }
  }

  // ── Module: Single leaf ───────────────────────────────────────────────────
  // posG  = SVG attribute transform (position, never touched by CSS)
  // animG = CSS animation target
  function _drawLeaf(parentG, cx, cy, rotation, status, taskId, branchId, delayS, callbacks) {
    const posG = el('g', {
      'data-id': taskId,
      transform: `translate(${cx},${cy}) rotate(${rotation})`,
      cursor: 'pointer',
    });

    const animG = el('g', { class: `leaf-node leaf-${status}` });
    animG.style.animationDelay = `${delayS}s`;

    if (status === 'completed') {
      // Oval leaf body — pointed tip at top, rounded base
      animG.appendChild(el('path', {
        d: 'M 0,-13 C 9,-9 11,-1 9,7 Q 4,14 0,15 Q -4,14 -9,7 C -11,-1 -9,-9 0,-13 Z',
        fill: '#3cb371', stroke: '#1e7a40', 'stroke-width': 1.4,
      }));
      // Yellow-green center highlight — simulates cupped leaf surface
      animG.appendChild(el('path', {
        d: 'M 0,-8 C 4,-5 5,1 4,6 Q 2,10 0,10 Q -2,10 -4,6 C -5,1 -4,-5 0,-8 Z',
        fill: '#8dc63f', opacity: 0.50,
      }));
      // Midrib (center vein)
      animG.appendChild(el('path', {
        d: 'M 0,-11 Q 0.8,1 0,13',
        fill: 'none', stroke: 'rgba(255,255,255,0.58)', 'stroke-width': 1.15, 'stroke-linecap': 'round',
      }));
      // Lateral veins — right
      animG.appendChild(el('path', {
        d: 'M 0,-6 Q 6,-3 8,0 M 0,2 Q 6,5 8,8 M 0,8 Q 5,10 7,12',
        fill: 'none', stroke: 'rgba(255,255,255,0.24)', 'stroke-width': 0.7, 'stroke-linecap': 'round',
      }));
      // Lateral veins — left (mirrored)
      animG.appendChild(el('path', {
        d: 'M 0,-6 Q -6,-3 -8,0 M 0,2 Q -6,5 -8,8 M 0,8 Q -5,10 -7,12',
        fill: 'none', stroke: 'rgba(255,255,255,0.24)', 'stroke-width': 0.7, 'stroke-linecap': 'round',
      }));

    } else if (status === 'pending') {
      // Smaller young leaf — same oval form, lighter color
      animG.appendChild(el('path', {
        d: 'M 0,-9 C 6,-6 8,-1 7,4 Q 3,10 0,10 Q -3,10 -7,4 C -8,-1 -6,-6 0,-9 Z',
        fill: '#c4f0a8', stroke: '#6abe6a', 'stroke-width': 1.2,
      }));
      // Inner highlight
      animG.appendChild(el('path', {
        d: 'M 0,-5 C 3,-3 4,1 3,5 Q 1,7 0,7 Q -1,7 -3,5 C -4,1 -3,-3 0,-5 Z',
        fill: '#e8ffd0', opacity: 0.58,
      }));
      // Midrib
      animG.appendChild(el('path', {
        d: 'M 0,-8 Q 0.5,0 0,9',
        fill: 'none', stroke: 'rgba(255,255,255,0.48)', 'stroke-width': 0.9, 'stroke-linecap': 'round',
      }));
      // Side veins — right
      animG.appendChild(el('path', {
        d: 'M 0,-3 Q 4,-1 6,1 M 0,3 Q 4,5 5,7',
        fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 0.65, 'stroke-linecap': 'round',
      }));
      // Side veins — left
      animG.appendChild(el('path', {
        d: 'M 0,-3 Q -4,-1 -6,1 M 0,3 Q -4,5 -5,7',
        fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 0.65, 'stroke-linecap': 'round',
      }));

    } else {
      // Missed — wilted, slightly drooping oval, brown
      animG.appendChild(el('path', {
        d: 'M 0,-10 C 10,-6 12,3 9,9 Q 4,14 0,13 Q -4,12 -7,6 C -9,0 -7,-6 0,-10 Z',
        fill: '#8b6914', stroke: '#5a4008', 'stroke-width': 1.2, opacity: 0.85,
      }));
      // Midrib
      animG.appendChild(el('path', {
        d: 'M 0,-8 Q 1,2 0,11',
        fill: 'none', stroke: 'rgba(0,0,0,0.32)', 'stroke-width': 0.85, 'stroke-linecap': 'round',
      }));
      // Veins — right
      animG.appendChild(el('path', {
        d: 'M 0,-3 Q 5,0 7,3 M 0,4 Q 4,7 6,10',
        fill: 'none', stroke: 'rgba(0,0,0,0.20)', 'stroke-width': 0.6, 'stroke-linecap': 'round',
      }));
      // Veins — left
      animG.appendChild(el('path', {
        d: 'M 0,-3 Q -4,0 -5,3 M 0,4 Q -3,7 -4,9',
        fill: 'none', stroke: 'rgba(0,0,0,0.20)', 'stroke-width': 0.6, 'stroke-linecap': 'round',
      }));
    }

    posG.appendChild(animG);
    posG.addEventListener('click', (e) => {
      e.stopPropagation();
      if (callbacks.onTaskClick) callbacks.onTaskClick(taskId, branchId);
    });
    parentG.appendChild(posG);
    return posG;
  }

  // ── Module: Leaf canopy — scatter leaves across the entire crown zone ───────
  // Leaves are placed from 45% of branch length outward (not just at tip),
  // over a 160° fan. rng() gives natural, deterministic variation per branch.
  function _drawLeafCluster(parentG, tasks, ox, oy, tipX, tipY, branchAngleRad, branchLen, branchId, callbacks) {
    const MAX  = 20;
    const shown = tasks.slice(0, MAX);
    const overflow = tasks.length - MAX;
    if (shown.length === 0) return;

    // Render completed last (on top)
    const order = { missed:0, pending:1, completed:2 };
    const sorted = [...shown].sort((a,b) => (order[a.status]??1)-(order[b.status]??1));

    // Branch direction unit vector
    const dx = tipX - ox, dy = tipY - oy;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx/len, uy = dy/len;

    // Fan: 160° spread centred on branch direction
    const halfFan = (80 * Math.PI) / 180;

    sorted.forEach((task, i) => {
      // Deterministic position using rng with branch+task seed
      const seed = branchId * 97 + i * 31;

      // Along-branch position: scatter from 48% to 115% of branch length
      const along = (0.48 + rng(seed) * 0.67) * branchLen;

      // Fan angle: random within ±80° of branch direction
      const fanOffset = (rng(seed + 7) - 0.5) * 2 * halfFan;
      const leafAngle = branchAngleRad + fanOffset;

      // Attachment point on the main branch
      const baseX = ox + ux * along;
      const baseY = oy + uy * along;
      // Twig length + perpendicular jitter for natural spread
      const twigLen = 8 + rng(seed + 3) * 14;
      const radial  = (rng(seed + 13) - 0.5) * 16;
      const px = baseX + Math.cos(leafAngle) * twigLen + (-uy) * radial;
      const py = baseY + Math.sin(leafAngle) * twigLen + (ux) * radial;

      // ── Tiny twig from main branch to leaf ──────────────────────────────
      parentG.appendChild(el('line', {
        x1: baseX, y1: baseY, x2: px, y2: py,
        stroke: '#6b4e1e', 'stroke-width': 0.9,
        'stroke-linecap': 'round', style: 'pointer-events:none',
      }));

      // Rotation: points outward from canopy centre, with random tilt
      const rot = (leafAngle * 180 / Math.PI)
                + (rng(seed + 19) - 0.5) * 50
                + (task.status === 'missed' ? 80 : 0);

      _drawLeaf(parentG, px, py, rot, task.status, task.id, branchId, 0.2 + i * 0.04, callbacks);
    });

    if (overflow > 0) {
      parentG.appendChild(svgText(`+${overflow}`, {
        x: tipX + Math.cos(branchAngleRad) * 18,
        y: tipY + Math.sin(branchAngleRad) * 18,
        'text-anchor':'middle',
        fill:'#a8d890', 'font-size':10, style:'pointer-events:none',
      }));
    }
  }

  // ── Main render entry ─────────────────────────────────────────────────────
  function render(treeState, svgEl, callbacks = {}) {
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    const W = svgEl.clientWidth  || svgEl.parentElement?.clientWidth  || 700;
    const H = svgEl.clientHeight || svgEl.parentElement?.clientHeight || 600;
    svgEl.setAttribute('width',  W);
    svgEl.setAttribute('height', H);
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const stats      = treeState.stats      || {};
    const categories = treeState.categories || [];
    const groundY    = H - 70;

    // Collect branches FIRST — count drives stem proportions
    const allBranches = [];
    for (const cat of categories) {
      for (const br of (cat.branches || [])) {
        allBranches.push({ ...br, _icon: cat.icon || '🌿' });
      }
    }
    const branchCount = allBranches.length;

    const stemStrength = stats.stem_strength || 0;
    // Each branch beyond 3 thickens and grows the stem
    const extraGirth  = branchCount > 3 ? (branchCount - 3) * 4  : 0;
    const extraHeight = branchCount > 3 ? (branchCount - 3) * 22 : 0;
    const stemW   = clamp(stemStrength / 5 + extraGirth,          10, 60);
    const stemH   = clamp(65 + stemStrength * 2.2 + extraHeight,  80, 360);
    const stemTopY = groundY - stemH;

    // Static sky + ground stay fixed (not in viewport)
    _buildDefs(svgEl);
    _drawWorld(svgEl, W, H, groundY);

    // Viewport group
    const vp = el('g', { id: 'ht-viewport' });
    svgEl.appendChild(vp);

    _drawTrunk(vp, W, stemTopY, groundY, stemW);

    // Stage label
    const stageMap = {
      seed:'🌰 Seed', seedling:'🌱 Seedling', sapling:'🪴 Sapling',
      young_tree:'🌿 Young Tree', mature_tree:'🌳 Mature Tree',
    };
    vp.appendChild(svgText(stageMap[stats.tree_stage] || '🌰 Seed', {
      x: W/2, y: groundY + 50,
      'text-anchor':'middle', fill:'#7ab84a', 'font-size':13, 'font-weight':'600',
      style:'pointer-events:none',
    }));

    if (branchCount === 0) return;

    const spreadDeg  = 160;
    const startAngle = -90 - spreadDeg / 2;
    const step       = branchCount > 1 ? spreadDeg / (branchCount - 1) : 0;

    allBranches.forEach((branch, i) => {
      const angleDeg = branchCount > 1 ? startAngle + i * step : -90;
      const angleRad = (angleDeg * Math.PI) / 180;

      const health    = parseFloat(branch.health_score) || 0;
      const streak    = branch.streak || 0;
      // Extend branch when there are many tasks (>5) so the canopy has room
      const taskCount = (branch.tasks || []).length;
      const extraLen  = taskCount > 5 ? (taskCount - 5) * 9 : 0;
      const branchLen = clamp(streak * 9 + 55 + extraLen, 55, 280);
      const baseW     = clamp(health * 9 + 3, 4, 16);
      const tipW      = Math.max(1.5, baseW * 0.3);

      // ── Vertical attachment: branches spread along the trunk ────────────
      // How far from vertical this branch points (0 = straight up, 1 = sideways)
      const deviationNorm = Math.abs(angleDeg + 90) / (spreadDeg / 2);  // 0..1
      // Small deterministic jitter so siblings aren't at identical heights
      const jitter = (rng(branch.id * 17 + 3) - 0.5) * stemH * 0.07;
      const attachY = stemTopY + deviationNorm * stemH * 0.62 + jitter;

      const ox = W / 2;
      const oy = clamp(attachY, stemTopY, stemTopY + stemH * 0.72);
      const tx = ox + Math.cos(angleRad) * branchLen;
      const ty = oy + Math.sin(angleRad) * branchLen;

      const g = el('g', { class:'branch-node', 'data-id':branch.id, cursor:'pointer' });
      g.style.animationDelay = `${0.05 + i * 0.08}s`;

      _drawBranchShape(g, ox, oy, tx, ty, baseW, tipW, branchFill(health), branchHighlight(health));

      // Tip cap — small knob so leaves visually connect to branch end
      g.appendChild(el('circle', {
        cx: tx, cy: ty,
        r: Math.max(tipW * 1.4, 2.5),
        fill: branchFill(health), stroke: branchHighlight(health), 'stroke-width': 0.7,
      }));

      // Category emoji at ~42% along branch
      const ex = ox + Math.cos(angleRad) * branchLen * 0.42;
      const ey = oy + Math.sin(angleRad) * branchLen * 0.42;
      g.appendChild(svgText(branch._icon, {
        x:ex, y:ey, 'text-anchor':'middle', 'dominant-baseline':'middle',
        'font-size':13, style:'pointer-events:none; user-select:none',
      }));

      // Leaf crown — scatter across the full canopy zone
      _drawLeafCluster(g, branch.tasks || [], ox, oy, tx, ty, angleRad, branchLen, branch.id, callbacks);

      // Branch name — beyond the canopy
      const nameOff = clamp(20 + (branch.tasks || []).length * 2, 22, 50);
      const nameX  = tx + Math.cos(angleRad) * nameOff;
      const nameY  = ty + Math.sin(angleRad) * nameOff;
      const anchor = Math.abs(Math.cos(angleRad)) < 0.25 ? 'middle'
                   : Math.cos(angleRad) >= 0             ? 'start' : 'end';
      g.appendChild(svgText(branch.name || '', {
        x: nameX, y: nameY,
        'text-anchor': anchor, fill:'#dde8cc', 'font-size':11, 'font-weight':'600',
        style:'pointer-events:none',
      }));

      g.addEventListener('click', (e) => {
        if (!e.target.closest('.leaf-node') && callbacks.onBranchClick) {
          callbacks.onBranchClick(branch.id);
        }
      });
      vp.appendChild(g);
    });
  }

  return { render };
})();
