// =======================================================================
//  汎用IC の実験（2-I-7 カウンタ回路 / 2-I-8 組み合わせ回路）  digital-ic.js
//
//  ブレッドボード（breadboard.js）を仮想実験室に置き、オシロスコープ（MSOX、Agilent の機種）の
//    ・WaveGen（内蔵の発振器。前面の Gen Out 端子から出力）
//    ・ロジックアナライザ（前面の DIGITAL 端子 = デジタル入力 D0〜D7）
//  と結線して使えるようにする。発振器（単体）の OUTPUT もブレッドボードに繋げる。
//  script.js の後に読み込む（script.js の状態・関数を使い、script.js からもこのファイルの関数を呼ぶ）。
//
//  【目次】
//    1. 定数・状態
//    2. ブレッドボードの作成
//    3. ブレッドボードとの結線（機器の端子 → 穴）
//    4. WaveGen とブレッドボードへの信号
//    5. ロジックアナライザの波形データ（ブレッドボードの計算結果を周期的な波形にする）
//    6. 描画（デジタル波形）とトリガ
//    7. ボタン・メニュー・Entry ツマミ
//    8. 波形の保存（Save/Recall）
//    9. 回路の保存・読み込み（次の週も同じ回路を使う）・カウンタ回路を自動で組む（ボタン・隠しコマンド）
//   10. 実験の手引き（2-I-7 / 2-I-8 の手順と進み具合・測定結果の表）
//   11. 起動処理
//
//  左の「実験番号」→ 実験4 で、画面右下に手順の手引き（10章）が開く。済んだ手順には ✓ が付く。
//
//  【操作の流れ（教科書 2-I-7 の手順）】
//    1. 器具リストからブレッドボードを出し、IC を挿して配線する
//    2. オシロの Gen Out をクリック → 初段の CLK の列の穴をクリック（クロックを入れる）
//    3. オシロの DIGITAL の D0〜D4 をクリック → Clock・Q0〜Q3 の列の穴をクリック
//    4. ブレッドボードの SW1（+5V）を ON
//    5. オシロの [Wave Gen] を押し、ソフトキーと Entry ツマミで 方形波・1kHz・5Vpp・2.5V・20% にする
//    6. [Digital] でデジタル入力を表示し、[Trigger] でソースを D0・立ち下がりにして波形を止める
//    7. 時間ツマミ・水平位置ツマミ・カーソルで各段の遅延時間を測る
// =======================================================================


// =======================================================================
//  1. 定数・状態
// =======================================================================

const DIGITAL_CHANNELS = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];

// ブレッドボードの穴に繋げる端子（キー = 機器側の端子名。ブレッドボードに挿す線の名前も同じにする）
//   side: どの機器の端子か   role: 'source' 信号を入れる / 'probe' 観測する
const BB_CONNECTABLE = {
    GenOut:  { side: 'osc', label: 'WaveGen 出力（Gen Out）', short: 'Gen', role: 'source' },
    fctnout: { side: 'fg',  label: '発振器 OUTPUT',          short: 'FG',  role: 'source' },
};
DIGITAL_CHANNELS.forEach(d => {
    BB_CONNECTABLE[d] = { side: 'osc', label: `ロジアナ ${d}`, short: d, role: 'probe' };
});

// --- WaveGen（MSOX 内蔵の発振器）---
//   電源投入時の設定は実機の初期値（正弦波・1kHz・500mVpp・0V）。教科書の設定には自分で変える
const WAVEGEN_WAVEFORMS = [
    { id: 'SINE',   name: '正弦波' },
    { id: 'SQUARE', name: '方形波' },
    { id: 'RAMP',   name: 'ランプ' },
    { id: 'DC',     name: 'DC' },
];
const WAVEGEN_LIMITS = {
    freq:      { min: 1,    max: 20e6 },   // [Hz]（方形波は 10MHz まで）
    amplitude: { min: 0.1,  max: 10 },     // [Vpp]
    offset:    { min: -5,   max: 5 },      // [V]
    duty:      { min: 20,   max: 80 },     // [%]（方形波のみ）
};
const waveGenState = {
    on: false,             // 出力（[Wave Gen] キーで ON/OFF。ON の間はキーが光る）
    waveform: 'SINE',
    freq: 1000,            // [Hz]
    amplitude: 0.5,        // [Vpp]
    offset: 0,             // [V]
    duty: 50,              // [%]
};

// --- ロジックアナライザ（デジタル入力）---
const digitalState = {
    on: false,             // デジタル入力の表示（[Digital] キーで ON/OFF）
    data: null,            // 表示する波形（5章の rebuildDigitalData が作る）
    dirty: true,           // 回路や設定が変わり、波形を作り直す必要がある
};

// オシロのメニュー（ソフトキー）で、Entry ツマミが操作する項目の番号（メニューごと）
const menuSelection = { WaveGen: 1, Trigger: 0, Digital: 0 };

// デジタル波形の色
const DIGITAL_TRACE_COLOR = '#4fc3f7';

// ツールチップの説明（script.js の descriptions に追加する）
Object.assign(descriptions, {
    WavaGen: '[Wave Gen] 内蔵の発振器（WaveGen）の出力を ON/OFF し、設定メニューを開きます。出力は前面の Gen Out 端子から出ます',
    Digital: '[Digital] デジタル入力（ロジックアナライザ D0〜D7）の表示を ON/OFF します',
    Trigger: '[Trigger] トリガのソース（CH1〜3・D0〜D7）とスロープ（立ち上がり / 立ち下がり）を設定します',
    Entry: 'Entry ツマミ（ホイール）: メニューで選んだ項目の値を変えます',
    'Posツマミ': '水平位置ツマミ（ホイール）: 画面を1目盛ずつ左右にずらします',
    Soft1: 'ソフトキー1: 画面下のメニューの1番目の項目', Soft2: 'ソフトキー2: 画面下のメニューの2番目の項目',
    Soft3: 'ソフトキー3: 画面下のメニューの3番目の項目', Soft4: 'ソフトキー4: 画面下のメニューの4番目の項目',
    Soft5: 'ソフトキー5: 画面下のメニューの5番目の項目', Soft6: 'ソフトキー6: 画面下のメニューの6番目の項目',
    SavaRecall: '[Save/Recall] 画面の波形を PNG 画像で保存します（インク節約で白黒反転）',
    Single: '[Single] 次のトリガで1回だけ取り込んで止めます',
    GenOut: 'Gen Out（WaveGen の出力）: クリック → ブレッドボードの穴をクリックで結線。右クリックで外す',
});
DIGITAL_CHANNELS.forEach(d => {
    descriptions[d] = `DIGITAL ${d}（ロジックアナライザのプローブ）: クリック → ブレッドボードの穴をクリックで結線。右クリックで外す`;
});


// =======================================================================
//  2. ブレッドボードの作成
// =======================================================================

const LEAD_COLORS = { GenOut: '#e53935', fctnout: '#ff6600' };
const bbBoard = createBreadboard(document.getElementById('bb-root'), {
    terminals: Object.entries(BB_CONNECTABLE).map(([id, t]) => ({
        id, label: t.label, short: t.short, role: t.role,
        color: LEAD_COLORS[id] || TERMINAL_COLORS[id] || '#607d8b',
    })),
    leadTray: false,                 // 機器の線は、本体の結線操作（端子 → 穴）で挿す
    onHoleClick: onBreadboardHoleClick,
});

// 回路の状態（配線ミスなど）の一覧を、ボードの下に出す
const bbStatusList = document.createElement('ul');
bbStatusList.className = 'bb-status';
document.getElementById('bb-root').appendChild(bbStatusList);

