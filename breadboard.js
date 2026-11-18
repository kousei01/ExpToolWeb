// =======================================================================
//  ブレッドボード（SRX-32PS）の SVG 再現  breadboard.js（試作）
//
//  写真は使わず、穴・電源レール・中央の溝・操作パネルをプログラムで描く。
//  穴の位置は自分で計算して描くので、当たり判定（どの穴か）は座標から正確に分かる。
//  ※ logic-sim.js を先に読み込むこと（回路の動きの計算に使う）
//
//  【できること（試作の範囲）】
//    ・穴にマウスを乗せると、内部でつながっている穴（＋ジャンパ線でつながった先）が光り、
//      そのネットの状態（H / L / 変化している / 浮いている など）を表示する
//    ・穴を2つ順にクリックするとジャンパ線を張る。線を右クリックで外す
//    ・部品箱から IC をドラッグして、中央の溝をまたぐ位置に挿す
//        - 挿せない位置（溝をまたいでいない・ボードからはみ出す・他の IC とぶつかる）は赤で示し、置けない
//        - 挿した IC はドラッグで挿し直し、ダブルクリックで向き（切り欠き）を反転、右クリックで抜く
//        - ピンにマウスを乗せるとピン名を表示
//    ・実物と同じく、1つの穴に挿せるのは1本（IC のピン・ジャンパ線・外部機器の線）だけ。
//      IC のピンにつなぐときは、同じ列の別の穴（A〜D / G〜J）に線を挿す
//    ・操作パネルの SW1（+5V）・SW2（±15V）をクリックで ON/OFF
//    ・電気的なつながり（13章）
//        - 電源レールから IC へ給電（VCC を +5V、GND を GND につないだ IC だけが動く）
//        - IC の論理動作（NOT / AND / OR / JK フリップフロップ）と伝搬遅延（ns 単位）
//        - 外部機器（WaveGen・ロジックアナライザのプローブなど）の線を穴に挿して、信号を入れる・観測する
//        - 配線ミスの検出: 電源のショート、出力どうしのぶつかり、浮いた入力、電源の逆接続、
//          ±15V を IC につないだ（IC が壊れる）、外部機器の GND がつながっていない、入力電圧が範囲外
//
//  【使い方】
//    const board = createBreadboard(document.getElementById('board'), {
//        terminals: [ { id: 'WG', label: 'WaveGen 出力', short: 'Gen', role: 'source', color: '#fdd835' },
//                     { id: 'WG-GND', label: 'WaveGen GND', short: 'GND', role: 'ground' },
//                     { id: 'D0', label: 'ロジアナ D0', short: 'D0', role: 'probe' }, ... ] });
//    （options.leadTray: false で外部機器の線の一覧を出さない。options.onHoleClick(穴の id) が true を返すと、
//      その穴のクリックは本体側の操作として扱い、ブレッドボードでは何もしない）
//    board.setSignal('WG', { kind: 'square', freqHz: 1000, vpp: 5, offsetV: 2.5, duty: 20, enabled: true });
//    const result = board.simulate(20e6);      // 電源投入から 20 ms 分を計算（単位 ns）
//    result.trace('D0')                         // → [{ t: ns, v: 0 | 1 | 'X' | 'Z' }, ...]
//    board.getStatus()   … 配線ミスなどの一覧 [{ level: 'error' | 'warn' | 'info', text }]
//    board.onChange(fn)  … 配線・電源・設定が変わるたびに fn を呼ぶ
//    board.getNetlist()  … 回路のつながり（どの IC のどのピンが、どの線でつながっているか）を返す
//    board.getNets()     … 現在の導通（つながっている穴のグループ）を返す
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
//  2. 使う素子（実験テキスト §2-I-7・§2-I-8「実験で使用する機材」の IC 各種）
//     ピン配置はデータシートで要確認
// -----------------------------------------------------------------------

// 部品箱に並べる IC。part は実験テキストの型番（IC の表面にもこの名前を印字する）
const BB_PARTS = [
    { type: '74HC04',  part: 'TC74HC04AP',  description: 'NOT ×6' },
    { type: '74HC08',  part: 'TC74HC08AP',  description: 'AND ×4' },
    { type: '74HC32',  part: 'TC74HC32AP',  description: 'OR ×4' },
    { type: '74HC107', part: 'TC74HC107AP', description: 'JK-FF ×2（クリア付き）' },
];

// ピン名（1番ピンから順に）。名前の後ろの ̅ は負論理（L で有効）を表す

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

// IC の中身（ピン名で指定）と伝搬遅延。遅延は Vcc=5V・負荷が軽いとき（ロジアナのプローブ程度）の目安（ns）。
// 教科書 2-I-7 の図9（1段あたり約 9.3ns）に合わせている。データシートで要確認
const BB_GATE_UNITS = (fn, n, inputs) => Array.from({ length: n }, (_, i) =>
    ({ kind: fn, in: inputs.map(x => `${i + 1}${x}`), out: `${i + 1}Y` }));
const BB_IC_MODELS = {
    '74HC04':  { units: BB_GATE_UNITS('NOT', 6, ['A']),      delayNs: 6 },
    '74HC08':  { units: BB_GATE_UNITS('AND', 4, ['A', 'B']), delayNs: 7 },
    '74HC32':  { units: BB_GATE_UNITS('OR',  4, ['A', 'B']), delayNs: 7 },
    '74HC107': {
        units: [1, 2].map(n => ({ kind: 'JK', j: `${n}J`, k: `${n}K`, clk: `${n}CLK`, clr: `${n}CLR̅`, q: `${n}Q`, qn: `${n}Q̅` })),
        clkToQNs: 10,    // CLK の立ち下がり → Q
        clrToQNs: 10,    // CLR̅ → Q
    },
};
// 個体差: 同じ型番でも遅延が少しずつ違う（±この割合）。遅延時間の測定で ①〜④ が同じ値にならないように
const BB_DELAY_SPREAD = 0.08;

// 入力の電圧 → 論理値の判定（74HC シリーズ、Vcc = 5V のとき）
const BB_LOGIC_LEVELS = { vih: 3.5, vil: 1.5, minV: -0.5, maxV: 5.5 };


