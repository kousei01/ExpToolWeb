// =======================================================================
//  ロジックシミュレータ  logic-sim.js
//
//  ブレッドボード上の回路（どのネットに何がつながっているか）を受け取り、
//  時間を ns 単位で進めながら各ネットの論理値の変化を計算する（イベント駆動）。
//  画面（DOM）には触らないので、単体でもテストできる。
//
//  【値の種類】
//    0 … L     1 … H
//    'X' … 不定（ショート・浮いた入力・電圧が中途半端など）
//    'Z' … どこからも駆動されていない（ネットの値としてのみ使う。入力として読むと 'X'）
//
//  【回路の形】 simulateLogic(circuit, durationNs)
//    circuit = {
//      netCount: ネットの数（0 〜 netCount-1 の番号で指定する）,
//      fixed:   [{ net, value }]                         … 電源レールなど、ずっと同じ値を出すもの
//      sources: [{ net, kind: 'square', periodNs, highNs, high, low }]   … 方形波（t=0 で high から始まる）
//               [{ net, kind: 'constant', value }]
//      gates:   [{ fn: 'NOT' | 'AND' | 'OR', inputs: [net...], output: net, delayNs }]
//      flipflops: [{ kind: 'JK', j, k, clk, clr, q, qn, clkToQNs, clrToQNs, init: 0 | 1 }]
//                 … 立ち下がりで動作、CLR̅ は L で Q=0（非同期）
//    }
//
//  【返り値】
//    { traces: [ネットごとの [{ t, v }]（値が変わった時刻と新しい値。最初は t=0）],
//      conflicts: [{ net, t }]（0 と 1 がぶつかった＝ショートしたネットと最初の時刻）,
//      truncated: イベントが多すぎて途中で打ち切ったら true }
//
//  【遅延の扱い】
//    慣性遅延: 出力が変わる前に入力が戻ったら、その変化は出さない（遅延より短いパルスは消える）
// =======================================================================

const LOGIC_MAX_EVENTS = 400000;