function renderBreadboardStatus() {
    const list = bbBoard.getStatus();
    const icon = { error: '✖', warn: '⚠', info: 'ℹ' };
    bbStatusList.innerHTML = list.length === 0
        ? '<li class="ok">回路の状態: 問題は見つかっていません</li>'
        : list.map(s => `<li class="${s.level}">${icon[s.level]} ${s.text}</li>`).join('');
}

// ブレッドボードの配線・電源などが変わったとき
function onBreadboardChanged() {
    renderBreadboardStatus();
    syncConnectionsFromBoard();
    digitalState.dirty = true;
    redrawWires();
}


// =======================================================================
//  3. ブレッドボードとの結線（機器の端子 → 穴）
//
//   操作: 機器の端子（Gen Out・D0〜D7・発振器 OUTPUT）をクリック → ブレッドボードの穴をクリック
//   接続は wiringState.connections に { type: 'bb', oscTerminal | fgTerminal, bbTerminal } で持つ。
//   ブレッドボード側には同じ名前の「外部機器の線」を挿す（名札が付き、ここまでワイヤーを描く）
// =======================================================================

function canConnectToBreadboard(terminalName) {
    return Boolean(BB_CONNECTABLE[terminalName]);
}

// ワイヤーを描く先（ブレッドボードに挿した線の名札）
function getBreadboardLeadElement(id) {
    return bbBoard.getLeadAnchor(id);
}

// ブレッドボードの穴がクリックされたとき。機器の端子を選択中なら、その線を挿す（true = 処理した）
function onBreadboardHoleClick(holeId) {
    const pending = wiringState.pendingTerminal;
    if (!pending) return false;   // ふだんのクリック（ジャンパ線）はブレッドボードに任せる

    const term = pending.terminalName;
    if (!canConnectToBreadboard(term)) {
        showWireStatus(`⚠️ ${SIDE_NAMES[pending.side]}の「${term}」はブレッドボードには繋げません。`);
        return true;
    }
    if (!bbBoard.plugTerminal(term, holeId)) {
        showWireStatus('⚠️ その穴には、すでに IC のピンか線が挿さっています。同じ列の空いている穴をクリックしてください。');
        return true;
    }

    // 同じ端子の線は1本だけ（挿し直したときは前の接続を消す）
    wiringState.connections = wiringState.connections.filter(c => c.bbTerminal !== term);
    wiringState.connections.push({
        type: 'bb', [pending.side + 'Terminal']: term, bbTerminal: term,
        color: TERMINAL_COLORS[term] || LEAD_COLORS[term] || '#ffffff',
    });
    cancelPendingTerminal();
    updateBreadboardSources();
    digitalState.dirty = true;
    redrawWires();
    showWireStatus(`✅ ${BB_CONNECTABLE[term].label} → ブレッドボード（${holeId.replace(/^B\d-/, '')}）を接続しました。右クリックで切断できます。`);
    return true;
}

// 本体側で切断した線を、ブレッドボードからも抜く
function syncBreadboardLeads() {
    Object.keys(BB_CONNECTABLE).forEach(id => {
        const connected = wiringState.connections.some(c => c.bbTerminal === id);
        if (!connected && bbBoard.getTerminalHole(id)) bbBoard.unplugTerminal(id);
    });
}

// ブレッドボード側で抜いた線（名札の右クリック）の接続を、本体側からも消す
function syncConnectionsFromBoard() {
    const before = wiringState.connections.length;
    wiringState.connections = wiringState.connections.filter(c => !c.bbTerminal || bbBoard.getTerminalHole(c.bbTerminal));
    if (wiringState.connections.length !== before) {
        digitalState.dirty = true;
        showWireStatus('🔌 接続を切断しました。');
    }
}

// そのデジタル入力（'D0' など）がブレッドボードに繋がっていれば、その接続
function getDigitalConnection(channel) {
    return wiringState.connections.find(c => c.bbTerminal === channel);
}


// =======================================================================
//  4. WaveGen とブレッドボードへの信号
// =======================================================================

const BB_SIGNAL_KIND = { SINE: 'sine', SQUARE: 'square', RAMP: 'ramp' };
const lastSignals = {};

// WaveGen・発振器の今の出力を、ブレッドボードに挿した線の信号として渡す（変わったときだけ）
function updateBreadboardSources() {
    if (typeof bbBoard === 'undefined') return;   // 読み込み途中（script.js の起動処理から呼ばれた場合）

    const genOn = scopeState.isOn && waveGenState.on;
    const fgOn = fgState.power && fgState.outputOn;
    const signals = {
        GenOut: makeSourceSignal(waveGenState.waveform, waveGenState.freq, waveGenState.amplitude,
                                 waveGenState.offset, waveGenState.duty, genOn),
        fctnout: makeSourceSignal(fgState.waveform, fgState.freq, fgState.amptd, fgState.offset, 50, fgOn),
    };
    Object.entries(signals).forEach(([id, signal]) => {
        const key = JSON.stringify(signal);
        if (lastSignals[id] === key) return;
        lastSignals[id] = key;
        bbBoard.setSignal(id, signal);
    });
    digitalState.dirty = true;
}

function makeSourceSignal(waveform, freqHz, vpp, offsetV, duty, enabled) {
    if (waveform === 'DC') return { kind: 'dc', volts: offsetV, enabled };
    return { kind: BB_SIGNAL_KIND[waveform] || 'sine', freqHz, vpp, offsetV, duty, enabled };
}

// 周波数の表示（1.000kHz のように有効数字4桁）
function formatHz(hz) {
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)}MHz`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(3)}kHz`;
    return `${hz.toFixed(3)}Hz`;
}

// Entry ツマミ1目盛り分、周波数を変える（1・1.2・1.5・2・2.5・3・4・5・6・8 × 10^n）
const FREQ_MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
function stepFrequency(freq, direction) {
    const list = [];
    for (let exp = 0; exp <= 7; exp++) FREQ_MANTISSAS.forEach(m => list.push(m * Math.pow(10, exp)));
    const max = waveGenState.waveform === 'SQUARE' ? 10e6 : WAVEGEN_LIMITS.freq.max;
    const candidates = list.filter(f => f <= max);
    if (direction > 0) return candidates.find(f => f > freq * (1 + 1e-9)) || candidates[candidates.length - 1];
    return [...candidates].reverse().find(f => f < freq * (1 - 1e-9)) || candidates[0];
}

const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));
const round2 = v => Math.round(v * 100) / 100;


// =======================================================================
//  5. ロジックアナライザの波形データ
//
//   ブレッドボードを電源投入から計算し、落ち着いた後の「くり返し1周期分」を取り出しておく。
//   画面にはこれを周期的にくり返して描く（4ビットカウンタならクロック16周期で1回り）。
//   data = { periodNs: くり返しの周期（null なら変化しない）,
//            channels: { D0: { initial: 周期の始めの値, edges: [{ t: 周期内の時刻 ns, v }] }, ... } }
// =======================================================================

const DIGITAL_MAX_REPEAT = 64;   // クロック何周期までのくり返しを調べるか（6ビット分）