// -----------------------------------------------------------------------
//  2-2. 電源（操作パネルのスイッチと電源レールの対応）
//       ※ SW1 = +5V、SW2 = ±15V は推定。実機に合わせて直すこと
// -----------------------------------------------------------------------
const BB_RAIL_SUPPLY = {
    '+5V':  { switch: 'SW1', volts: 5 },
    'GND':  { switch: null,  volts: 0 },     // GND はスイッチに関係なく 0V
    '+15V': { switch: 'SW2', volts: 15 },
    '−15V': { switch: 'SW2', volts: -15 },
};


// -----------------------------------------------------------------------
//  3. 本体
// -----------------------------------------------------------------------

function createBreadboard(container, options = {}) {
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
    const ics = [];            // { id, type, part, blockId, column, flipped, el, powered, damaged, ... }（12章の placeIC を参照）
    const power = { SW1: false, SW2: false };
    const terminals = [];      // 外部機器の線 { id, label, short, role, color, holeId, signal, el }（14章）
    let pendingHole = null;    // ジャンパ線の1本目として選んだ穴
    let pendingTerminal = null;// 挿す先を選んでいる外部機器の線
    const changeListeners = [];
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
    const layerLeads  = el('g', {}, svg);
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
        g.addEventListener('click', () => setPower(name, !power[name]));
    });
    function renderPower() {
        Object.entries(switchEls).forEach(([name, knob]) => knob.setAttribute('y', power[name] ? 35 : 48));
        lcd.textContent = (power.SW1 || power.SW2) ? (power.SW2 ? '15.0' : '5.00') : '';
    }
    renderPower();

    // 電源スイッチの切り替え。+5V を入れた瞬間のフリップフロップの状態は決まっていない（実物どおりランダム）
    function setPower(name, on) {
        if (power[name] === on) return;
        power[name] = on;
        if (name === 'SW1' && on) ics.forEach(randomizeFlipFlops);
        renderPower();
        changed();
    }

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

    function addHole(id, x, y, strip, label, rail = null) {
        const h = { id, x, y, strip, label, rail };
        h.el = el('rect', { x: x - 2.4, y: y - 2.4, width: 4.8, height: 4.8, rx: 0.8, class: 'bb-hole', 'data-hole': id }, layerHoles);
        holes.push(h);
        holeById[id] = h;
        return h;
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
                        addHole(`${strip}-${c}`, colX(c), ry, strip, `電源レール ${row.name}`, row.name).dir = r === 0 ? -1 : 1;
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
                        addHole(`${part.id}-${name}${c + 1}`, colX(c), ry, `${part.id}-${half}-${c}`, `${name}${c + 1}`).dir = half === 0 ? -1 : 1;
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
    //   ・同じ名前の電源レール（例: 上下の +5V）は電源の中でつながっている
    //   ・外部機器の GND の線は、機器の中でつながっている（'EXT-GND' という仮のネット）
    // ===================================================================
    const EXT_GND = 'EXT-GND';
    function computeNets() {
        const parent = {};
        const find = s => (parent[s] === undefined || parent[s] === s) ? (parent[s] = s) : (parent[s] = find(parent[s]));
        const union = (a, b) => { parent[find(a)] = find(b); };
        holes.forEach(h => find(h.strip));
        find(EXT_GND);
        const firstRailStrip = {};
        holes.forEach(h => {
            if (!h.rail) return;
            if (firstRailStrip[h.rail]) union(h.strip, firstRailStrip[h.rail]);
            else firstRailStrip[h.rail] = h.strip;
        });
        wires.forEach(w => union(holeById[w.a].strip, holeById[w.b].strip));
        terminals.forEach(t => { if (t.holeId && t.role === 'ground') union(holeById[t.holeId].strip, EXT_GND); });
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
        if (drag) return;   // IC をドラッグしている間は出さない（影と重なって見づらいため）
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
        showTip(hole.x, hole.y, withState(hole.label, hole));
    });
    layerHoles.addEventListener('mouseout', () => { clearHighlight(); hideTip(); });

    layerHoles.addEventListener('click', e => {
        const hole = holeById[e.target.dataset.hole];
        if (hole) clickHole(hole);
    });

    // 穴にすでに何か挿さっているか（'ic' / 'wire' / 'lead' / null）
    function hasWireOrLead(hole) {
        return wires.some(w => w.a === hole.id || w.b === hole.id) || terminals.some(t => t.holeId === hole.id);
    }
    function occupantOf(hole) {
        if (wires.some(w => w.a === hole.id || w.b === hole.id)) return 'wire';
        if (terminals.some(t => t.holeId === hole.id)) return 'lead';
        if (ics.some(ic => icPinHoles(ic.type, ic.blockId, ic.column, ic.flipped).includes(hole))) return 'ic';
        return null;
    }
    const OCCUPIED_MESSAGES = {
        ic: 'IC のピンが挿さっている穴です。同じ列の別の穴に線を挿してください',
        wire: 'すでにジャンパ線が挿さっている穴です',
        lead: 'すでに外部機器の線が挿さっている穴です',
    };

    // 少しの間だけメッセージを出す
    function flashTip(x, y, text) {
        showTip(x, y, text);
        clearTimeout(flashTip.timer);
        flashTip.timer = setTimeout(hideTip, 2500);
    }

    // 穴のクリック: 1つ目を選び、2つ目でジャンパ線を張る（同じ穴をもう一度押すと取り消し）
    function clickHole(hole) {
        // 外部（仮想実験室の本体など）が、機器の端子の線をこの穴に挿す操作として受け取った場合
        if (options.onHoleClick && options.onHoleClick(hole.id)) return;
        if (pendingHole === hole) {
            hole.el.classList.remove('bb-hole-pending');
            pendingHole = null;
            return;
        }
        // 1つの穴に挿せるのは1本だけ
        const occupant = occupantOf(hole);
        if (occupant) {
            flashTip(hole.x, hole.y, OCCUPIED_MESSAGES[occupant]);
            return;
        }
        // 外部機器の線を選んでいるときは、その線を挿す
        if (pendingTerminal) {
            plugTerminal(pendingTerminal.id, hole.id);
            selectTerminal(null);
            highlightNet(hole);
            return;
        }
        if (!pendingHole) {
            pendingHole = hole;
            hole.el.classList.add('bb-hole-pending');
            return;
        }
        pendingHole.el.classList.remove('bb-hole-pending');
        addWire(pendingHole.id, hole.id);
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
        // 両端の金具。下の穴や IC のピンへのマウス操作をじゃましないよう、マウスは素通りさせる
        [ha, hb].forEach(h => el('circle', { cx: h.x, cy: h.y, r: 2.6, fill: '#bbb', stroke: '#666', 'stroke-width': 0.6, 'pointer-events': 'none' }, g));
        const wire = { a, b, color, el: g };
        g.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            removeWire(wire);
        });
        wires.push(wire);
        changed();
        return wire;
    }

    function removeWire(wire) {
        wire.el.remove();
        wires.splice(wires.indexOf(wire), 1);
        changed();
    }

    // ===================================================================
    //  IC（DIP 14ピン）
    //   中央の溝をまたいで挿す（上側のピンは E 行、下側のピンは F 行）。
    //   切り欠きが左向きのとき、1番ピンは左下で、反時計回りに番号が進む:
    //     1 〜 7  … 下の行（F）を 左 → 右
    //     8 〜 14 … 上の行（E）を 右 → 左
    //   向きを反転（切り欠きが右）すると、1番ピンは右上になる。
    // ===================================================================
    let icSerial = 0;
    const pinCountOf = type => BB_IC_PINOUTS[type].length;

    // IC のピンが挿さる穴の一覧（1番ピンから順）。column は左端のピンの列番号（1〜）
    function icPinHoles(type, blockId, column, flipped) {
        const n = pinCountOf(type) / 2;
        const top = BB_ROW_NAMES_TOP[BB_ROW_NAMES_TOP.length - 1];   // E
        const bottom = BB_ROW_NAMES_BOTTOM[0];                       // F
        return BB_IC_PINOUTS[type].map((name, i) => {
            const firstHalf = i < n;
            let row, c;
            if (!flipped) {
                row = firstHalf ? bottom : top;
                c = firstHalf ? column + i : column + (2 * n - 1 - i);
            } else {
                row = firstHalf ? top : bottom;
                c = firstHalf ? column + (n - 1 - i) : column + (i - n);
            }
            return holeById[`${blockId}-${row}${c}`];
        });
    }

    // その位置に挿せるか（ボードからはみ出さない・他の IC とぶつからない・ピンの穴が空いている）
    // 実物の IC は本体がピンより少し長いので、隣の IC との間は1列以上あける
    function canPlaceIC(type, blockId, column, movingIc) {
        const n = pinCountOf(type) / 2;
        if (column < 1 || column + n - 1 > BB_COLUMNS) return false;
        const hitsOtherIc = ics.some(ic => ic !== movingIc && ic.blockId === blockId
            && column <= ic.column + pinCountOf(ic.type) / 2 && ic.column <= column + n);
        const hitsWire = icPinHoles(type, blockId, column, false).some(hasWireOrLead);
        return !hitsOtherIc && !hitsWire;
    }

    // IC の見た目を描く（実際に挿した IC と、ドラッグ中の影の両方で使う）
    function drawICBody(g, type, blockId, column, flipped, damaged = false) {
        const n = pinCountOf(type) / 2;
        const block = placed.find(p => p.id === blockId);
        const yTop = block.rowY(0, 4), yBottom = block.rowY(1, 0), yMid = (yTop + yBottom) / 2;
        const x0 = colX(column - 1), x1 = colX(column - 1 + n - 1);
        const part = BB_PARTS.find(p => p.type === type).part;

        const body = el('rect', { x: x0 - 6, y: yTop + 2, width: x1 - x0 + 12, height: yBottom - yTop - 4, rx: 2,
                                  fill: damaged ? '#5b1d1d' : '#2b2b2b', stroke: damaged ? '#c62828' : '#111', class: 'bb-ic-body' }, g);
        // 切り欠き（1番ピン側の目印）
        const notch = flipped
            ? `M ${x1 + 6} ${yMid - 4} a 4 4 0 0 0 0 8`
            : `M ${x0 - 6} ${yMid - 4} a 4 4 0 0 1 0 8`;
        el('path', { d: notch, fill: '#555', 'pointer-events': 'none' }, g);
        el('text', { x: (x0 + x1) / 2, y: yMid + 2.5, 'text-anchor': 'middle', class: 'bb-ic-label', 'pointer-events': 'none' }, g)
            .textContent = damaged ? `${part}（破損）` : part;
        return body;
    }

    // IC を挿す。挿せない位置なら null を返す
    function placeIC(type, blockId, column, flipped = false) {
        if (!canPlaceIC(type, blockId, column, null)) return null;
        const units = BB_IC_MODELS[type].units.length;
        const ic = {
            id: 'U' + (++icSerial), type, part: BB_PARTS.find(p => p.type === type).part, blockId, column, flipped, el: null,
            powered: false, damaged: false, damageReason: '',
            // 個体差（遅延の倍率）と、電源投入時のフリップフロップの状態
            speed: Array.from({ length: units }, () => 1 + (Math.random() * 2 - 1) * BB_DELAY_SPREAD),
            ffInit: [],
        };
        randomizeFlipFlops(ic);
        ics.push(ic);
        renderIC(ic);
        changed();
        return ic;
    }

    function randomizeFlipFlops(ic) {
        ic.ffInit = BB_IC_MODELS[ic.type].units.map(() => (Math.random() < 0.5 ? 0 : 1));
    }

    // IC を抜く
    function removeIC(ic) {
        ic.el.remove();
        ics.splice(ics.indexOf(ic), 1);
        hideTip();
        clearHighlight();
        changed();
    }

    // 挿した IC を描き直す（位置や向きを変えたとき）
    function renderIC(ic) {
        if (ic.el) ic.el.remove();
        const g = el('g', { class: 'bb-ic', 'data-ic': ic.id }, layerIC);
        ic.el = g;
        const body = drawICBody(g, ic.type, ic.blockId, ic.column, ic.flipped, ic.damaged);

        // 本体: ドラッグで挿し直し、ダブルクリックで向きを反転、右クリックで抜く
        body.addEventListener('pointerdown', e => startDrag(e, ic.type, ic));
        body.addEventListener('dblclick', () => { ic.flipped = !ic.flipped; renderIC(ic); changed(); });
        body.addEventListener('contextmenu', e => { e.preventDefault(); removeIC(ic); });
        body.addEventListener('mouseover', () => {
            const r = body.getBBox();
            const state = ic.damaged ? `破損: ${ic.damageReason}` : ic.powered ? '動作中' : '電源が来ていない';
            showTip(r.x + r.width / 2, r.y, `${ic.id}: ${ic.part}［${state}］（ドラッグで移動・ダブルクリックで向きを反転・右クリックで抜く）`);
        });
        body.addEventListener('mouseout', hideTip);

        // ピン: マウスを乗せるとピン名。クリックすると、別の穴に挿すよう案内する
        icPinHoles(ic.type, ic.blockId, ic.column, ic.flipped).forEach((h, i) => {
            const onTopRow = h.label.startsWith(BB_ROW_NAMES_TOP[BB_ROW_NAMES_TOP.length - 1]);
            const pin = el('rect', { x: h.x - 2.2, y: onTopRow ? h.y - 1 : h.y - 4, width: 4.4, height: 5, fill: '#c9c9c9', class: 'bb-ic-pin' }, g);
            const name = BB_IC_PINOUTS[ic.type][i];
            pin.addEventListener('mouseover', () => { highlightNet(h); showTip(h.x, h.y, withState(`${ic.id}（${ic.part}） ${i + 1}番ピン: ${name}（${h.label}）`, h)); });
            pin.addEventListener('mouseout', () => { clearHighlight(); hideTip(); });
            pin.addEventListener('click', () => clickHole(h));   // 挿さっている穴なので案内が出る
        });
    }

    // ===================================================================
    //  IC のドラッグ（部品箱から取り出す / 挿した IC を挿し直す）
    // ===================================================================
    let drag = null;   // { type, ic(挿し直しのときの IC), flipped, ghost, snap, moved }

    // 画面上のマウス位置 → SVG の座標
    function toSvgPoint(e) {
        const p = svg.createSVGPoint();
        p.x = e.clientX;
        p.y = e.clientY;
        return p.matrixTransform(svg.getScreenCTM().inverse());
    }

    // マウス位置から、挿す位置（どのブロックの何列目か）を決める。溝から遠ければ null
    function snapPosition(type, pt, movingIc) {
        const n = pinCountOf(type) / 2;
        for (const part of placed) {
            if (part.type !== 'block') continue;
            const trenchY = (part.rowY(0, 4) + part.rowY(1, 0)) / 2;
            if (Math.abs(pt.y - trenchY) > BB_PITCH * 2.5) continue;
            const column = Math.round((pt.x - colX(0)) / BB_PITCH + 1 - (n - 1) / 2);
            return { blockId: part.id, column, ok: canPlaceIC(type, part.id, column, movingIc) };
        }
        return null;
    }

    function startDrag(e, type, ic = null) {
        if (e.button !== undefined && e.button !== 0) return;   // 左ボタンだけ
        e.preventDefault();
        hideTip();
        drag = { type, ic, flipped: ic ? ic.flipped : false, ghost: null, snap: null, moved: false, start: toSvgPoint(e) };
        if (ic) ic.el.classList.add('bb-ic-moving');
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', onDragEnd, { once: true });
        if (!ic) onDragMove(e);   // 部品箱から取り出したときは、すぐ影を出す
    }

    function onDragMove(e) {
        if (!drag) return;
        const pt = toSvgPoint(e);
        if (drag.ic && !drag.moved && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) < 3) return;   // クリック程度の動きは無視
        drag.moved = true;

        if (drag.ghost) drag.ghost.remove();
        drag.ghost = el('g', { class: 'bb-ic-ghost', 'pointer-events': 'none' }, layerWires);
        drag.snap = snapPosition(drag.type, pt, drag.ic);

        if (drag.snap && drag.snap.column >= 1 && drag.snap.column + pinCountOf(drag.type) / 2 - 1 <= BB_COLUMNS) {
            // 挿せる位置の候補に影を出す（挿せないときは赤）
            drawICBody(drag.ghost, drag.type, drag.snap.blockId, drag.snap.column, drag.flipped);
            drag.ghost.classList.toggle('bb-ic-ghost-ng', !drag.snap.ok);
        } else {
            // 溝から離れているときは、マウスに付いてくるだけ（置けない）
            const n = pinCountOf(drag.type) / 2;
            el('rect', { x: pt.x - (n - 1) * BB_PITCH / 2 - 6, y: pt.y - 10, width: (n - 1) * BB_PITCH + 12, height: 20, rx: 2, fill: '#2b2b2b' }, drag.ghost);
            drag.ghost.classList.add('bb-ic-ghost-ng');
            drag.snap = null;
        }
    }

    function onDragEnd() {
        window.removeEventListener('pointermove', onDragMove);
        if (!drag) return;
        const { ic, snap, moved } = drag;
        if (drag.ghost) drag.ghost.remove();

        if (ic) {
            ic.el.classList.remove('bb-ic-moving');
            if (moved && snap && snap.ok) {          // 挿し直し
                ic.blockId = snap.blockId;
                ic.column = snap.column;
                renderIC(ic);
                changed();
            }
        } else if (snap && snap.ok) {                // 部品箱から挿す
            placeIC(drag.type, snap.blockId, snap.column, drag.flipped);
        }
        drag = null;
    }

    // --- 部品箱（ボードの上に並べる。ここから IC をドラッグする） ---
    const tray = document.createElement('div');
    tray.className = 'bb-tray';
    tray.innerHTML = '<span class="bb-tray-title">部品箱<small>ドラッグしてボードの溝の上へ</small></span>';
    BB_PARTS.forEach(p => {
        const item = document.createElement('div');
        item.className = 'bb-tray-item';
        item.dataset.part = p.type;
        item.innerHTML = `<span class="bb-tray-chip">${p.part}</span><span class="bb-tray-desc">${p.description}</span>`;
        item.addEventListener('pointerdown', e => startDrag(e, p.type));
        tray.appendChild(item);
    });
    container.insertBefore(tray, svg);

    // ===================================================================
    //  13. 電気的なつながり（給電・IC の動作・配線ミスの検出）
    //   ・電源レール: SW が ON のレールが電圧を出す（GND は常に 0V）
    //   ・IC: VCC が +5V、GND が GND につながっているときだけ動く
    //   ・±15V をつないだり、電源を逆につないだりした IC は壊れる（抜いて交換するまで直らない）
    //   ・回路の動きは logic-sim.js（simulateLogic）で ns 単位に計算する
    // ===================================================================
    let analysis = { status: [], netState: {}, find: null, rails: null, shortRoots: new Set() };

    // 電源レールの情報。voltsOf(root) は、そのネットにかかっている電源の電圧
    //   （null = 電源の入ったレールにつながっていない、'short' = 違う電圧どうしがつながっている）
    function railInfo(find) {
        const names = {};     // root → Set(レール名)
        holes.forEach(h => {
            if (!h.rail) return;
            const root = find(h.strip);
            (names[root] = names[root] || new Set()).add(h.rail);
        });
        const voltsOf = root => {
            const volts = [...new Set([...(names[root] || [])]
                .filter(n => BB_RAIL_SUPPLY[n] && (!BB_RAIL_SUPPLY[n].switch || power[BB_RAIL_SUPPLY[n].switch]))
                .map(n => BB_RAIL_SUPPLY[n].volts))];
            return volts.length === 0 ? null : volts.length === 1 ? volts[0] : 'short';
        };
        return { names, voltsOf };
    }

    // 各 IC に電源が来ているか、壊れていないかを決める。新しく壊れた IC を返す
    function updatePowerState(find, rails) {
        const newlyDamaged = [];
        ics.forEach(ic => {
            const pins = icPinHoles(ic.type, ic.blockId, ic.column, ic.flipped);
            const names = BB_IC_PINOUTS[ic.type];
            const volts = pins.map(h => rails.voltsOf(find(h.strip)));
            const vcc = volts[names.indexOf('VCC')], gnd = volts[names.indexOf('GND')];
            if (!ic.damaged) {
                let reason = '';
                if (volts.some(v => v === 15 || v === -15)) reason = '±15V の電源レールにつながったピンがあり、許容電圧を超えた';
                else if (vcc === 0 && gnd === 5) reason = '電源を逆向き（VCC に GND、GND に +5V）につないだ';
                if (reason) {
                    ic.damaged = true;
                    ic.damageReason = reason;
                    renderIC(ic);
                    newlyDamaged.push(ic);
                }
            }
            ic.powered = !ic.damaged && vcc === 5 && gnd === 0;
        });
        return newlyDamaged;
    }

    // 今の配線・電源・外部機器の設定から、シミュレータに渡す回路を作る
    function buildCircuit() {
        const { find } = computeNets();
        const rails = railInfo(find);
        const netIds = new Map();                               // ネットの root → 番号
        const netNo = root => {
            if (!netIds.has(root)) netIds.set(root, netIds.size);
            return netIds.get(root);
        };
        const holeNet = h => netNo(find(h.strip));
        const circuit = { netCount: 0, fixed: [], sources: [], gates: [], flipflops: [] };
        const status = [];
        const driverDesc = {};                                  // ネット番号 → そのネットに値を出しているものの説明
        const addDriver = (net, text) => (driverDesc[net] = driverDesc[net] || []).push(text);
        const shortRoots = new Set();
        const anyPower = power.SW1 || power.SW2;

        // --- 電源レール ---
        Object.entries(rails.names).forEach(([root, nameSet]) => {
            const names = [...nameSet];
            const net = netNo(root);
            names.forEach(n => {
                const s = BB_RAIL_SUPPLY[n];
                if (!s || (s.switch && !power[s.switch])) return;
                circuit.fixed.push({ net, value: s.volts === 5 ? 1 : s.volts === 0 ? 0 : 'X' });
                addDriver(net, `${n} レール`);
            });
            if (new Set(names.map(n => BB_RAIL_SUPPLY[n] && BB_RAIL_SUPPLY[n].volts)).size > 1) {
                shortRoots.add(root);
                status.push(rails.voltsOf(root) === 'short'
                    ? { level: 'error', text: `電源のショート: ${names.join(' と ')} のレールが直接つながっています。電源を切って配線を確認してください` }
                    : { level: 'warn', text: `${names.join(' と ')} のレールがつながっています（電源を入れるとショートします）` });
            }
        });

        // --- IC ---
        const usedInputs = [];      // 浮いた入力の検出用 { net, label }
        ics.forEach(ic => {
            const pins = icPinHoles(ic.type, ic.blockId, ic.column, ic.flipped);
            const names = BB_IC_PINOUTS[ic.type];
            const model = BB_IC_MODELS[ic.type];
            const pinNo = name => names.indexOf(name) + 1;
            const pinNet = name => holeNet(pins[names.indexOf(name)]);
            const pinLabel = name => `${ic.id} の ${pinNo(name)}番ピン（${name}）`;
            const outputsOf = u => u.kind === 'JK' ? [u.q, u.qn] : [u.out];
            const inputsOf = u => u.kind === 'JK' ? [u.j, u.k, u.clk, u.clr] : u.in;
            pins.forEach(h => holeNet(h));      // 電源が来ていない IC のピンもネットとして扱う（状態表示のため）

            if (ic.damaged) {
                status.push({ level: 'error', text: `${ic.id}（${ic.part}）が壊れています: ${ic.damageReason}。抜いて新しい IC に交換してください` });
                if (anyPower) model.units.forEach(u => outputsOf(u).forEach(o => {
                    circuit.fixed.push({ net: pinNet(o), value: 'X' });
                    addDriver(pinNet(o), `${pinLabel(o)}（壊れた IC）`);
                }));
                return;
            }
            const railsOfPin = name => rails.names[find(pins[names.indexOf(name)].strip)] || new Set();
            if (!railsOfPin('VCC').has('+5V') || !railsOfPin('GND').has('GND')) {
                status.push({ level: 'warn', text: `${ic.id}（${ic.part}）の電源がつながっていません（${pinNo('VCC')}番ピン VCC → +5V、${pinNo('GND')}番ピン GND → GND）` });
            }
            if (!ic.powered) return;

            model.units.forEach((u, ui) => {
                const f = ic.speed[ui];
                if (u.kind === 'JK') {
                    circuit.flipflops.push({
                        kind: 'JK', j: pinNet(u.j), k: pinNet(u.k), clk: pinNet(u.clk), clr: pinNet(u.clr),
                        q: pinNet(u.q), qn: pinNet(u.qn),
                        clkToQNs: model.clkToQNs * f, clrToQNs: model.clrToQNs * f, init: ic.ffInit[ui],
                    });
                } else {
                    circuit.gates.push({ fn: u.kind, inputs: u.in.map(pinNet), output: pinNet(u.out), delayNs: model.delayNs * f });
                }
                outputsOf(u).forEach(o => addDriver(pinNet(o), pinLabel(o)));
                // 出力をどこかにつないでいる（＝使っている）ゲート・FF だけ、入力が浮いていないか調べる
                const used = outputsOf(u).some(o => connectionCount(find, find(pins[names.indexOf(o)].strip)) > 1);
                if (used) inputsOf(u).forEach(name => usedInputs.push({ net: pinNet(name), label: pinLabel(name) }));
            });
        });

        // --- 外部機器の線 ---
        const gndHole = holes.find(h => h.rail === 'GND');
        const needGround = terminals.some(t => t.role === 'ground');
        const grounded = !needGround || (gndHole && find(EXT_GND) === find(gndHole.strip));
        terminals.forEach(t => {
            if (!t.holeId) return;
            const net = holeNet(holeById[t.holeId]);
            if (t.role !== 'source' || !t.signal || !t.signal.enabled) return;
            const sig = t.signal;
            const L = BB_LOGIC_LEVELS;
            const toLogic = v => v >= L.vih ? 1 : v <= L.vil ? 0 : 'X';
            const fmt = v => v.toFixed(2);
            const isDc = sig.kind === 'dc';
            const vHigh = isDc ? sig.volts : sig.offsetV + sig.vpp / 2;
            const vLow  = isDc ? sig.volts : sig.offsetV - sig.vpp / 2;
            if (vLow < L.minV || vHigh > L.maxV) {
                status.push({ level: 'warn', text: `${t.label} の電圧（${fmt(vLow)} 〜 ${fmt(vHigh)} V）が 74HC の入力範囲（0 〜 5 V）を超えています。振幅とオフセットを確認してください` });
            } else if (sig.kind === 'square' && (toLogic(vHigh) === 'X' || toLogic(vLow) === 'X')) {
                status.push({ level: 'warn', text: `${t.label} の電圧（${fmt(vLow)} 〜 ${fmt(vHigh)} V）では H / L を正しく判定できません（H は ${L.vih} V 以上、L は ${L.vil} V 以下）` });
            } else if (isDc && toLogic(vHigh) === 'X') {
                status.push({ level: 'warn', text: `${t.label} の電圧（${fmt(vHigh)} V）では H / L を正しく判定できません（H は ${L.vih} V 以上、L は ${L.vil} V 以下）` });
            }
            const logicOf = v => grounded ? toLogic(v) : 'X';
            if (isDc) {
                circuit.sources.push({ net, kind: 'constant', value: logicOf(vHigh) });
            } else if (sig.kind === 'square') {
                const periodNs = 1e9 / sig.freqHz;
                const duty = sig.duty === undefined ? 50 : sig.duty;
                circuit.sources.push({ net, kind: 'square', periodNs, highNs: periodNs * duty / 100, high: logicOf(vHigh), low: logicOf(vLow) });
            } else {
                // 正弦波・三角波: 1周期を細かく区切って電圧を求め、H / L / 不定（しきい値の間）の区間に分ける
                const periodNs = 1e9 / sig.freqHz;
                const N = 720;
                const shape = sig.kind === 'sine'
                    ? ph => Math.sin(2 * Math.PI * ph)
                    : ph => (ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4);   // 三角波
                const segments = [];
                for (let i = 0; i < N; i++) {
                    const value = logicOf(sig.offsetV + sig.vpp / 2 * shape(i / N));
                    if (segments.length === 0 || segments[segments.length - 1].value !== value) {
                        segments.push({ startNs: periodNs * i / N, value });
                    }
                }
                circuit.sources.push({ net, kind: 'pattern', periodNs, segments });
            }
            addDriver(net, t.label);
        });
        const pluggedOthers = terminals.filter(t => t.holeId && t.role !== 'ground');
        if (!grounded && pluggedOthers.length > 0) {
            status.push({ level: 'warn', text: '外部機器の GND の線がブレッドボードの GND につながっていません（信号の基準がそろわず、正しく入力・観測できません）' });
        }

        // --- 浮いた入力（どこからも H / L が来ていない入力ピン） ---
        const driven = new Set([...circuit.fixed.map(f => f.net), ...circuit.sources.map(s => s.net),
            ...circuit.gates.map(g => g.output), ...circuit.flipflops.flatMap(f => [f.q, f.qn])]);
        usedInputs.forEach(({ net, label }) => {
            if (!driven.has(net)) status.push({ level: 'warn', text: `${label}がどこにもつながっていません（浮いた入力は H か L か決まらず、動作が不定になります）` });
        });

        circuit.netCount = netIds.size;
        return { circuit, netIds, find, rails, status, driverDesc, shortRoots };
    }

    // ネットにつながっているもの（IC のピン・ジャンパ線の端・外部機器の線・電源レール）の数
    function connectionCount(find, root) {
        let count = 0;
        ics.forEach(ic => icPinHoles(ic.type, ic.blockId, ic.column, ic.flipped).forEach(h => { if (find(h.strip) === root) count++; }));
        wires.forEach(w => [w.a, w.b].forEach(id => { if (find(holeById[id].strip) === root) count++; }));
        terminals.forEach(t => { if (t.holeId && find(holeById[t.holeId].strip) === root) count++; });
        if (holes.some(h => h.rail && find(h.strip) === root)) count++;
        return count;
    }

    // 配線などが変わったら、電源・IC の状態を決め直し、各ネットの様子を調べる
    function analyze() {
        const { find } = computeNets();
        const newlyDamaged = updatePowerState(find, railInfo(find));
        const built = buildCircuit();

        // 少しの時間だけ動かして、各ネットが H / L / 変化している のどれかを調べる（最初の 1/3 は無視）
        const periods = built.circuit.sources.filter(s => s.periodNs).map(s => s.periodNs);
        const windowNs = Math.min(5e6, Math.max(1000, 3 * Math.max(0, ...periods)));
        const result = simulateLogic(built.circuit, windowNs, { maxEvents: 50000 });
        const from = windowNs / 3;
        const netState = {};
        const rootOfNet = [];
        built.netIds.forEach((no, root) => {
            rootOfNet[no] = root;
            const trace = result.traces[no];
            const seen = new Set([logicValueAt(trace, from)]);
            trace.forEach(p => { if (p.t > from) seen.add(p.v); });
            netState[root] = seen.has(0) && seen.has(1) ? 'toggle' : seen.size === 1 ? [...seen][0] : 'X';
        });

        // 出力どうし（または出力と電源レール）がぶつかっているところ
        const status = built.status.slice();
        result.conflicts.forEach(({ net }) => {
            if (built.shortRoots.has(rootOfNet[net])) return;   // 電源どうしのショートはすでに表示済み
            netState[rootOfNet[net]] = 'short';
            status.push({ level: 'error', text: `ショート: ${(built.driverDesc[net] || []).join(' と ')} がつながっていて、H と L がぶつかっています` });
        });
        if (!power.SW1) status.push({ level: 'info', text: 'SW1（+5V）が OFF です。IC は動いていません' });

        const order = { error: 0, warn: 1, info: 2 };
        status.sort((a, b) => order[a.level] - order[b.level]);
        analysis = { status, netState, find: built.find, rails: built.rails, shortRoots: built.shortRoots };

        newlyDamaged.forEach(ic => {
            const r = ic.el.querySelector('.bb-ic-body').getBBox();
            flashTip(r.x + r.width / 2, r.y, `${ic.id} が壊れました: ${ic.damageReason}`);
        });
    }

    function changed() {
        analyze();
        changeListeners.forEach(fn => fn());
    }

    // マウスを乗せたときの説明に、そのネットの状態を付け足す
    const STATE_TEXT = {
        0: 'L（0 V）', 1: 'H（5 V）', toggle: 'H と L をくり返している',
        Z: '浮いている（どこからも電圧がかかっていない）', X: '不定（H か L か決まらない）', short: 'ショート！',
    };
    function withState(text, hole) {
        if (!analysis.find) return text;
        const root = analysis.find(hole.strip);
        const volts = analysis.rails.voltsOf(root);
        if (volts === 'short') return `${text} — ショート！`;
        if (volts === 15 || volts === -15) return `${text} — ${volts > 0 ? '+' : '−'}15 V`;
        if (hole.rail && volts === null) return `${text} — 電源 OFF`;
        const state = analysis.netState[root];
        if (state === undefined) return text;
        if (state === 'Z' && !power.SW1 && !power.SW2) return `${text} — 電源 OFF`;
        return `${text} — ${STATE_TEXT[state]}`;
    }

    // 電源投入から durationNs [ns] までを計算する。trace(端子の id か穴の id) で波形を取り出せる
    function simulate(durationNs, simOptions) {
        const built = buildCircuit();
        const result = simulateLogic(built.circuit, durationNs, simOptions);
        const netOf = id => {
            const t = terminalById(id);
            const hole = t ? (t.holeId ? holeById[t.holeId] : null) : holeById[id];
            if (!hole) return null;
            const root = built.find(hole.strip);
            return built.netIds.has(root) ? built.netIds.get(root) : -1;
        };
        return {
            durationNs,
            truncated: result.truncated,
            status: built.status,
            trace(id) {
                const n = netOf(id);
                if (n === null) return null;                // 線が挿さっていない
                if (n === -1) return [{ t: 0, v: 'Z' }];    // 何もつながっていない穴
                return result.traces[n];
            },
        };
    }

    // ===================================================================
    //  14. 外部機器の線（WaveGen の出力、ロジックアナライザのプローブ、各機器の GND など）
    //   role: 'source' … 信号を入れる（setSignal で波形を設定）
    //         'probe'  … 観測する（simulate().trace(id) で波形を読む）
    //         'ground' … 機器の GND。ブレッドボードの GND につなぐと基準がそろう
    // ===================================================================
    const terminalById = id => terminals.find(t => t.id === id);
    let leadTray = null;

    function defineTerminal(def) {
        const t = {
            id: def.id, label: def.label || def.id, short: def.short || def.id,
            role: def.role || 'probe', color: def.color || '#607d8b',
            holeId: null, signal: null, el: null, trayEl: null,
        };
        terminals.push(t);
        if (options.leadTray !== false) addTerminalToTray(t);
        return t;
    }

    function plugTerminal(id, holeId) {
        const t = terminalById(id), hole = holeById[holeId];
        if (!t || !hole) return false;
        if (t.holeId === holeId) return true;
        if (occupantOf(hole)) return false;
        t.holeId = holeId;
        renderLead(t);
        changed();
        return true;
    }

    function unplugTerminal(id) {
        const t = terminalById(id);
        if (!t || !t.holeId) return;
        t.holeId = null;
        renderLead(t);
        hideTip();
        clearHighlight();
        changed();
    }

    // 信号源の設定
    //   { kind: 'square' | 'sine' | 'ramp', freqHz, vpp, offsetV, duty(%・方形波のみ), enabled }
    //   { kind: 'dc', volts, enabled }
    function setSignal(id, signal) {
        const t = terminalById(id);
        if (!t) return;
        t.signal = signal ? { ...signal } : null;
        changed();
    }

    const isDarkColor = hex => {
        const n = parseInt(hex.replace('#', ''), 16);
        return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 140;
    };

    // 穴に挿さった外部機器の線を描く（穴から斜め上に伸び、先に名札が付く）
    function renderLead(t) {
        if (t.el) { t.el.remove(); t.el = null; t.badgeEl = null; }
        if (t.trayEl) {
            t.trayEl.classList.toggle('bb-lead-plugged', !!t.holeId);
            t.trayEl.querySelector('.bb-lead-where').textContent = t.holeId ? holeById[t.holeId].label : '未接続';
        }
        if (!t.holeId) return;
        const h = holeById[t.holeId];
        const g = el('g', { class: 'bb-lead', 'data-terminal': t.id }, layerLeads);
        // 溝より上の穴からは上へ、下の穴からは下へ伸ばす（IC の本体に重ならないように）
        const dir = h.dir || -1;
        // 隣の行どうし（例: B12 と C12）の名札が重ならないよう、行によって左右に振り分ける
        const side = 'BDGI'.includes(h.label[0]) ? -1 : 1;
        const ex = h.x + 14 * side, ey = h.y + 30 * dir;
        const d = `M ${h.x} ${h.y} C ${h.x} ${h.y + 16 * dir}, ${ex} ${ey - 14 * dir}, ${ex} ${ey}`;
        el('path', { d, fill: 'none', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 4, 'stroke-linecap': 'round', transform: 'translate(1.5,1.5)' }, g);
        el('path', { d, fill: 'none', stroke: t.color, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
        el('circle', { cx: h.x, cy: h.y, r: 2.6, fill: '#bbb', stroke: '#666', 'stroke-width': 0.6, 'pointer-events': 'none' }, g);
        const label = el('text', { x: ex, y: dir < 0 ? ey - 3 : ey + 8, 'text-anchor': 'middle', class: 'bb-lead-label',
                                   fill: isDarkColor(t.color) ? '#fff' : '#111' }, g);
        label.textContent = t.short;
        const box = label.getBBox();
        t.badgeEl = el('rect', { x: box.x - 3, y: box.y - 1.5, width: box.width + 6, height: box.height + 3, rx: 2,
                                 fill: t.color, stroke: '#222', 'stroke-width': 0.6 });
        g.insertBefore(t.badgeEl, label);
        g.addEventListener('contextmenu', e => { e.preventDefault(); unplugTerminal(t.id); });
        g.addEventListener('mouseover', () => { highlightNet(h); showTip(ex, ey, withState(`${t.label}（${h.label}・右クリックで外す）`, h)); });
        g.addEventListener('mouseout', () => { clearHighlight(); hideTip(); });
        t.el = g;
    }

    // 外部機器の線の一覧（クリックで選び、挿す穴をクリック）
    function addTerminalToTray(t) {
        if (!leadTray) {
            leadTray = document.createElement('div');
            leadTray.className = 'bb-tray bb-lead-tray';
            leadTray.innerHTML = '<span class="bb-tray-title">外部機器の線<small>クリック → 挿す穴をクリック（右クリックで外す）</small></span>';
            container.insertBefore(leadTray, svg);
        }
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'bb-lead-item';
        item.dataset.terminal = t.id;
        item.innerHTML = `<span class="bb-lead-swatch" style="background:${t.color}"></span>`
                       + `<span class="bb-lead-name">${t.label}</span><small class="bb-lead-where">未接続</small>`;
        item.addEventListener('click', () => selectTerminal(pendingTerminal === t ? null : t));
        item.addEventListener('contextmenu', e => { e.preventDefault(); unplugTerminal(t.id); });
        leadTray.appendChild(item);
        t.trayEl = item;
    }

    function selectTerminal(t) {
        pendingTerminal = t;
        if (pendingHole) { pendingHole.el.classList.remove('bb-hole-pending'); pendingHole = null; }
        terminals.forEach(x => x.trayEl && x.trayEl.classList.toggle('bb-lead-selected', x === t));
    }

    // ===================================================================
    //  15. 回路のつながり（一覧として取り出す）
    // ===================================================================
    // 返り値: [{ id, holes: [穴], rails: [電源レールの名前], pins: [{ ic, part, pin, name }], terminals: [外部機器の線の id] }, ...]
    // IC のピン・ジャンパ線・外部機器の線がつながっている導通だけを返す
    function getNetlist() {
        const { find, nets } = computeNets();
        const result = {};
        const netOf = hole => {
            const root = find(hole.strip);
            if (!result[root]) {
                const railNames = [...new Set(holes.filter(h => h.rail && find(h.strip) === root).map(h => h.rail))];
                result[root] = { id: root, holes: nets[root], rails: railNames, pins: [], terminals: [] };
            }
            return result[root];
        };
        ics.forEach(ic => {
            icPinHoles(ic.type, ic.blockId, ic.column, ic.flipped).forEach((h, i) => {
                netOf(h).pins.push({ ic: ic.id, part: ic.part, pin: i + 1, name: BB_IC_PINOUTS[ic.type][i] });
            });
        });
        wires.forEach(w => { netOf(holeById[w.a]); });
        terminals.forEach(t => { if (t.holeId) netOf(holeById[t.holeId]).terminals.push(t.id); });
        return Object.values(result);
    }

    // ===================================================================
    //  16. 回路の保存と復元（次の週の実験で同じ回路を使うため）
    //   保存するのは IC・ジャンパ線・電源スイッチ。外部機器の線は本体側の結線として保存する
    // ===================================================================
    function getState() {
        return {
            ics: ics.map(ic => ({ type: ic.type, blockId: ic.blockId, column: ic.column, flipped: ic.flipped })),
            wires: wires.map(w => ({ a: w.a, b: w.b, color: w.color })),
            power: { ...power },
        };
    }

    // 今の回路をすべて外してから、保存した回路を組み直す
    function setState(state) {
        terminals.forEach(t => { if (t.holeId) { t.holeId = null; renderLead(t); } });
        [...wires].forEach(w => { w.el.remove(); wires.splice(wires.indexOf(w), 1); });
        [...ics].forEach(ic => { ic.el.remove(); ics.splice(ics.indexOf(ic), 1); });
        power.SW1 = false;
        power.SW2 = false;
        (state.ics || []).forEach(ic => {
            const placed = placeIC(ic.type, ic.blockId, ic.column, false);
            if (placed && ic.flipped) { placed.flipped = true; renderIC(placed); }
        });
        (state.wires || []).forEach(w => { if (holeById[w.a] && holeById[w.b]) addWire(w.a, w.b, w.color); });
        const savedPower = state.power || {};
        power.SW1 = Boolean(savedPower.SW1);
        power.SW2 = Boolean(savedPower.SW2);
        if (power.SW1) ics.forEach(randomizeFlipFlops);
        renderPower();
        changed();
    }

    // --- 作成時に渡された外部機器の線を登録して、最初の状態を調べる ---
    (options.terminals || []).forEach(defineTerminal);
    analyze();

    return {
        holes, wires, ics, power, terminals,
        addWire, removeWire, placeIC, removeIC,
        setPower, getState, setState,
        defineTerminal, plugTerminal, unplugTerminal, setSignal,
        // 外部機器の線の名札（画面上の位置を取って、本体側のワイヤーをここまで引くのに使う）
        getLeadAnchor: id => { const t = terminalById(id); return t && t.badgeEl ? t.badgeEl : null; },
        getTerminalHole: id => { const t = terminalById(id); return t ? t.holeId : null; },
        simulate,
        getStatus: () => analysis.status.slice(),
        getNetState: holeId => {
            const h = holeById[holeId];
            return h && analysis.find ? analysis.netState[analysis.find(h.strip)] : undefined;
        },
        onChange: fn => { changeListeners.push(fn); },
        getNetlist,
        getNets: () => Object.values(computeNets().nets),
    };
}
