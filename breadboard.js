// =======================================================================
//  ブレッドボード（SRX-32PS）の SVG 再現  breadboard.js（試作）
//
//  写真は使わず、穴・電源レール・中央の溝・操作パネルをプログラムで描く。
//  穴の位置は自分で計算して描くので、当たり判定（どの穴か）は座標から正確に分かる。
//
//  【できること（試作の範囲）】
//    ・穴にマウスを乗せると、内部でつながっている穴（＋ジャンパ線でつながった先）が光る
//    ・穴を2つ順にクリックするとジャンパ線を張る。線を右クリックで外す
//    ・IC（DIP 14ピン）を中央の溝をまたぐ位置に置き、ピンにマウスを乗せるとピン名を表示
//    ・操作パネルの SW1・SW2 をクリックで ON/OFF
//
//  【使い方】
//    const board = createBreadboard(document.getElementById('board'));
//    board.getNets()  … 現在の導通（つながっている穴のグループ）を返す
// =======================================================================


// -----------------------------------------------------------------------
//  1. レイアウトの定義（ここを書き換えれば穴の数・並びを変えられる）
//     ※ 列数・電源レールの名前と並びは写真からの推定。実機に合わせて直すこと
// -----------------------------------------------------------------------

const BB_PITCH = 10;          // 穴の間隔（実機の 2.54mm を 10 単位で表す）
const BB_COLUMNS = 63;        // 1行あたりの穴の数
const BB_ROW_NAMES_TOP = ['A', 'B', 'C', 'D', 'E'];   // 溝より上の行
const BB_ROW_NAMES_BOTTOM = ['F', 'G', 'H', 'I', 'J']; // 溝より下の行

// 上から順に並べる部品。rail = 電源レール（2行）、block = 端子ブロック（A〜J）
const BB_LAYOUT = [
    { type: 'rail',  id: 'R1', rows: [{ name: '+15V', color: '#e6a100' }, { name: '+5V', color: '#e53935' }] },
    { type: 'block', id: 'B1' },
    { type: 'rail',  id: 'R2', rows: [{ name: 'GND', color: '#1e88e5' }, { name: '+5V', color: '#e53935' }] },
    { type: 'block', id: 'B2' },
    { type: 'rail',  id: 'R3', rows: [{ name: 'GND', color: '#1e88e5' }, { name: '−15V', color: '#1e88e5' }] },
];

// 電源レールの穴の並び: 5個ずつのグループを、1穴分の間をあけて10グループ（＝50穴）
const BB_RAIL_GROUPS = 10;
const BB_RAIL_GROUP_SIZE = 5;

// 描画の寸法（SVG の座標単位）
const BB_SIZE = {
    caseWidth: 780, caseHeight: 640,     // 緑のケース
    boardX: 40, boardY: 120,             // 白いボードの左上
    marginX: 34,                         // ボードの左端から1列目の穴まで
    railGap: 14,                         // レールとブロックの間
    trench: 20,                          // 中央の溝の幅
};


// -----------------------------------------------------------------------
//  2. IC のピン配置（データシートで要確認）
// -----------------------------------------------------------------------

const BB_IC_PINOUTS = {
    // デュアル JK フリップフロップ（立ち下がりで動作、クリア付き）
    '74HC107': ['1J', '1Q̅', '1Q', '1K', '2Q', '2Q̅', 'GND', '2J', '2CLR̅', '2CLK', '2K', '1CLK', '1CLR̅', 'VCC'],
    // NOT ×6
    '74HC04':  ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
    // AND ×4
    '74HC08':  ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    // OR ×4
    '74HC32':  ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
};


// -----------------------------------------------------------------------
//  3. 本体
// -----------------------------------------------------------------------