function rebuildDigitalData() {
    digitalState.dirty = false;
    const channels = DIGITAL_CHANNELS.filter(d => getDigitalConnection(d));
    if (channels.length === 0) { digitalState.data = null; return; }

    // 入力している信号の周期（WaveGen・発振器）。2つ以上あるときは長い方に合わせる
    const periods = [];
    if (getDigitalSourcePeriod('GenOut', scopeState.isOn && waveGenState.on, waveGenState)) {
        periods.push(1e9 / waveGenState.freq);
    }
    if (getDigitalSourcePeriod('fctnout', fgState.power && fgState.outputOn, { waveform: fgState.waveform })) {
        periods.push(1e9 / fgState.freq);
    }

    // 信号が入っていない: 少しだけ計算し、最後の値のまま変化しないものとして扱う
    if (periods.length === 0) {
        const result = bbBoard.simulate(2000);
        const data = { periodNs: null, channels: {} };
        channels.forEach(d => {
            const trace = result.trace(d) || [{ t: 0, v: 'Z' }];
            data.channels[d] = { initial: trace[trace.length - 1].v, edges: [] };
        });
        digitalState.data = data;
        return;
    }

    // 信号が入っている: 落ち着くまで4周期待ち、その後 2 × 64 周期分を計算してくり返しの長さを探す
    const T = Math.max(...periods);
    const start = 4 * T;
    const result = bbBoard.simulate(start + 2 * DIGITAL_MAX_REPEAT * T);
    const traces = {};
    channels.forEach(d => { traces[d] = result.trace(d) || [{ t: 0, v: 'Z' }]; });

    let repeat = DIGITAL_MAX_REPEAT;
    for (let m = 1; m <= DIGITAL_MAX_REPEAT; m *= 2) {
        const P = m * T;
        const same = channels.every(d => sameEdges(edgesBetween(traces[d], start, start + P),
                                                    edgesBetween(traces[d], start + P, start + 2 * P)));
        if (same) { repeat = m; break; }
    }

    const periodNs = repeat * T;
    const data = { periodNs, channels: {} };
    channels.forEach(d => {
        data.channels[d] = {
            initial: logicValueAt(traces[d], start - 1e-6),
            edges: edgesBetween(traces[d], start, start + periodNs),
        };
    });
    digitalState.data = data;
}

// その信号源が、ブレッドボードに挿されて変化する信号を出しているか
function getDigitalSourcePeriod(id, enabled, setting) {
    return enabled && bbBoard.getTerminalHole(id) && setting.waveform !== 'DC';
}

// [from, to) の間の変化を、from からの時刻にして取り出す
function edgesBetween(trace, from, to) {
    return trace.filter(p => p.t >= from && p.t < to).map(p => ({ t: p.t - from, v: p.v }));
}

function sameEdges(a, b) {
    return a.length === b.length && a.every((p, i) => p.v === b[i].v && Math.abs(p.t - b[i].t) < 0.01);
}

// 周期の中での位置 [ns]（負の時刻にも対応）
function phaseOf(timeNs, periodNs) {
    const phase = timeNs % periodNs;
    return phase < 0 ? phase + periodNs : phase;
}

// デジタル入力 channel の、時刻 tSec [s] の値（0 / 1 / 'X' / 'Z'）
function digitalValueAt(channel, tSec) {
    const data = digitalState.data;
    const ch = data && data.channels[channel];
    if (!ch) return 'Z';
    if (!data.periodNs || ch.edges.length === 0) return ch.initial;
    const phase = phaseOf(tSec * 1e9, data.periodNs);
    // phase 以前で最後の変化（二分探索）
    let lo = 0, hi = ch.edges.length - 1, found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ch.edges[mid].t <= phase) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found >= 0 ? ch.edges[found].v : ch.initial;
}

// 時刻 aSec〜bSec [s] の間に、値が変わる回数（画面の1ピクセルの中で変化があるかを調べる）
function digitalEdgeCount(channel, aSec, bSec) {
    const data = digitalState.data;
    const ch = data && data.channels[channel];
    if (!ch || !data.periodNs || ch.edges.length === 0) return 0;
    const span = (bSec - aSec) * 1e9;
    if (span >= data.periodNs) return ch.edges.length;
    const pa = phaseOf(aSec * 1e9, data.periodNs);
    const pb = pa + span;
    const countIn = (from, to) => ch.edges.filter(e => e.t > from && e.t <= to).length;
    return pb < data.periodNs ? countIn(pa, pb) : countIn(pa, data.periodNs) + countIn(-1, pb - data.periodNs);
}


// =======================================================================
//  6. 描画（デジタル波形）とトリガ
// =======================================================================

function isDigitalChannel(name) {
    return DIGITAL_CHANNELS.includes(name);
}

function isDigitalDisplayOn() {
    return currentModelId === 'agilent' && scopeState.isOn && digitalState.on;
}

// 画面の下半分に、繋がっているデジタル入力の波形を並べて描く（上から D7 → D0）
function drawDigitalChannels() {
    if (!isDigitalDisplayOn()) return;
    if (digitalState.dirty) rebuildDigitalData();

    const channels = DIGITAL_CHANNELS.filter(d => getDigitalConnection(d)).reverse();
    const areaTop = canvas.height * 0.42;
    const areaBottom = canvas.height - 95;   // メニューと下端の表示の上まで

    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    if (channels.length === 0) {
        ctx.fillStyle = DIGITAL_TRACE_COLOR;
        ctx.fillText('デジタル入力: DIGITAL の D0〜D7 をブレッドボードに繋ぐと、ここに波形が出ます', 20, areaTop + 30);
        ctx.restore();
        return;
    }

    const timeDiv = TIME_STEPS[scopeState.timeIndex];
    const triggerTime = calculateTriggerOffset();
    const centerTimeShift = (canvas.width / 2 / PIXELS_PER_DIV) * timeDiv - scopeState.horizontalDelay;
    const timeAt = x => (x / PIXELS_PER_DIV) * timeDiv + triggerTime - centerTimeShift;
    const rowHeight = Math.min(46, (areaBottom - areaTop) / channels.length);

    channels.forEach((d, row) => {
        const yHigh = areaTop + row * rowHeight + 6;
        const yLow = areaTop + (row + 1) * rowHeight - 8;

        ctx.fillStyle = DIGITAL_TRACE_COLOR;
        ctx.fillText(d, 6, (yHigh + yLow) / 2);

        ctx.strokeStyle = DIGITAL_TRACE_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const LEFT = 40;   // チャンネル名の分あける
        let prevY = null;
        for (let x = LEFT; x < canvas.width; x++) {
            const ta = timeAt(x), tb = timeAt(x + 1);
            const v = digitalValueAt(d, ta);
            if (v === 'X') {
                // 不定: 赤い帯
                ctx.stroke();
                ctx.fillStyle = 'rgba(255, 60, 60, 0.6)';
                ctx.fillRect(x, yHigh, 1, yLow - yHigh);
                ctx.beginPath();
                prevY = null;
                continue;
            }
            const y = v === 1 ? yHigh : yLow;   // 浮いている（Z）は L として表示
            if (prevY === null) ctx.moveTo(x, y);
            else if (prevY !== y) ctx.lineTo(x, y);
            ctx.lineTo(x + 1, y);
            // 1ピクセルの中に2回以上の変化（細いパルス）があれば、縦線で示す
            if (digitalEdgeCount(d, ta, tb) >= 2) {
                ctx.moveTo(x + 1, yHigh);
                ctx.lineTo(x + 1, yLow);
                ctx.moveTo(x + 1, y);
            }
            prevY = y;
        }
        ctx.stroke();
    });
    ctx.restore();
}

// トリガソースがデジタル入力のとき: 現在時刻より前で、最後に設定した向きに変化した時刻
function calculateDigitalTriggerTime() {
    const trigger = scopeState.trigger;
    const base = scopeState.timeOffset;
    if (digitalState.dirty) rebuildDigitalData();

    const data = digitalState.data;
    const ch = data && data.channels[trigger.source];
    const wanted = trigger.slope === 'falling' ? 0 : 1;
    const edges = ch && data.periodNs ? ch.edges.filter(e => e.v === wanted) : [];
    if (edges.length === 0) {
        trigger.isTriggered = false;
        return base;
    }

    const P = data.periodNs;
    const baseNs = base * 1e9;
    const periodStart = baseNs - phaseOf(baseNs, P);
    const phase = baseNs - periodStart;
    const before = edges.filter(e => e.t <= phase);
    const edgeNs = before.length > 0
        ? periodStart + before[before.length - 1].t
        : periodStart - P + edges[edges.length - 1].t;

    trigger.isTriggered = true;
    return edgeNs * 1e-9;
}