function simulateLogic(circuit, durationNs, options = {}) {
    const maxEvents = options.maxEvents || LOGIC_MAX_EVENTS;
    const netCount = circuit.netCount;

    // -------------------------------------------------------------------
    //  ドライバ（ネットに値を出すもの）と、ネットを読む素子の対応表
    // -------------------------------------------------------------------
    const drivers = [];                                          // { net, value, pendingSeq, pendingValue }
    const netDrivers = Array.from({ length: netCount }, () => []);
    const netReaders = Array.from({ length: netCount }, () => []);
    function addDriver(net, value) {
        const d = drivers.length;
        drivers.push({ net, value, pendingSeq: -1, pendingValue: undefined });
        netDrivers[net].push(d);
        return d;
    }

    const elements = [];
    function addElement(e, inputNets) {
        elements.push(e);
        [...new Set(inputNets)].forEach(n => netReaders[n].push(e));
    }

    (circuit.fixed || []).forEach(f => addDriver(f.net, f.value));

    const sources = (circuit.sources || []).map(s => {
        const initial = s.kind === 'square' ? (s.highNs > 0 ? s.high : s.low) : s.value;
        return { ...s, driver: addDriver(s.net, initial) };
    });

    (circuit.gates || []).forEach(g => {
        addElement({ type: 'gate', fn: g.fn, inputs: g.inputs, delay: g.delayNs, out: addDriver(g.output, 'X') }, g.inputs);
    });

    (circuit.flipflops || []).forEach(f => {
        const init = f.init === 1 ? 1 : 0;
        addElement({
            type: 'jk', j: f.j, k: f.k, clk: f.clk, clr: f.clr,
            dClk: f.clkToQNs, dClr: f.clrToQNs,
            state: init, prevClk: null,
            q: addDriver(f.q, init), qn: addDriver(f.qn, 1 - init),
        }, [f.j, f.k, f.clk, f.clr]);
    });

    // -------------------------------------------------------------------
    //  イベントの待ち行列（時刻の早い順に取り出す二分ヒープ）
    // -------------------------------------------------------------------
    const heap = [];
    let seq = 0;
    const before = (a, b) => a.t < b.t || (a.t === b.t && a.seq < b.seq);
    function push(ev) {
        ev.seq = ++seq;
        heap.push(ev);
        let i = heap.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (!before(heap[i], heap[p])) break;
            [heap[i], heap[p]] = [heap[p], heap[i]];
            i = p;
        }
        return ev.seq;
    }
    function pop() {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length > 0) {
            heap[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < heap.length && before(heap[l], heap[m])) m = l;
                if (r < heap.length && before(heap[r], heap[m])) m = r;
                if (m === i) break;
                [heap[i], heap[m]] = [heap[m], heap[i]];
                i = m;
            }
        }
        return top;
    }

    // 素子の出力を delay 後に変える予約（慣性遅延）
    function scheduleOutput(d, value, t) {
        const drv = drivers[d];
        if (drv.pendingSeq !== -1) {
            if (drv.pendingValue === value) return;   // 同じ変化がすでに予約済み
            drv.pendingSeq = -1;                      // 逆向きの予約は取り消す（短いパルスは消える）
        }
        if (drv.value === value) return;
        drv.pendingValue = value;
        drv.pendingSeq = push({ t, d, v: value, kind: 'output' });
    }

    // 方形波の次の切り替わりを予約
    function scheduleSourceEdge(src, now) {
        if (src.kind !== 'square' || src.high === src.low) return;
        const k = Math.floor(now / src.periodNs + 1e-9);
        const fall = k * src.periodNs + src.highNs;
        const rise = (k + 1) * src.periodNs;
        if (src.highNs > 0 && src.highNs < src.periodNs) {
            if (now < fall - 1e-9) push({ t: fall, d: src.driver, v: src.low, kind: 'source', src });
            else push({ t: rise, d: src.driver, v: src.high, kind: 'source', src });
        }
    }

    // -------------------------------------------------------------------
    //  ネットの値の決定と、素子の計算
    // -------------------------------------------------------------------
    const netValue = new Array(netCount).fill('Z');
    const traces = Array.from({ length: netCount }, () => []);
    const conflicts = [];
    const conflictSeen = new Set();

    function resolve(net) {
        let has0 = false, has1 = false, hasX = false;
        for (const d of netDrivers[net]) {
            const v = drivers[d].value;
            if (v === 0) has0 = true;
            else if (v === 1) has1 = true;
            else if (v === 'X') hasX = true;
        }
        return { value: (has0 && has1) || hasX ? 'X' : has0 ? 0 : has1 ? 1 : 'Z', conflict: has0 && has1 };
    }
    const readInput = net => { const v = netValue[net]; return v === 'Z' ? 'X' : v; };

    const NOT = v => v === 0 ? 1 : v === 1 ? 0 : 'X';
    const GATE_FN = {
        NOT: ins => NOT(ins[0]),
        AND: ins => ins.includes(0) ? 0 : ins.every(v => v === 1) ? 1 : 'X',
        OR:  ins => ins.includes(1) ? 1 : ins.every(v => v === 0) ? 0 : 'X',
    };
    function jkNext(q, j, k) {
        if (j === 0 && k === 0) return q;
        if (j === 0 && k === 1) return 0;
        if (j === 1 && k === 0) return 1;
        if (j === 1 && k === 1) return q === 'X' ? 'X' : 1 - q;
        return 'X';
    }

    function evaluate(e, now) {
        if (e.type === 'gate') {
            scheduleOutput(e.out, GATE_FN[e.fn](e.inputs.map(readInput)), now + e.delay);
            return;
        }
        // JK フリップフロップ（立ち下がりで動作、CLR̅ が L なら Q=0）
        const clr = readInput(e.clr), clk = readInput(e.clk);
        let delay = e.dClk;
        if (clr === 0 || clr === 'X') {
            e.state = clr === 0 ? 0 : 'X';
            delay = e.dClr;
        } else if (e.prevClk === 1 && clk === 0) {
            e.state = jkNext(e.state, readInput(e.j), readInput(e.k));
        } else if (e.prevClk !== null && e.prevClk !== clk && (e.prevClk === 'X' || clk === 'X')) {
            e.state = 'X';   // クロックが不定 → 動いたかどうか分からない
        }
        e.prevClk = clk;
        scheduleOutput(e.q, e.state, now + delay);
        scheduleOutput(e.qn, NOT(e.state), now + delay);
    }

    // 変化したネットを確定し、それを読む素子を計算し直す
    function settle(changedNets, now) {
        const dirty = new Set();
        changedNets.forEach(net => {
            const r = resolve(net);
            if (r.conflict && !conflictSeen.has(net)) {
                conflictSeen.add(net);
                conflicts.push({ net, t: now });
            }
            if (r.value !== netValue[net]) {
                netValue[net] = r.value;
                traces[net].push({ t: now, v: r.value });
                netReaders[net].forEach(e => dirty.add(e));
            }
        });
        return dirty;
    }

    // -------------------------------------------------------------------
    //  実行
    // -------------------------------------------------------------------
    // t = 0: 電源を入れた瞬間。すべてのネットを決め、すべての素子を一度計算する
    for (let n = 0; n < netCount; n++) {
        const r = resolve(n);
        netValue[n] = r.value;
        traces[n].push({ t: 0, v: r.value });
        if (r.conflict) { conflictSeen.add(n); conflicts.push({ net: n, t: 0 }); }
    }
    elements.forEach(e => evaluate(e, 0));
    sources.forEach(s => scheduleSourceEdge(s, 0));

    let events = 0, truncated = false;
    while (heap.length > 0 && heap[0].t <= durationNs) {
        const now = heap[0].t;
        const changed = new Set();
        while (heap.length > 0 && heap[0].t === now) {
            const ev = pop();
            const drv = drivers[ev.d];
            if (ev.kind === 'output') {
                if (drv.pendingSeq !== ev.seq) continue;   // 取り消された予約
                drv.pendingSeq = -1;
            } else {
                scheduleSourceEdge(ev.src, now);
            }
            if (drv.value !== ev.v) {
                drv.value = ev.v;
                changed.add(drv.net);
            }
            if (++events > maxEvents) { truncated = true; break; }
        }
        settle(changed, now).forEach(e => evaluate(e, now));
        if (truncated) break;
    }

    return { traces, conflicts, truncated, finalValues: netValue.slice() };
}

// あるネットの trace から、時刻 t の値を取り出す
function logicValueAt(trace, t) {
    let v = 'Z';
    for (const p of trace) {
        if (p.t > t) break;
        v = p.v;
    }
    return v;
}

if (typeof module !== 'undefined') module.exports = { simulateLogic, logicValueAt };