function createBreadboard(container) {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs = {}, parent) => {
        const e = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
        if (parent) parent.appendChild(e);
        return e;
    };

    // --- 状態 ---
    const holes = [];          // { id, x, y, strip, label }
    const holeById = {};
    const wires = [];          // { a, b, color, el }
    const ics = [];            // { type, column, el }
    const power = { SW1: false, SW2: false };
    let pendingHole = null;    // ジャンパ線の1本目として選んだ穴
    const WIRE_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#212121'];

    // --- SVG の土台 ---
    const svg = el('svg', { viewBox: `0 0 ${BB_SIZE.caseWidth} ${BB_SIZE.caseHeight}`, class: 'bb-svg' }, container);
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
        <linearGradient id="bb-case" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#2bb59a"/><stop offset="1" stop-color="#14876f"/>
        </linearGradient>
        <linearGradient id="bb-panel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ec2c7a"/><stop offset="1" stop-color="#c8135f"/>
        </linearGradient>`;
    const layerCase   = el('g', {}, svg);
    const layerBoard  = el('g', {}, svg);
    const layerHoles  = el('g', { class: 'bb-holes' }, svg);
    const layerIC     = el('g', {}, svg);
    const layerWires  = el('g', {}, svg);
    const layerTip    = el('g', { 'pointer-events': 'none' }, svg);

    // ===================================================================
    //  ケースと操作パネル
    // ===================================================================
    const caseRect = el('rect', { x: 4, y: 4, width: BB_SIZE.caseWidth - 8, height: BB_SIZE.caseHeight - 8, rx: 18,
                 fill: 'url(#bb-case)', stroke: '#0e6b58', 'stroke-width': 3 }, layerCase);

    // 上部の操作パネル（ピンク）
    const panel = el('g', { transform: 'translate(250, 18)' }, layerCase);
    el('rect', { x: 0, y: 0, width: 500, height: 86, rx: 6, fill: 'url(#bb-panel)' }, panel);

    // GND 端子（左の青い枠）
    el('rect', { x: 10, y: 10, width: 120, height: 66, rx: 4, fill: '#3949ab' }, panel);
    el('text', { x: 70, y: 24, 'text-anchor': 'middle', class: 'bb-panel-text' }, panel).textContent = 'GND端子';
    [[48, '#5d1a1a'], [96, '#222']].forEach(([cx, color]) => {
        el('circle', { cx, cy: 50, r: 13, fill: color, stroke: '#111', 'stroke-width': 2 }, panel);
        el('circle', { cx, cy: 50, r: 4, fill: '#999' }, panel);
    });

    // 型番と DC-DC コンバータの表示窓
    el('text', { x: 150, y: 30, class: 'bb-panel-text bb-panel-small' }, panel).textContent = 'MODEL';
    el('text', { x: 150, y: 52, class: 'bb-panel-text bb-panel-model' }, panel).textContent = 'SRX-32PS';
    el('rect', { x: 268, y: 12, width: 64, height: 46, rx: 3, fill: '#9aa5a0', stroke: '#555' }, panel);
    const lcd = el('text', { x: 300, y: 42, 'text-anchor': 'middle', class: 'bb-lcd' }, panel);
    el('text', { x: 300, y: 74, 'text-anchor': 'middle', class: 'bb-panel-text bb-panel-small' }, panel).textContent = 'DC-DCコンバータ';

    // POWER（右の青い枠）: SW1・SW2 はクリックで ON/OFF
    el('rect', { x: 350, y: 10, width: 140, height: 66, rx: 4, fill: '#3949ab' }, panel);
    el('text', { x: 420, y: 24, 'text-anchor': 'middle', class: 'bb-panel-text' }, panel).textContent = 'POWER';
    const switchEls = {};
    [['SW1', 385], ['SW2', 455]].forEach(([name, cx]) => {
        const g = el('g', { class: 'bb-switch', 'data-switch': name }, panel);
        el('rect', { x: cx - 10, y: 32, width: 20, height: 32, rx: 3, fill: '#222' }, g);
        switchEls[name] = el('rect', { x: cx - 7, y: 35, width: 14, height: 13, rx: 2, fill: '#ddd' }, g);
        el('text', { x: cx + 14, y: 40, class: 'bb-panel-text bb-panel-tiny' }, g).textContent = 'ON';
        el('text', { x: cx + 14, y: 62, class: 'bb-panel-text bb-panel-tiny' }, g).textContent = 'OFF';
        el('text', { x: cx, y: 75, 'text-anchor': 'middle', class: 'bb-panel-text bb-panel-tiny' }, g).textContent = name;
        g.addEventListener('click', () => { power[name] = !power[name]; renderPower(); });
    });
    function renderPower() {
        Object.entries(switchEls).forEach(([name, knob]) => knob.setAttribute('y', power[name] ? 35 : 48));
        lcd.textContent = (power.SW1 || power.SW2) ? (power.SW2 ? '15.0' : '5.00') : '';
    }
    renderPower();

    // ===================================================================
    //  白いボードと穴
    // ===================================================================
    const colX = c => BB_SIZE.boardX + BB_SIZE.marginX + c * BB_PITCH;

    // 縦方向の配置を上から積み上げて決める
    let y = BB_SIZE.boardY + 18;
    const placed = BB_LAYOUT.map(part => {
        const top = y;
        if (part.type === 'rail') y += BB_PITCH * 2 + BB_SIZE.railGap;
        else y += BB_PITCH * 9 + BB_SIZE.trench + BB_SIZE.railGap;
        return { ...part, top };
    });
    const boardHeight = y - BB_SIZE.boardY + 4;
    const boardWidth = BB_SIZE.marginX * 2 + (BB_COLUMNS - 1) * BB_PITCH;
    el('rect', { x: BB_SIZE.boardX, y: BB_SIZE.boardY, width: boardWidth, height: boardHeight, rx: 4,
                 fill: '#f4f3ee', stroke: '#c9c7bd' }, layerBoard);

    // ケースの高さを、ボードの下端に合わせて詰める
    const caseHeight = BB_SIZE.boardY + boardHeight + 36;
    svg.setAttribute('viewBox', `0 0 ${BB_SIZE.caseWidth} ${caseHeight}`);
    caseRect.setAttribute('height', caseHeight - 8);

    function addHole(id, x, y, strip, label) {
        const h = { id, x, y, strip, label };
        h.el = el('rect', { x: x - 2.4, y: y - 2.4, width: 4.8, height: 4.8, rx: 0.8, class: 'bb-hole', 'data-hole': id }, layerHoles);
        holes.push(h);
        holeById[id] = h;
    }

    placed.forEach(part => {
        if (part.type === 'rail') {
            // 電源レール: 1行がまるごと1本の導通（※実機で中央が分割されていないか要確認）
            part.rows.forEach((row, r) => {
                const ry = part.top + r * BB_PITCH;
                const strip = `${part.id}-${r}`;
                const lineY = r === 0 ? ry - 6 : ry + 6;
                el('line', { x1: colX(0), y1: lineY, x2: colX(BB_COLUMNS - 1), y2: lineY, stroke: row.color, 'stroke-width': 1.6 }, layerBoard);
                el('text', { x: colX(0) - 8, y: ry + 3, 'text-anchor': 'end', class: 'bb-rail-label', fill: row.color }, layerBoard).textContent = row.name;
                for (let g = 0; g < BB_RAIL_GROUPS; g++) {
                    for (let k = 0; k < BB_RAIL_GROUP_SIZE; k++) {
                        const c = 2 + g * (BB_RAIL_GROUP_SIZE + 1) + k;
                        addHole(`${strip}-${c}`, colX(c), ry, strip, `電源レール ${row.name}`);
                    }
                }
            });
        } else {
            // 端子ブロック: 同じ列の A〜E（溝より上）と F〜J（溝より下）がそれぞれ導通
            const rowY = (half, r) => part.top + (half === 0 ? r : r + 5) * BB_PITCH + (half === 0 ? 0 : BB_SIZE.trench - BB_PITCH);
            const trenchY = rowY(0, 4) + (rowY(1, 0) - rowY(0, 4)) / 2;
            el('rect', { x: BB_SIZE.boardX + 10, y: trenchY - 4, width: boardWidth - 20, height: 8, fill: '#dddbd2' }, layerBoard);
            [BB_ROW_NAMES_TOP, BB_ROW_NAMES_BOTTOM].forEach((names, half) => {
                names.forEach((name, r) => {
                    const ry = rowY(half, r);
                    el('text', { x: colX(0) - 10, y: ry + 3, 'text-anchor': 'end', class: 'bb-row-label' }, layerBoard).textContent = name;
                    el('text', { x: colX(BB_COLUMNS - 1) + 10, y: ry + 3, class: 'bb-row-label' }, layerBoard).textContent = name;
                    for (let c = 0; c < BB_COLUMNS; c++) {
                        addHole(`${part.id}-${name}${c + 1}`, colX(c), ry, `${part.id}-${half}-${c}`, `${name}${c + 1}`);
                    }
                });
            });
            // 列番号（5列ごと）
            for (let c = 0; c < BB_COLUMNS; c++) {
                if ((c + 1) % 5 !== 0 && c !== 0) continue;
                el('text', { x: colX(c), y: rowY(0, 0) - 7, 'text-anchor': 'middle', class: 'bb-col-label' }, layerBoard).textContent = c + 1;
                el('text', { x: colX(c), y: rowY(1, 4) + 13, 'text-anchor': 'middle', class: 'bb-col-label' }, layerBoard).textContent = c + 1;
            }
            part.rowY = rowY;
        }
    });

    // ===================================================================
    //  導通の計算（内部のつながり＋ジャンパ線）… Union-Find
    // ===================================================================
    function computeNets() {
        const parent = {};
        const find = s => (parent[s] === undefined || parent[s] === s) ? (parent[s] = s) : (parent[s] = find(parent[s]));
        const union = (a, b) => { parent[find(a)] = find(b); };
        holes.forEach(h => find(h.strip));
        wires.forEach(w => union(holeById[w.a].strip, holeById[w.b].strip));
        const nets = {};
        holes.forEach(h => { const root = find(h.strip); (nets[root] = nets[root] || []).push(h.id); });
        return { find, nets };
    }

    // ===================================================================
    //  マウス操作: 穴の強調表示・ジャンパ線
    // ===================================================================
    let tip = null;
    function showTip(x, y, text) {
        hideTip();
        tip = el('g', {}, layerTip);
        const t = el('text', { x: x + 10, y: y - 10, class: 'bb-tip-text' }, tip);
        t.textContent = text;
        const box = t.getBBox();
        tip.insertBefore(el('rect', { x: box.x - 5, y: box.y - 3, width: box.width + 10, height: box.height + 6, rx: 3, class: 'bb-tip-box' }), t);
    }
    function hideTip() { if (tip) { tip.remove(); tip = null; } }

    function highlightNet(hole) {
        const { find } = computeNets();
        const root = find(hole.strip);
        holes.forEach(h => h.el.classList.toggle('bb-hole-net', find(h.strip) === root));
    }
    function clearHighlight() {
        holes.forEach(h => h.el.classList.remove('bb-hole-net'));
    }

    layerHoles.addEventListener('mouseover', e => {
        const hole = holeById[e.target.dataset.hole];
        if (!hole) return;
        highlightNet(hole);
        showTip(hole.x, hole.y, hole.label);
    });
    layerHoles.addEventListener('mouseout', () => { clearHighlight(); hideTip(); });

    layerHoles.addEventListener('click', e => {
        const hole = holeById[e.target.dataset.hole];
        if (hole) clickHole(hole);
    });

    // 穴のクリック: 1つ目を選び、2つ目でジャンパ線を張る（同じ穴をもう一度押すと取り消し）
    function clickHole(hole) {
        if (!pendingHole) {
            pendingHole = hole;
            hole.el.classList.add('bb-hole-pending');
            return;
        }
        pendingHole.el.classList.remove('bb-hole-pending');
        if (pendingHole !== hole) addWire(pendingHole.id, hole.id);
        pendingHole = null;
        highlightNet(hole);
    }

    function addWire(a, b, color) {
        const ha = holeById[a], hb = holeById[b];
        color = color || WIRE_COLORS[wires.length % WIRE_COLORS.length];
        const g = el('g', { class: 'bb-wire' }, layerWires);
        // 実物のジャンパ線のように、少し持ち上がった曲線で描く
        const lift = Math.min(40, Math.hypot(hb.x - ha.x, hb.y - ha.y) * 0.25);
        const d = `M ${ha.x} ${ha.y} C ${ha.x} ${ha.y - lift}, ${hb.x} ${hb.y - lift}, ${hb.x} ${hb.y}`;
        el('path', { d, fill: 'none', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 5, 'stroke-linecap': 'round', transform: 'translate(1.5,1.5)' }, g);
        el('path', { d, fill: 'none', stroke: color, 'stroke-width': 3.6, 'stroke-linecap': 'round' }, g);
        [ha, hb].forEach(h => el('circle', { cx: h.x, cy: h.y, r: 2.6, fill: '#bbb', stroke: '#666', 'stroke-width': 0.6 }, g));
        const wire = { a, b, color, el: g };
        g.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            g.remove();
            wires.splice(wires.indexOf(wire), 1);
        });
        wires.push(wire);
        return wire;
    }

    // ===================================================================
    //  IC（DIP 14ピン）: 中央の溝をまたいで置く。切り欠きが左、1番ピンは左下
    // ===================================================================
    function placeIC(type, blockId, column) {
        const pinout = BB_IC_PINOUTS[type];
        const block = placed.find(p => p.id === blockId);
        const n = pinout.length / 2;
        const yTop = block.rowY(0, 4), yBottom = block.rowY(1, 0);
        const x0 = colX(column - 1), x1 = colX(column - 1 + n - 1);
        const g = el('g', { class: 'bb-ic' }, layerIC);

        // 本体と切り欠き・型番
        el('rect', { x: x0 - 6, y: yTop + 2, width: x1 - x0 + 12, height: yBottom - yTop - 4, rx: 2, fill: '#2b2b2b', stroke: '#111' }, g);
        el('path', { d: `M ${x0 - 6} ${(yTop + yBottom) / 2 - 4} a 4 4 0 0 1 0 8`, fill: '#555' }, g);
        el('text', { x: (x0 + x1) / 2, y: (yTop + yBottom) / 2 + 3, 'text-anchor': 'middle', class: 'bb-ic-label' }, g).textContent = type;

        // ピン: 1〜n は下の行を左→右、n+1〜2n は上の行を右→左
        pinout.forEach((name, i) => {
            const onBottom = i < n;
            const c = onBottom ? column + i : column + (2 * n - 1 - i);
            const holeId = `${blockId}-${onBottom ? BB_ROW_NAMES_BOTTOM[0] : BB_ROW_NAMES_TOP[4]}${c}`;
            const h = holeById[holeId];
            const pin = el('rect', { x: h.x - 2.2, y: onBottom ? h.y - 4 : h.y - 1, width: 4.4, height: 5, fill: '#c9c9c9', class: 'bb-ic-pin' }, g);
            pin.addEventListener('mouseover', () => { highlightNet(h); showTip(h.x, h.y, `${type}  ${i + 1}番ピン: ${name}（${h.label}）`); });
            pin.addEventListener('mouseout', () => { clearHighlight(); hideTip(); });
            pin.addEventListener('click', () => clickHole(h));   // ピンのクリック = その穴のクリック
        });
        ics.push({ type, blockId, column, el: g });
    }

    return {
        holes, wires, ics, power,
        addWire, placeIC,
        getNets: () => Object.values(computeNets().nets),
    };
}