// =======================================================================
//  7. ボタン・メニュー・Entry ツマミ
// =======================================================================

// 画面下のメニューの中身を、今の設定値から作る（WaveGen・Digital・Trigger）。それ以外は null
function getDynamicMenu(name) {
    if (currentModelId !== 'agilent') return null;

    if (name === 'WaveGen') {
        const w = waveGenState;
        const wave = WAVEGEN_WAVEFORMS.find(x => x.id === w.waveform).name;
        const isDc = w.waveform === 'DC';
        return {
            title: `Wave Gen メニュー（出力 ${w.on ? 'ON' : 'OFF'}）`,
            color: '#ff8a65',
            selected: menuSelection.WaveGen,
            items: [
                `波形: ${wave}`,
                `周波数: ${isDc ? '---' : formatHz(w.freq)}`,
                `振幅: ${isDc ? '---' : w.amplitude.toFixed(2) + 'Vpp'}`,
                `${isDc ? 'DC レベル' : 'オフセット'}: ${w.offset.toFixed(2)}V`,
                `デューティ: ${w.waveform === 'SQUARE' ? w.duty + '%' : '---'}`,
                `出力: ${w.on ? 'ON' : 'OFF'}`,
            ],
        };
    }
    if (name === 'Digital') {
        const connected = DIGITAL_CHANNELS.filter(d => getDigitalConnection(d));
        return {
            title: 'デジタル・チャンネル・メニュー',
            color: DIGITAL_TRACE_COLOR,
            selected: null,
            items: [
                `表示: ${digitalState.on ? 'オン' : 'オフ'}`,
                `接続中: ${connected.length > 0 ? connected.join(' ') : 'なし'}`,
            ],
        };
    }
    if (name === 'Save') {
        return {
            title: '保存メニュー（画面を PNG で保存）',
            color: '#81c784',
            selected: null,
            items: [
                '形式: PNG 画像',
                `インク節約: ${saveState.inkSaver ? 'ON（白黒反転）' : 'OFF（カラー）'}`,
                '保存する ▶',
                `保存した数: ${saveState.log.length}`,
            ],
        };
    }
    if (name === 'Trigger') {
        const t = scopeState.trigger;
        return {
            title: 'トリガ・メニュー',
            color: 'rgba(255, 165, 0, 1)',
            selected: menuSelection.Trigger,
            items: [
                `ソース: ${t.source}`,
                `スロープ: ${t.slope === 'falling' ? '立ち下がり ↓' : '立ち上がり ↑'}`,
                `モード: Auto`,
            ],
        };
    }
    return null;
}

// トリガのソースに選べるもの（アナログの CH と、デジタル入力）
function getTriggerSources() {
    return [...(MODEL_CHANNELS[currentModelId] || ['CH1', 'CH2']), ...DIGITAL_CHANNELS];
}

// オシロのボタンのうち、このファイルで扱うもの。処理したら true
function handleDigitalOscButton(title, hotspot) {
    if (currentModelId !== 'agilent') return false;

    // [Wave Gen]: 出力の ON/OFF とメニュー表示
    if (title === 'WavaGen') {
        waveGenState.on = !waveGenState.on;
        hotspot.classList.toggle('active', waveGenState.on);
        scopeState.currentMenu = 'WaveGen';
        updateBreadboardSources();
        showWireStatus(waveGenState.on ? '📡 WaveGen 出力 ON（Gen Out）' : '🔇 WaveGen 出力 OFF');
        return true;
    }

    // [Digital]: デジタル入力の表示 ON/OFF
    if (title === 'Digital') {
        digitalState.on = !digitalState.on;
        digitalState.dirty = true;
        scopeState.currentMenu = digitalState.on ? 'Digital' : null;
        return true;
    }

    // [Save/Recall]: 保存メニューを開く / 閉じる
    if (title === 'SavaRecall') {
        scopeState.currentMenu = scopeState.currentMenu === 'Save' ? null : 'Save';
        return true;
    }

    // [Trigger]: トリガメニューを開く / 閉じる
    if (title === 'Trigger') {
        scopeState.currentMenu = scopeState.currentMenu === 'Trigger' ? null : 'Trigger';
        return true;
    }

    // ソフトキー（このファイルのメニューを開いているとき）
    const softIndex = ['Soft1', 'Soft2', 'Soft3', 'Soft4', 'Soft5', 'Soft6'].indexOf(title);
    if (softIndex < 0 || !getDynamicMenu(scopeState.currentMenu)) return false;
    const menu = scopeState.currentMenu;

    if (menu === 'WaveGen') {
        if (softIndex === 5) {
            waveGenState.on = !waveGenState.on;
            const key = document.querySelector('#model-agilent .hotspot[title="WavaGen"]');
            if (key) key.classList.toggle('active', waveGenState.on);
            updateBreadboardSources();
        } else {
            menuSelection.WaveGen = softIndex;   // Entry ツマミで変える項目を選ぶ
        }
    } else if (menu === 'Digital') {
        if (softIndex === 0) {
            digitalState.on = !digitalState.on;
            digitalState.dirty = true;
        }
    } else if (menu === 'Save') {
        if (softIndex === 1) saveState.inkSaver = !saveState.inkSaver;
        if (softIndex === 2) saveScopeImage();
    } else if (menu === 'Trigger') {
        if (softIndex === 0) {
            menuSelection.Trigger = 0;
            cycleTriggerSource(+1);
        } else if (softIndex === 1) {
            scopeState.trigger.slope = scopeState.trigger.slope === 'falling' ? 'rising' : 'falling';
        }
    }
    return true;
}

function cycleTriggerSource(direction) {
    const list = getTriggerSources();
    const i = list.indexOf(scopeState.trigger.source);
    scopeState.trigger.source = list[(i + direction + list.length) % list.length];
}

// Entry ツマミ（direction: +1 = 奥へ回した / -1 = 手前へ回した）
function handleEntryKnob(direction) {
    if (!scopeState.isOn) return;
    const menu = scopeState.currentMenu;

    if (menu === 'Trigger') {
        if (menuSelection.Trigger === 0) cycleTriggerSource(direction);
        return;
    }
    if (menu !== 'WaveGen') return;

    const w = waveGenState;
    switch (menuSelection.WaveGen) {
        case 0: {   // 波形
            const ids = WAVEGEN_WAVEFORMS.map(x => x.id);
            w.waveform = ids[(ids.indexOf(w.waveform) + direction + ids.length) % ids.length];
            if (w.waveform === 'SQUARE') w.freq = Math.min(w.freq, 10e6);
            break;
        }
        case 1: if (w.waveform !== 'DC') w.freq = stepFrequency(w.freq, direction); break;
        case 2: if (w.waveform !== 'DC') w.amplitude = round2(clamp(w.amplitude + 0.1 * direction, WAVEGEN_LIMITS.amplitude)); break;
        case 3: w.offset = round2(clamp(w.offset + 0.1 * direction, WAVEGEN_LIMITS.offset)); break;
        case 4: if (w.waveform === 'SQUARE') w.duty = clamp(w.duty + direction, WAVEGEN_LIMITS.duty); break;
    }
    updateBreadboardSources();
}


// =======================================================================
//  8. 波形の保存（Save/Recall）
//   [Save/Recall] → ソフトキー2 でインク節約（白黒反転）、ソフトキー3 で保存。
//   メニューを消した画面を PNG 画像としてダウンロードする（レポートに貼る用。教科書 図7・図9）
// =======================================================================

const saveState = {
    inkSaver: true,   // インク節約（黒背景を白に反転。教科書は白黒反転した図を求めている）
    log: [],          // 保存した記録 [{ freq: WaveGen の周波数, timeDiv, zoomed: 拡大した波形か }]
};

function saveScopeImage() {
    const screen = document.querySelector('#screen-agilent canvas');
    if (!screen) return;

    // メニューを消して描き直してから写す
    const menu = scopeState.currentMenu;
    scopeState.currentMenu = null;
    drawWaveform();
    const image = document.createElement('canvas');
    image.width = screen.width;
    image.height = screen.height;
    const g = image.getContext('2d');
    g.drawImage(screen, 0, 0);
    if (saveState.inkSaver) {
        // インク節約: 明るさを白黒反転する（黒い背景が白、波形が黒になる。教科書の図7のような見た目）
        const pixels = g.getImageData(0, 0, image.width, image.height);
        const d = pixels.data;
        for (let i = 0; i < d.length; i += 4) {
            const gray = 255 - Math.max(d[i], d[i + 1], d[i + 2]);
            d[i] = d[i + 1] = d[i + 2] = gray;
        }
        g.putImageData(pixels, 0, 0);
    }
    scopeState.currentMenu = menu;

    const timeDiv = TIME_STEPS[scopeState.timeIndex];
    saveState.log.push({ freq: waveGenState.freq, timeDiv, zoomed: timeDiv <= 1e-7 });

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const name = `scope_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_`
               + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${formatHz(waveGenState.freq)}.png`;
    const link = document.createElement('a');
    link.download = name;
    link.href = image.toDataURL('image/png');
    link.click();
    showWireStatus(`💾 波形を保存しました（${name}）`);
}


// =======================================================================
//  9. 回路の保存・読み込み
//   教科書 2-I-7 の最後「配線はそのままにしておく」→ 2-I-8 で同じカウンタ回路を使うため、
//   IC・ジャンパ線・機器の線（Gen Out・D0〜D7 など）をこのブラウザ（localStorage）に保存する
// =======================================================================

const CIRCUIT_STORAGE_KEY = 'vlab-breadboard-circuit';

function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

function saveBreadboardCircuit() {
    const leads = wiringState.connections
        .filter(c => c.bbTerminal)
        .map(c => ({ terminal: c.bbTerminal, side: BB_CONNECTABLE[c.bbTerminal].side, hole: bbBoard.getTerminalHole(c.bbTerminal) }));
    const ok = writeStorage(CIRCUIT_STORAGE_KEY, { board: bbBoard.getState(), leads, savedAt: Date.now() });
    showWireStatus(ok ? '💾 ブレッドボードの回路を保存しました' : '⚠️ このブラウザでは保存できませんでした');
}

function loadBreadboardCircuit() {
    const saved = readStorage(CIRCUIT_STORAGE_KEY);
    if (!saved) { showWireStatus('⚠️ 保存した回路がありません'); return; }
    applyCircuit(saved);
    showWireStatus('📂 保存した回路を読み込みました');
}

// 回路（{ board: ブレッドボードの状態, leads: 機器の線 }）を、今の回路と入れ替えて組む
function applyCircuit(circuit) {
    if (document.getElementById('bb-container').style.display === 'none') toggleEquipment('bb');

    wiringState.connections = wiringState.connections.filter(c => !c.bbTerminal);
    bbBoard.setState(circuit.board);
    (circuit.leads || []).forEach(({ terminal, side, hole }) => {
        if (!bbBoard.plugTerminal(terminal, hole)) return;
        wiringState.connections.push({
            type: 'bb', [side + 'Terminal']: terminal, bbTerminal: terminal,
            color: TERMINAL_COLORS[terminal] || LEAD_COLORS[terminal] || '#ffffff',
        });
    });
    cancelPendingTerminal();
    updateBreadboardSources();
    digitalState.dirty = true;
    redrawWires();
}

function clearBreadboardCircuit() {
    if (!confirm('ブレッドボードの IC・ジャンパ線・機器の線をすべて外します。よろしいですか？')) return;
    wiringState.connections = wiringState.connections.filter(c => !c.bbTerminal);
    bbBoard.setState({ ics: [], wires: [], power: {} });
    digitalState.dirty = true;
    redrawWires();
}


// -----------------------------------------------------------------------
//  9-2. カウンタ回路（教科書 2-I-7 の図6）を自動で組む
//   ・ブレッドボード上の帯の「🔧 カウンタ回路を組む」ボタン … 回路とオシロの線（Gen Out・D0〜D4）まで
//   ・隠しコマンド（入力欄の外でキーボードから打つ）
//       counter … ボタンと同じ
//       ready   … さらに、電源・WaveGen（方形波 1kHz 5Vpp 2.5V 20%）・Digital・トリガ（D4 立ち上がり）
//                 まで設定し、すぐに波形が見える状態にする（説明・動作確認用）
//   ・ブラウザの開発者ツールのコンソールから buildCounterCircuit() / buildCounterCircuit(true) でも呼べる
//
//   配置: 上のブロック（B1）の 10列目に U1、20列目に U2（どちらも TC74HC107AP）
//     U1: 1段目（Q0）・2段目（Q1）   U2: 3段目（Q2）・4段目（Q3）
//     クロック = U1 の 1CLK（E12）← Gen Out（C12）、D0（B12）
//     Q0 = F12 → D1（H12）   Q1 = F14 → D2（H14）   Q2 = F22 → D3（H22）   Q3 = F24 → D4（H24）
// -----------------------------------------------------------------------

const COUNTER_WIRE_COLORS = { power: '#e53935', ground: '#212121', signal: '#43a047' };

// 図6のカウンタ回路の内容を作る（applyCircuit に渡す形）
function makeCounterCircuit() {
    const used = new Set();
    // 指定した列にいちばん近い、まだ使っていない電源レールの穴
    const railHole = (strip, column) => {
        const refX = bbBoard.holes.find(h => h.id === `B1-A${column}`).x;
        const hole = bbBoard.holes
            .filter(h => h.strip === strip && !used.has(h.id))
            .sort((a, b) => Math.abs(a.x - refX) - Math.abs(b.x - refX))[0];
        used.add(hole.id);
        return hole.id;
    };
    const PLUS5_TOP = 'R1-1', PLUS5_BOTTOM = 'R2-1', GND = 'R2-0';   // B1 の上の +5V、下の +5V・GND
    const ics = [], wires = [];
    const wire = (a, b, kind) => wires.push({ a, b, color: COUNTER_WIRE_COLORS[kind] });

    [10, 20].forEach(c => {
        ics.push({ type: '74HC107', blockId: 'B1', column: c, flipped: false });
        // 上の列（E 行のピン）: 14 VCC, 13 1CLR̅, 11 2K, 9 2CLR̅, 8 2J → +5V
        [c, c + 1, c + 3, c + 5, c + 6].forEach(col => wire(`B1-D${col}`, railHole(PLUS5_TOP, col), 'power'));
        // 下の列（F 行のピン）: 1 1J, 4 1K → +5V、7 GND → GND
        [c, c + 3].forEach(col => wire(`B1-G${col}`, railHole(PLUS5_BOTTOM, col), 'power'));
        wire(`B1-G${c + 6}`, railHole(GND, c + 6), 'ground');
        // 1段目の Q（3番ピン, F 行 c+2）→ 2段目の CLK（10番ピン, E 行 c+4）
        wire(`B1-G${c + 2}`, `B1-C${c + 4}`, 'signal');
    });
    // U1 の 2Q（Q1）→ U2 の 1CLK
    wire('B1-G14', 'B1-C22', 'signal');

    const leads = [
        ['GenOut', 'B1-C12'], ['D0', 'B1-B12'],
        ['D1', 'B1-H12'], ['D2', 'B1-H14'], ['D3', 'B1-H22'], ['D4', 'B1-H24'],
    ].map(([terminal, hole]) => ({ terminal, side: BB_CONNECTABLE[terminal].side, hole }));

    return { board: { ics, wires, power: { SW1: false, SW2: false } }, leads };
}

// カウンタ回路を組む。fullSetup = true なら、オシロ・WaveGen・ロジアナの設定まで済ませる
function buildCounterCircuit(fullSetup = false) {
    applyCircuit(makeCounterCircuit());

    if (fullSetup) {
        // オシロ（Agilent）の電源
        if (currentModelId !== 'agilent') switchModelUI('agilent');
        if (!scopeState.isOn) {
            const powerKey = document.querySelector('#model-agilent .hotspot[title="電源ボタン"]');
            if (powerKey) handleOscButton('電源ボタン', powerKey);
        }
        // ブレッドボードの電源
        bbBoard.setPower('SW1', true);
        // WaveGen: 方形波 1kHz 5Vpp 2.5V デューティ 20%、出力 ON
        Object.assign(waveGenState, { on: true, waveform: 'SQUARE', freq: 1000, amplitude: 5, offset: 2.5, duty: 20 });
        const genKey = document.querySelector('#model-agilent .hotspot[title="WavaGen"]');
        if (genKey) genKey.classList.add('active');
        // ロジアナの表示、トリガは Q3（D4）の立ち上がり（7 → 8 で4段すべてが変わる）
        digitalState.on = true;
        scopeState.trigger.source = 'D4';
        scopeState.trigger.slope = 'rising';
        scopeState.timeIndex = TIME_STEPS.indexOf(0.002);
        scopeState.horizontalDelay = 0;
        scopeState.isRunning = true;
        scopeState.currentMenu = 'WaveGen';
        updateBreadboardSources();
        digitalState.dirty = true;
    }
    showWireStatus(fullSetup
        ? '🔧 カウンタ回路を組み、電源・WaveGen・ロジアナまで設定しました'
        : '🔧 カウンタ回路（図6）を組みました。SW1 を ON にし、WaveGen を設定すると動きます');
}

// 帯のボタンから: 今の回路を消すので確認してから
function buildCounterCircuitFromButton() {
    const hasCircuit = bbBoard.ics.length > 0 || bbBoard.wires.length > 0;
    if (hasCircuit && !confirm('今のブレッドボードの回路を外して、カウンタ回路（図6）を組みます。よろしいですか？')) return;
    buildCounterCircuit(false);
}

// 隠しコマンド: 入力欄の外で打った文字の最後が、コマンドの綴りと一致したら実行する
const HIDDEN_COMMANDS = {
    counter: () => buildCounterCircuit(false),
    ready:   () => buildCounterCircuit(true),
};
let typedKeys = '';
document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    typedKeys = (typedKeys + e.key.toLowerCase()).slice(-20);
    const name = Object.keys(HIDDEN_COMMANDS).find(cmd => typedKeys.endsWith(cmd));
    if (name) {
        typedKeys = '';
        HIDDEN_COMMANDS[name]();
    }
});


// =======================================================================
// 10. 実験の手引き（左の実験番号 → 実験4 で開く）
//   画面右下に出す小さなパネル。操作の邪魔にならないよう、開いたまま機器を操作できる。
//    ・手順: 教科書の手順を、この画面での操作に直したもの。済んだ手順には ✓ が付く（回路や設定を見て判定）
//    ・観測した真理値表: ロジアナの波形から、カウンタの値ごとの出力 Z を読み取ったもの（2-I-8）
//    ・測定結果の表: 教科書の表2・表3・表1。入力した値はこのブラウザに保存する
// =======================================================================

const RESULT_STORAGE_KEY = 'vlab-ic-results';
const MEASURE_FREQS = [1e3, 100e3, 1e6, 4e6, 10e6];
const RESULT_TABLES = {
    '2-I-7': [
        { id: 'table2', title: '表2 カウンタ回路の遅延時間 [ns]', cols: ['①', '②', '③', '④', '総遅延時間'] },
    ],
    '2-I-8': [
        { id: 'table3', title: '表3 組み合わせ回路（簡略化後）の遅延時間 [ns]', cols: ['Ⓐ', 'Ⓑ', 'Ⓑ−Ⓐ'], diff: true },
        { id: 'table1', title: '表1 組み合わせ回路（簡略化前・余裕があれば）[ns]', cols: ['Ⓐ', 'Ⓑ', 'Ⓑ−Ⓐ'], diff: true },
    ],
};
const results = readStorage(RESULT_STORAGE_KEY) || {};
let guideExperiment = '2-I-7';
let guideTimer = null;
// 一度済んだ手順は ✓ のままにする（電源を切るなど、後の手順で状態が戻っても進み具合が分かるように。↺ で消せる）
const guideDone = { '2-I-7': new Set(), '2-I-8': new Set() };

// --- ブレッドボードの回路を調べる（手順の ✓ に使う）---
function analyzeIcCircuit() {
    const nets = bbBoard.getNetlist();
    const pinNet = {};    // 'U1:1J' → ネット
    nets.forEach(n => n.pins.forEach(p => { pinNet[`${p.ic}:${p.name}`] = n; }));
    const netId = n => (n ? n.id : null);
    const hasRail = (n, rail) => Boolean(n && n.rails.includes(rail));
    const hasTerminal = (n, id) => Boolean(n && n.terminals.includes(id));
    const powerOk = ic => hasRail(pinNet[`${ic.id}:VCC`], '+5V') && hasRail(pinNet[`${ic.id}:GND`], 'GND');

    // JK フリップフロップ（74HC107 1個に2つ）
    const ic107 = bbBoard.ics.filter(ic => ic.type === '74HC107');
    const ffs = [];
    ic107.forEach(ic => [1, 2].forEach(u => {
        const pin = name => pinNet[`${ic.id}:${u}${name}`];
        ffs.push({ J: pin('J'), K: pin('K'), CLK: pin('CLK'), CLR: pin('CLR̅'), Q: pin('Q'), QN: pin('Q̅') });
    }));

    // 初段（Gen Out が CLK に来ている FF。無ければ、ほかの FF の Q が CLK に来ていない FF）から、Q → 次の CLK をたどる
    const isFedByOtherQ = f => ffs.some(g => g !== f && netId(g.Q) === netId(f.CLK));
    const first = ffs.find(f => hasTerminal(f.CLK, 'GenOut')) || ffs.find(f => f.CLK && !isFedByOtherQ(f));
    const chain = [];
    for (let cur = first; cur && chain.length < ffs.length && !chain.includes(cur);
         cur = ffs.find(g => g !== cur && g.CLK && netId(g.CLK) === netId(cur.Q))) {
        chain.push(cur);
    }
    const counter = chain.slice(0, 4);
    const qNets = counter.map(f => netId(f.Q));

    // 組み合わせ回路（74HC04・08・32）
    const gateIcs = bbBoard.ics.filter(ic => ic.type !== '74HC107');
    const gateInputNets = new Set(), gateOutputNets = new Set();
    gateIcs.forEach(ic => BB_IC_MODELS[ic.type].units.forEach(u => {
        u.in.forEach(name => { const n = pinNet[`${ic.id}:${name}`]; if (n) gateInputNets.add(n.id); });
        const out = pinNet[`${ic.id}:${u.out}`];
        if (out) gateOutputNets.add(out.id);
    }));
    const probeNet = d => nets.find(n => n.terminals.includes(d));

    return {
        ic107Count: ic107.length,
        powerOk107: ic107.length > 0 && ic107.every(powerOk),
        jkclrOk: counter.length === 4 && counter.every(f => hasRail(f.J, '+5V') && hasRail(f.K, '+5V') && hasRail(f.CLR, '+5V')),
        chainOk: counter.length === 4,
        genToClk: Boolean(first && hasTerminal(first.CLK, 'GenOut')),
        probesOk: counter.length === 4 && netId(probeNet('D0')) === netId(first.CLK)
                  && counter.every((f, i) => netId(probeNet(`D${i + 1}`)) === netId(f.Q)),
        gateIcCount: gateIcs.length,
        gatePowerOk: gateIcs.length > 0 && gateIcs.every(powerOk),
        qToGates: counter.length === 4 && qNets.every(id => gateInputNets.has(id)),
        zProbeOk: Boolean(probeNet('D5') && gateOutputNets.has(probeNet('D5').id)),
    };
}

// ロジアナの波形から、カウンタの値（D1〜D4 = Q0〜Q3）ごとの出力 Z（D5）を読み取る。読めなければ null
function observeTruthTable() {
    if (!(scopeState.isOn && waveGenState.on) || waveGenState.waveform === 'DC') return null;
    if (!['D1', 'D2', 'D3', 'D4', 'D5'].every(d => getDigitalConnection(d))) return null;
    if (digitalState.dirty) rebuildDigitalData();
    const data = digitalState.data;
    if (!data || !data.periodNs) return null;

    const T = 1e9 / waveGenState.freq;
    const table = {};
    for (let j = 0; j < Math.round(data.periodNs / T); j++) {
        const t = (j + 0.95) * T * 1e-9;   // 各クロック周期の終わり近く（変化が落ち着いたところ）
        const bits = ['D1', 'D2', 'D3', 'D4'].map(d => digitalValueAt(d, t));
        if (bits.some(b => b !== 0 && b !== 1)) continue;
        const count = bits.reduce((sum, b, i) => sum + (b << i), 0);
        const z = digitalValueAt('D5', t);
        table[count] = (table[count] === undefined || table[count] === z) ? z : 'X';
    }
    return table;
}

// --- 手順（[説明, 済んだか]。済んだかが null の手順は、画面からは判定しない）---
function waveGenMatchesTextbook() {
    const w = waveGenState;
    return scopeState.isOn && w.on && w.waveform === 'SQUARE' && w.amplitude === 5 && w.offset === 2.5 && w.duty === 20;
}
function savedAt(freq) {
    return saveState.log.some(l => Math.abs(l.freq - freq) < 1e-6);
}
function filledRows(tableId) {
    const t = results[tableId] || {};
    return MEASURE_FREQS.filter(f => Object.values(t[f] || {}).some(v => v !== '')).length;
}
function isCircuitSaved() {
    return Boolean(readStorage(CIRCUIT_STORAGE_KEY));
}

function getGuideSteps(exp) {
    const c = analyzeIcCircuit();
    const bbShown = document.getElementById('bb-container').style.display !== 'none';
    const timeDiv = TIME_STEPS[scopeState.timeIndex];
    const triggerSet = isDigitalChannel(scopeState.trigger.source) && scopeState.trigger.isTriggered;

    if (exp === '2-I-7') return [
        { head: '機器の確認' },
        ['右の「実験器具」から 🧩 ブレッドボードを出す', bbShown],
        ['オシロスコープ（Agilent）の電源を入れる', scopeState.isOn && currentModelId === 'agilent'],
        { head: '手順1：カウンタ回路の配線（図6）' },
        ['部品箱から TC74HC107AP を2個、中央の溝をまたぐように挿す', c.ic107Count >= 2],
        ['各 IC の 14番ピン（VCC）を +5V、7番ピン（GND）を GND のレールへ', c.ic107Count >= 2 && c.powerOk107],
        ['初段の Q0 → 2段目の CLK、Q1 → 3段目の CLK、Q2 → 4段目の CLK とつなぐ', c.chainOk],
        ['4つの FF の J・K・CLR̅ をすべて +5V へ（J=K=1 で反転、CLR̅=1 でクリアしない）', c.jkclrOk],
        ['オシロの Gen Out をクリック → 初段の CLK の列の穴をクリック', c.genToClk],
        ['DIGITAL の D0 → Clock（初段の CLK）、D1〜D4 → Q0〜Q3', c.probesOk],
        ['ブレッドボードの SW1（+5V）を ON', bbBoard.power.SW1],
        { head: '手順2：遅延時間の測定' },
        ['[Wave Gen] を押し、ソフトキーと Entry ツマミで 方形波・5.00Vpp・2.50V・デューティ 20% に（周波数は 1kHz から）', waveGenMatchesTextbook()],
        ['[Digital] で波形を表示し、Q0〜Q3 が 0〜15 を数えているか確認（図7）', isDigitalDisplayOn() && c.probesOk],
        ['[Save/Recall] → 保存する で、1kHz の全体波形を保存', savedAt(1e3)],
        ['[Trigger] でソースとスロープを決めて波形を止める（例: Q3（D4）の立ち上がりで 7→8 の変化を見る）', triggerSet],
        ['時間ツマミで 5〜10ns/目盛に拡大し、水平位置ツマミと Cursr（A・B）で ①〜④・総遅延時間を測る（図8・図9）', triggerSet && timeDiv <= 2e-8 && scopeState.cursor.show],
        ['測った値を下の表2に記録し、拡大した波形も保存する', filledRows('table2') >= 1 && saveState.log.some(l => l.zoomed)],
        ['周波数を 100kHz・1MHz・4MHz・10MHz に変えて同様に測る（4MHz は全体波形も保存）', filledRows('table2') >= 5 && savedAt(4e6)],
        ['ブレッドボードの SW1 と WaveGen の出力を OFF。配線はそのまま「💾 回路を保存」', !bbBoard.power.SW1 && !waveGenState.on && isCircuitSaved(), 'final'],
    ];

    return [
        { head: '機器の確認' },
        ['ブレッドボードを出し、オシロスコープ（Agilent）の電源を入れる', bbShown && scopeState.isOn && currentModelId === 'agilent'],
        ['2-I-7 のカウンタ回路を用意する（「📂 保存した回路を読み込む」）', c.chainOk && c.jkclrOk && c.powerOk107],
        { head: '手順1：組み合わせ回路（簡略化後）の配線' },
        ['配布された真理値表から論理式を作り、カルノー図で簡略化した回路を設計する（予習2）', null],
        ['TC74HC04AP・08AP・32AP を必要な数だけ挿し、それぞれ VCC・GND を配線', c.gateIcCount >= 1 && c.gatePowerOk],
        ['組み合わせ回路の4入力に、カウンタの Q0〜Q3 をつなぐ', c.qToGates],
        ['D0 → Clock、D1〜D4 → Q0〜Q3、D5 → 組み合わせ回路の出力 Z', c.probesOk && c.zProbeOk],
        ['ブレッドボードの SW1 を ON、WaveGen を 方形波・1kHz・5.00Vpp・2.50V・20% に', bbBoard.power.SW1 && waveGenMatchesTextbook()],
        { head: '手順2：動作の確認と遅延時間の測定' },
        ['[Digital] で Clock・Q0〜Q3・Z を表示し、下の「観測した真理値表」が配布の真理値表と同じか確認', isDigitalDisplayOn() && Boolean(observeTruthTable())],
        ['1kHz と 4MHz の全体波形を保存', savedAt(1e3) && savedAt(4e6)],
        ['Ⓐ（Clock → Q3）と Ⓑ（Clock → Z）を測り、表3に記録（図10。Ⓑ−Ⓐ は自動で計算）', filledRows('table3') >= 1],
        ['周波数を 100kHz・1MHz・4MHz・10MHz に変えて同様に測る', filledRows('table3') >= 5],
        ['ブレッドボードの SW1 と WaveGen の出力を OFF', !bbBoard.power.SW1 && !waveGenState.on, 'final'],
        { head: '余裕があれば：簡略化前（特殊加法標準形）の回路' },
        ['簡略化前の回路に組み替え、前週と同じ変化の箇所で Ⓐ・Ⓑ を測って表1に記録', filledRows('table1') >= 1],
    ];
}

// --- パネルの作成 ---
const guidePanel = document.createElement('div');
guidePanel.id = 'ic-guide';
guidePanel.className = 'ic-guide';
guidePanel.hidden = true;
guidePanel.innerHTML = `
    <div class="ic-guide-head">
        <span class="ic-guide-title">実験4 汎用IC の手引き</span>
        <span class="ic-guide-buttons">
            <button type="button" data-exp="2-I-7" title="カウンタ回路">2-I-7</button>
            <button type="button" data-exp="2-I-8" title="組み合わせ回路">2-I-8</button>
            <button type="button" data-action="reset" title="✓ を消して最初から">↺</button>
            <button type="button" data-action="min" title="たたむ / ひろげる">―</button>
            <button type="button" data-action="close" title="閉じる">✕</button>
        </span>
    </div>
    <div class="ic-guide-body">
        <ol class="ic-guide-steps"></ol>
        <div class="ic-guide-truth"></div>
        <div class="ic-guide-tables"></div>
    </div>`;
document.body.appendChild(guidePanel);

guidePanel.querySelectorAll('[data-exp]').forEach(b => b.addEventListener('click', () => openIcGuide(b.dataset.exp)));
guidePanel.querySelector('[data-action="min"]').addEventListener('click', () => guidePanel.classList.toggle('ic-guide-min'));
guidePanel.querySelector('[data-action="close"]').addEventListener('click', closeIcGuide);
guidePanel.querySelector('[data-action="reset"]').addEventListener('click', () => {
    guideDone[guideExperiment].clear();
    renderGuideProgress();
});

function openIcGuide(exp) {
    guideExperiment = exp;
    guidePanel.hidden = false;
    guidePanel.classList.remove('ic-guide-min');
    guidePanel.querySelectorAll('[data-exp]').forEach(b => b.classList.toggle('active', b.dataset.exp === exp));
    document.getElementById('experiment-sidebar').classList.remove('open');
    renderGuideTables();
    renderGuideProgress();
    if (!guideTimer) guideTimer = setInterval(renderGuideProgress, 700);
}

function closeIcGuide() {
    guidePanel.hidden = true;
    clearInterval(guideTimer);
    guideTimer = null;
}

// 手順の ✓ と観測した真理値表（0.7秒ごとに描き直す）
function renderGuideProgress() {
    if (guidePanel.hidden || guidePanel.classList.contains('ic-guide-min')) return;
    const steps = getGuideSteps(guideExperiment);
    const doneSet = guideDone[guideExperiment];
    let n = 0;
    guidePanel.querySelector('.ic-guide-steps').innerHTML = steps.map(step => {
        if (step.head) return `<li class="ic-guide-section">${step.head}</li>`;
        const [text, nowDone, kind] = step;
        // 片付けの手順（電源を切る）は、それより前の手順がすべて済んでから ✓ を付ける
        const index = n;
        const previousDone = [...Array(index).keys()].every(i => doneSet.has(i) || stepIsManual(steps, i));
        if (nowDone && (kind !== 'final' || previousDone)) doneSet.add(index);
        const done = nowDone === null ? null : doneSet.has(index);
        const mark = done === null ? '・' : done ? '✓' : '□';
        return `<li class="${done ? 'done' : ''}"><span class="ic-guide-mark">${mark}</span>${++n}. ${text}</li>`;
    }).join('');

    const truth = guidePanel.querySelector('.ic-guide-truth');
    if (guideExperiment !== '2-I-8') { truth.innerHTML = ''; return; }
    const table = observeTruthTable();
    const cell = v => v === 1 ? '1' : v === 0 ? '0' : v === undefined ? '' : '?';
    truth.innerHTML = '<h4>観測した真理値表（Q3 Q2 Q1 Q0 → Z）</h4>' + (table
        ? '<table class="ic-guide-table ic-truth"><tr>' + Array.from({ length: 16 }, (_, k) =>
            `<td><small>${k.toString(2).padStart(4, '0')}</small><br><b>${cell(table[k])}</b></td>${k % 8 === 7 && k < 15 ? '</tr><tr>' : ''}`).join('') + '</tr></table>'
        : '<p class="ic-guide-note">D0〜D5 をつなぎ、WaveGen の出力とブレッドボードの電源を入れると、ここに表示されます。</p>');
}

// 画面から判定しない手順か（i は見出しを除いた手順の番号）
function stepIsManual(steps, i) {
    const list = steps.filter(s => !s.head);
    return list[i] && list[i][1] === null;
}

// 測定結果の表（教科書の表2・表3・表1）。入力した値はこのブラウザに保存する
function renderGuideTables() {
    const box = guidePanel.querySelector('.ic-guide-tables');
    box.innerHTML = RESULT_TABLES[guideExperiment].map(t => `
        <h4>${t.title} <button type="button" class="ic-copy" data-table="${t.id}">表をコピー</button></h4>
        <table class="ic-guide-table" data-table="${t.id}">
            <tr><th>周波数</th>${t.cols.map(c => `<th>${c}</th>`).join('')}</tr>
            ${MEASURE_FREQS.map(f => `<tr><th>${formatHz(f).replace('.000', '')}</th>${t.cols.map((c, i) =>
                t.diff && i === 2
                    ? `<td class="ic-diff" data-freq="${f}"></td>`
                    : `<td><input type="number" step="0.1" data-freq="${f}" data-col="${i}" value="${((results[t.id] || {})[f] || {})[i] || ''}"></td>`).join('')}</tr>`).join('')}
        </table>`).join('');
    box.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
        const id = input.closest('table').dataset.table;
        results[id] = results[id] || {};
        results[id][input.dataset.freq] = results[id][input.dataset.freq] || {};
        results[id][input.dataset.freq][input.dataset.col] = input.value;
        writeStorage(RESULT_STORAGE_KEY, results);
        updateDiffCells();
    }));
    box.querySelectorAll('.ic-copy').forEach(b => b.addEventListener('click', () => copyResultTable(b.dataset.table)));
    updateDiffCells();
}

// Ⓑ−Ⓐ を計算して表示する
function updateDiffCells() {
    guidePanel.querySelectorAll('.ic-diff').forEach(td => {
        const row = ((results[td.closest('table').dataset.table] || {})[td.dataset.freq]) || {};
        const a = parseFloat(row[0]), b = parseFloat(row[1]);
        td.textContent = isNaN(a) || isNaN(b) ? '' : (b - a).toFixed(1);
    });
}

// 表をタブ区切りでコピーする（Excel やレポートに貼り付けられる）
function copyResultTable(tableId) {
    const t = RESULT_TABLES[guideExperiment].find(x => x.id === tableId);
    const rows = [['周波数', ...t.cols]];
    MEASURE_FREQS.forEach(f => {
        const row = (results[tableId] || {})[f] || {};
        rows.push([formatHz(f).replace('.000', ''), ...t.cols.map((c, i) => {
            if (t.diff && i === 2) {
                const a = parseFloat(row[0]), b = parseFloat(row[1]);
                return isNaN(a) || isNaN(b) ? '' : (b - a).toFixed(1);
            }
            return row[i] || '';
        })]);
    });
    const text = rows.map(r => r.join('\t')).join('\n');
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(
            () => showWireStatus('📋 表をコピーしました（Excel などに貼り付けられます）'),
            () => showWireStatus('⚠️ コピーできませんでした'));
    }
}


// =======================================================================
// 11. 起動処理
// =======================================================================

bbBoard.onChange(onBreadboardChanged);
renderBreadboardStatus();
