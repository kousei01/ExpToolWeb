// =======================================================================
//  script.js (メニュー・ズーム・ツマミ操作 完全統合版)
// =======================================================================

// --- 1. グローバル変数と初期設定 ---

let currentModelId = 'agilent';
let canvas = document.querySelector('#canvas-agilent');
let ctx = canvas.getContext('2d');
let tooltip = document.querySelector('#tooltip-agilent');

// ステップ（刻み）の定義 (1, 2, 5 の法則)
const VOLT_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
const TIME_STEPS = [
    0.000001, 0.000002, 0.000005,   // 1us, 2us, 5us  (AD/DA内部クロック等の高速信号用)
    0.00001, 0.00002, 0.00005,      // 10us, 20us, 50us
    0.0001, 0.0002, 0.0005,         // 100us, 200us, 500us
    0.001, 0.002, 0.005,            // 1ms, 2ms, 5ms  (従来の最小値はここから)
    0.01, 0.02, 0.05,
    0.1, 0.2, 0.5,
    1.0
];

// オシロスコープの状態管理
const scopeState = {
    isOn: false,      // 電源の状態
    isRunning: true,  // 波形の動き
    activeChannel: 'CH1',
    inputSource: 'internal', // 入力信号のソース ('internal' または 'power_supply')
    
    voltIndexCH1: 6,     // CH1の電圧 (初期値 1V)
    voltIndexCH2: 6,     // CH2の電圧 (初期値 1V)
    timeIndex: 15,    // 初期値: TIME_STEPS[15] = 0.1s (=100ms)
    
    timeOffset: 0,    // 波形アニメーション用
    currentMenu: null, // 表示中のメニュー
    showMeasure: false, // 自動計測表示のON/OFF

    positionCH1: 0, // CH1の上下位置オフセット（初期値0）
    positionCH2: 0, // CH2の上下位置オフセット（初期値0）

    cursor: {
        show: false,       // カーソルのON/OFF
        type: 'time',      // 'time'(縦線) または 'volt'(横線)
        posA: 150,         // カーソルAのCanvas上のX座標(初期値)
        posB: 350,         // カーソルBのCanvas上のX座標(初期値)
        target: 'A'    // ★現在ツマミで動かせる対象（'A' または 'B'）
    },

    trigger: {
        level: 4.0,       // トリガーレベル (V)
        slope: 'rising',  // 立ち上がり ('rising') か 立下り ('falling')
        source: 'CH1',    // トリガーソース
        isTriggered: false, // トリガーがかかっているかどうかのフラグ

        lastOffset: 0,   // 最後にトリガが成功したときの位置
        lossTimer: 0     // トリガを見失ってからの経過フレーム数
    },


    signals: {
        'CH1': { type: 'sine', amplitude: 2.0, frequency: 50 }, // 初期値: 正弦波, 2V
        'CH2': { type: 'sine', amplitude: 2.0, frequency: 50 },  // 初期値: 正弦波, 2V
    },

    ad_da: {
        mode: true,          // AD/DAモードかどうか
        resolution: 8,       // ビット数 (4 or 8)
        samplingPeriod: 5,   // サンプリング周期 [µs] (5 ~ 500)
        inputFreq: 1000      // 入力周波数 [Hz]
    }

};


// ==========================================
// 直流電源 (GPD-4303S) の状態管理
// ==========================================
const psState = {
    isOn: false,          // 電源のON/OFF
    isOutputOn: false,    // OUTPUTボタンのON/OFF
    activeChannel: 'CH1', // 現在操作中のチャンネル (CH1 or CH2)
    
    // 各チャンネルの設定値
    ch1: { voltage: 0.0, current: 0.00 },
    ch2: { voltage: 0.0, current: 0.00 },
};




// メニューの内容データ
// --- ★変更: Hantek用のメニュー定義 (DSO5000/2000系を想定) ---
const menuDataHantek = {
    "CH1_MENU": {
        title: "CH1", // HantekはシンプルにCH1と出る
        items: [
            "Coupling: DC",      // カップリング
            "BW Limit: Off",     //帯域制限
            "Volts/Div: Coarse", // 感度調整
            "Probe: 10X",        // プローブ減衰比
            "Invert: Off",       // 反転
            "Next Page"          // 次ページがあるのが特徴
        ]
    },
    "CH2_MENU": {
        title: "CH2",
        items: ["Coupling: AC", "BW Limit: Off", "Volts/Div: Coarse", "Probe: 10X", "Invert: Off", "Next Page"]
    },
    "Measure": {
        title: "MEASURE",
        items: ["Source: CH1", "Type: Voltage", "Type: Time", "Clear: None", "Window: Main"]
    },
    "Acquire": {
        title: "ACQUIRE",
        items: ["Mode: Sample", "Peak Detect", "Average", "Averages: 4", "Sa Rate: 500MSa"]
    }
};

// --- ★変更: Agilent (Keysight)用のメニュー定義 (InfiniiVision系を想定) ---
const menuDataAgilent = {
    "CH1_MENU": {
        title: "Vertical (CH1)", // Agilentは少し詳細
        items: [
            "Coupling: DC",
            "Imped: 1M Ohm",     // インピーダンス設定がある
            "BW Limit: Off",
            "Vernier: Off",      // 微調整をVernierと呼ぶ
            "Probe",             // 押してサブメニューを開く形式
            "Invert: Off"
        ]
    },
    "CH2_MENU": {
        title: "Vertical (CH2)",
        items: ["Coupling: DC", "Imped: 1M Ohm", "BW Limit: Off", "Vernier: Off", "Probe", "Invert: Off"]
    },
    "Measure": {
        title: "Measure Menu",
        items: ["Source: 1", "Type: Frequency", "Settings", "Clear Meas", "Statistics", "Thresholds"]
    },
    "Acquire": {
        title: "Acquire Menu",
        items: ["Mode: Normal", "Peak Detect", "Averaging", "High Res", "Segmneted"] // Agilent特有のHigh Resなど
    }
};
// ボタン説明文
const descriptions = {
    "電源ボタン": "電源をオン・オフします。",
    "F1": "画面メニューの選択ボタン。",
    "F2": "画面メニューの選択ボタン。",
    "F3": "画面メニューの選択ボタン。",
    "F4": "画面メニューの選択ボタン。",
    "F5": "画面メニューの選択ボタン。",
    "AutoSet": "波形が見やすくなるよう自動設定します。",
    "RunStop": "波形の動きを止めたり再開したりします。",
    "Single": "一度だけ波形を取り込んで止めます。",
    "SaveRecall": "設定や波形データの保存・呼び出しを行います。",
    "Measure": "数値を自動計測して表示します。",
    "Acquire": "波形の取り込み方を設定します。",
    "Utility": "システム設定を行います。",
    "Cursor": "手動計測を行います。",
    "Display": "表示方法を変更します。",
    "CH1_MENU": "CH1の詳細設定を行います。",
    "CH2_MENU": "CH2の詳細設定を行います。",
    "CH3_MENU": "CH3の詳細設定を行います。",
    "CH4_MENU": "CH4の詳細設定を行います。",
    "Ch1": "CH1入力端子。\n🔌 直流電源と結線するには：PS端子をクリックしてから、この端子をクリック\n（または Shift+クリックで選択開始）\n右クリックで切断",
    "Ch2": "CH2入力端子。\n🔌 直流電源と結線するには：PS端子をクリックしてから、この端子をクリック\n（または Shift+クリックで選択開始）\n右クリックで切断",
    "Ch3": "CH3入力端子。",
    "Ch4": "CH4入力端子。",

    "Volt1": "【電圧軸ツマミ(CH1)】\nCH1の電圧スケール(V/div)を変更します。",
    "Volt2": "【電圧軸ツマミ(CH2)】\nCH2の電圧スケール(V/div)を変更します。",
    "Volt3": "【電圧軸ツマミ(CH3)】\nCH3の電圧スケール(V/div)を変更します。",
    "Volt4": "【電圧軸ツマミ(CH4)】\nCH4の電圧スケール(V/div)を変更します。",
    
    "Pos1": "【オフセット(CH1)】\nCH1の波形を上下に移動させます。",
    "Pos2": "【オフセット(CH2)】\nCH2の波形を上下に移動させます。",
    "Pos3": "【オフセット(CH3)】\nCH3の波形を上下に移動させます。",
    "Pos4": "【オフセット(CH4)】\nCH4の波形を上下に移動させます。",

    "Math": "波形演算メニュー。\nCH1-CH2などの計算や、FFT解析を行う際に使用します。",
    "Ref": "リファレンス波形。\n現在の波形を「参考波形」として画面に白く固定表示します。",
    "Serial": "シリアル/デジタル。\nI2C等のデコードや、デジタル信号の表示設定を行います。",

    // --- Agilent: Horizontal (水平軸) ---
    "KNOB_TIME": "【時間軸ツマミ】\n時間のスケール(s/div)を変更します。\n回すと波形が横に伸び縮みします。",
    "Horiz": "水平軸メニュー。\nズームモード（拡大表示）やXY表示モードの設定を行います。",
    "Search": "波形検索。\n長い波形の中から特定の特徴を持つ部分を検索します。",
    "Navigate": "ナビゲーション。\n検索したポイントへ移動したり再生したりします。",

    // --- Agilent: Trigger (トリガー) ---
    "Trigger": "トリガーメニュー。\nトリガーの種類（エッジ、パルス幅など）やソースを設定します。",
    "Level": "【トリガーレベル】\n波形を引っ掛ける基準電圧を調整します。\n押すと50%の位置に自動設定されます。",

    // --- Agilent: Measure / Analyze (計測・解析) ---
    "Meas": "自動計測メニュー。\n電圧(Vpp)や周波数(Freq)などを自動で測って数値表示します。",
    "Cursr": "カーソル測定。\n画面に点線（カーソル）を表示し、手動で電圧や時間を測ります。",
    "Cursrツマミ": "汎用ツマミ。\nカーソルの位置移動などに使用します。",
    "Acquire": "波形取り込み設定。\n平均化(Averaging)やピーク検出などのモードを変更します。",
    "Display": "表示設定。\n波形の明るさ、グリッドの種類、残像表示などを設定します。",

    // --- Agilent: File / Utility (システム) ---
    "Default": "初期設定(Default Setup)。\n設定を工場出荷時の状態に戻します。",
    "SavaRecall": "保存/読み出し。\n波形データや設定をUSBメモリ等に保存・読み出しします。",
    "Print": "印刷/保存。\n画面キャプチャをUSBメモリに保存します。",
    "Help": "ヘルプ。\nボタンを長押しすると機能説明が表示されます。",

    // --- Agilent: Screen Operation (画面操作) ---
    "Soft1": "画面下メニューの項目1を選択します。",
    "Soft2": "画面下メニューの項目2を選択します。",
    "Soft3": "画面下メニューの項目3を選択します。",
    "Soft4": "画面下メニューの項目4を選択します。",
    "Soft5": "画面下メニューの項目5を選択します。",
    "Soft6": "画面下メニューの項目6を選択します。",
    "Back": "戻るボタン。\n一つ前のメニュー階層に戻ります。",
    "Entry": "エントリーツマミ。\nメニュー項目の選択や、数値の変更を行う汎用ツマミです。",

    // --- Horizontal / Navigation (水平軸・ナビゲーション) ---
    "Zoom": "【ズームモード】\n画面を上下に分割し、波形の一部を拡大表示します。\n時間軸ツマミを押し込む操作と同じです。",
    "Posツマミ": "【水平位置ツマミ (Delay)】\n波形を左右（時間方向）に移動させます。\n押すとトリガー位置が画面中央（0s）に戻ります。",
    "Navi_L": "【戻る (Navigate)】\n検索機能で見つけた「前のイベント」へ波形をスクロールします。",
    "Navi_R": "【進む (Navigate)】\n検索機能で見つけた「次のイベント」へ波形をスクロールします。",
    "NaviStop": "【停止/再生 (Navigate)】\nナビゲーション再生の開始・停止を行います。",

    // --- Trigger (トリガー) ---
    "ForceTrigger": "【強制トリガー (Force)】\n信号が来ていなくても、強制的にトリガーをかけて波形を更新します。\nDC電圧の確認や、トリガーがかからない時の確認に使います。",

    // --- Tools (ツール・機能) ---
    "QuickAction": "【クイックアクション】\n「画像保存」や「統計リセット」など、事前に割り当てた機能をワンタッチで実行します。",
    "Utility": "【ユーティリティ】\nシステム設定メニュー。\n言語設定、日付、自己校正（キャリブレーション）、I/O設定などを行います。",
    "WavaGen": "【Wave Gen (信号発生器)】\n内蔵ファンクションジェネレータの設定です。\nここから正弦波や矩形波を出力して、「Gen Out」端子から取り出せます。",
    "Analyza": "【解析 (Analyze)】\nマスクテストやビデオ信号解析など、高度な解析機能を使用します。",

    // --- Digital / Vertical (デジタル・垂直軸) ---
    "Digital": "【デジタルチャンネル】\nロジックアナライザ機能の設定です。\nデジタル信号（D0～D15）の波形表示や閾値を設定します。",
    "Label": "【ラベル】\n各チャンネルに「CLK」「DATA」などの名前（ラベル）を付けて画面に表示します。",

    // --- Cursors (カーソルツマミ) ---
    "CursorA": "【カーソルツマミ A】\n1本目のカーソル（測定用の点線）を移動させます。",
    "CursorB": "【カーソルツマミ B】\n2本目のカーソル（測定用の点線）を移動させます。",

    "output": "【出力端子】\nファンクションジェネレータの出力や、外部トリガー入力などの端子を表します。\nここをクリックして信号の接続状態を切り替えます。"

};

// ツールチップの説明文（descriptionsオブジェクトの中に追加）
Object.assign(descriptions, {
    "fctnout": "【発振器 MAIN OUT 端子】\nメイン出力端子（BNC）。設定した波形を出力します。\n🔌 クリックして選択し、オシロスコープの端子と接続できます\n右クリックで切断",
    "subout":  "【発振器 SUB OUT 端子】\nサブ出力端子。\n🔌 クリックして選択し、オシロスコープの端子と接続できます\n右クリックで切断",
});

// ツールチップの説明文（descriptionsオブジェクトの中に追加）
Object.assign(descriptions, {
    "ps_power": "【直流電源 電源】\n直流電源の電源をオン・オフします。",
    "ch1btn": "【CH1選択】\n電圧・電流ツマミの操作対象をCH1に切り替えます。",
    "ch2btn": "【CH2選択】\n電圧・電流ツマミの操作対象をCH2に切り替えます。",
    "volt": "【電圧(V)ツマミ】\nホイール操作で選択中のチャンネルの電圧を変更します。",
    "curr": "【電流(A)ツマミ】\nホイール操作で選択中のチャンネルの電流上限を変更します。",
    "output": "【出力(Output)】\n設定した電圧・電流の出力をオン・オフします。",
    "ch1pura": "CH1 プラス端子（赤）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
    "ch1mai":  "CH1 マイナス端子（黒）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
    "ch2pura": "CH2 プラス端子（赤）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
    "ch2mai":  "CH2 マイナス端子（黒）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
});


// --- 2. モデル切り替え機能 ---
function changeModel(modelName) {
    console.log('モデル切り替え:', modelName);
    currentModelId = modelName;

    const allModels = document.querySelectorAll('.instrument-container');
    allModels.forEach(el => el.style.display = 'none');

    const activeContainer = document.getElementById('model-' + modelName);
    if (activeContainer) {
        activeContainer.style.display = 'block';
        canvas = document.getElementById('canvas-' + modelName);
        ctx = canvas.getContext('2d');
        tooltip = document.getElementById('tooltip-' + modelName);
        autoFit();
    }
}

function switchModelUI(modelName) {
    changeModel(modelName);
    
    // ボタンのアクティブ表示切替
    document.getElementById('btn-model-hantek').classList.remove('active');
    document.getElementById('btn-model-agilent').classList.remove('active');
    document.getElementById('btn-manual').classList.remove('active'); // 説明書ボタンもOFFにする

    document.getElementById('btn-model-' + modelName).classList.add('active');

    // 説明書を隠す
    document.getElementById('manual-screen').style.display = 'none';
}

// 説明書を表示する関数
function showManual() {
    // 1. 全てのオシロスコープモデルを隠す
    document.querySelectorAll('.instrument-container').forEach(el => {
        el.style.display = 'none';
    });

    // 2. 説明書エリアを表示
    document.getElementById('manual-screen').style.display = 'flex';

    // 3. ボタンのアクティブ状態を更新
    document.getElementById('btn-model-hantek').classList.remove('active');
    document.getElementById('btn-model-agilent').classList.remove('active');
    document.getElementById('btn-manual').classList.add('active');
}

// --- ズーム機能 (完全版: 位置ズレ防止・正確な中央寄せ) ---
let currentZoom = 100;

function setZoom(newZoom) {
    if (newZoom < 20) newZoom = 20;
    if (newZoom > 400) newZoom = 400;

    currentZoom = Math.floor(newZoom);
    const scale = currentZoom / 100;

    const zoomDisplay = document.getElementById('zoom-display');
    if (zoomDisplay) zoomDisplay.innerText = currentZoom + '%';

    const containers = document.querySelectorAll('.instrument-container');
    
    // ★修正: 画面全体ではなく、親枠(main-stage)の幅を取得する
    const stage = document.querySelector('.main-stage');
    // ステージがない場合の安全策
    const viewWidth = stage ? stage.clientWidth : window.innerWidth;
    const viewHeight = stage ? stage.clientHeight : window.innerHeight;

    containers.forEach(container => {
        if (container.style.display === 'none') return;

        const img = container.querySelector('img');
        if (!img) return;
        
        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;
        if (originalWidth === 0) return;

        const scaledWidth = originalWidth * scale;
        const scaledHeight = originalHeight * scale;

        // 1. 変形適用 (左上基準)
        container.style.transform = `scale(${scale})`;
        // ドラッグ移動に対応させるため、marginによる余白調整をすべて無効化(0)にします
        container.style.marginLeft = '0px';
        container.style.marginTop = '0px';
        container.style.marginBottom = '0px';
        container.style.marginRight = '0px';

        // 親要素（ドラッグ判定枠）のサイズを、ズーム後の実際の表示サイズに強制的に合わせる
        const wrapper = container.closest('.draggable-equipment');
        if (wrapper) {
            // style.css にある !important を上書きして確実にするために setProperty を使用
            wrapper.style.setProperty('width', `${scaledWidth}px`, 'important');
            wrapper.style.setProperty('height', `${scaledHeight}px`, 'important');
        }
    });
}
function changeZoom(amount) { setZoom(currentZoom + amount); }

// 波形の種類を変更
function setWaveType(type) {
    // 現在選択中のチャンネルの信号を変更
    const ch = scopeState.activeChannel;
    scopeState.signals[ch].type = type;

    // UIのボタンの見た目を更新 (Sine/Square/Tri の active 切り替え)
    document.querySelectorAll('[id^="btn-wave-"]').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-wave-' + type).classList.add('active');
    
    if (scopeState.isOn) drawWaveform();
}

// 振幅を変更
function changeSignalAmplitude(amount) {
    const ch = scopeState.activeChannel;
    let newAmp = scopeState.signals[ch].amplitude + amount;

    // 制限 (0.5V ～ 10V)
    if (newAmp < 0.5) newAmp = 0.5;
    if (newAmp > 10.0) newAmp = 10.0;
    
    scopeState.signals[ch].amplitude = newAmp;
    
    if (scopeState.isOn) drawWaveform();
}

// チャンネル切り替え時に、パネルの波形ボタンの見た目を同期させるための関数
function updateControlPanelUI() {
    const ch = scopeState.activeChannel;
    const currentType = scopeState.signals[ch].type;
    
    document.querySelectorAll('[id^="btn-wave-"]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('btn-wave-' + currentType);
    if (activeBtn) activeBtn.classList.add('active');
}


// 入力ソースを切り替える関数
function switchInputSource(source) {
    scopeState.inputSource = source;
    
    // ボタンの見た目（青いハイライト）を切り替え
    const btnInternal = document.getElementById('btn-src-internal');
    const btnPs = document.getElementById('btn-src-ps');
    if (btnInternal) btnInternal.classList.remove('active');
    if (btnPs) btnPs.classList.remove('active');
    
    if (source === 'internal') {
        if (btnInternal) btnInternal.classList.add('active');
    } else if (source === 'power_supply') {
        if (btnPs) btnPs.classList.add('active');
    }
    // 'fg' の場合はコントロールパネルのボタンはどちらもOFF（AD/DAパネルで管理）
    
    // 切り替えたらすぐに波形を再描画する
    if (typeof drawAgilent === 'function') drawAgilent();
}



function autoFit() {
    const img = document.querySelector('#model-' + currentModelId + ' img');    
    if (!img || img.naturalWidth === 0) return;
    
    const stage = document.querySelector('.main-stage');
    const availableWidth = stage ? stage.clientWidth : (window.innerWidth - 40);
    const availableHeight = stage ? stage.clientHeight : (window.innerHeight - 180);

    // 画像が収まる倍率を計算
    let bestScale = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);
    let bestZoom = bestScale * 100;

    // 少し余白を持たせるために 95% くらいにする
    bestZoom = bestZoom * 0.95;

    if (bestZoom > 100) bestZoom = 100;
    setZoom(bestZoom);
}

window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);


// --- 4. 描画ロジック ---

function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)'; // くっきり表示
    ctx.lineWidth = 1;
    const gridSpacing = 50;
    for (let x = 0; x < canvas.width; x += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

// メニュー描画（モデル別リアルUI対応版）
// メニュー描画（機種別データ対応版）
function drawMenu() {
    // メニューが開いていない、または電源OFFなら描画しない
    if (!scopeState.currentMenu || !scopeState.isOn) return;

    const key = scopeState.currentMenu;
    let data;

    // ★変更: 現在のモデルに合わせてデータソースを切り替える
    if (currentModelId === 'hantek') {
        data = menuDataHantek[key];
        if (data) drawMenuHantek(data);
    } 
    else if (currentModelId === 'agilent') {
        data = menuDataAgilent[key];
        // Agilentの場合、CH1_MENUなどのキーが共通でも中身があるか確認
        if (data) drawMenuAgilent(data);
    }
}
// --- Hantek風のメニュー描画 ---
// 特徴: 青っぽい背景、独立したボタン風のボックス
function drawMenuHantek(data) {
    const menuWidth = 100;
    const menuX = canvas.width - menuWidth; 

    // 1. メニュー全体の背景 (画面右端の帯)
    // Hantekは薄い青色の帯があることが多い
    ctx.fillStyle = "rgba(0, 50, 100, 0.8)";
    ctx.fillRect(menuX, 0, menuWidth, canvas.height);
    
    // 2. タイトルエリア (一番上)
    ctx.fillStyle = "#002d5c"; // 濃い紺色
    ctx.fillRect(menuX + 2, 2, menuWidth - 4, 40);
    
    ctx.fillStyle = "white";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(data.title, menuX + (menuWidth / 2), 25);

    // 3. 各項目の描画 (F1～F5ボタンの位置に合わせる)
    // Hantekの実機画像を見ると、ボタンは等間隔に並んでいる
    // 画面の高さ(360px)から、上部の余白を除いて配置
    
    const startY = 60; // 最初のボタンのY位置
    const buttonHeight = 50; // ボタンの高さ
    const gap = 10; // ボタン間の隙間

    ctx.font = "12px sans-serif";

    data.items.forEach((item, index) => {
        // 5個までしか表示できない (F1-F5)
        if (index >= 5) return;

        const boxY = startY + index * (buttonHeight + gap);
        
        // ボタンの背景 (角丸四角形風)
        ctx.fillStyle = "#004080"; // 明るめの紺色
        ctx.strokeStyle = "#4da6ff"; // 水色の枠線
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.rect(menuX + 5, boxY, menuWidth - 10, buttonHeight);
        ctx.fill();
        ctx.stroke();

        // テキスト (2行に分割する簡易処理)
        ctx.fillStyle = "white";
        const parts = item.split(": ");
        if (parts.length > 1) {
            // "Type: Sine" のようにコロンがある場合、2行にする
            ctx.fillText(parts[0], menuX + (menuWidth / 2), boxY + 20);
            ctx.fillStyle = "yellow"; // 値の部分は黄色に
            ctx.fillText(parts[1], menuX + (menuWidth / 2), boxY + 38);
        } else {
            // 1行の場合
            ctx.fillStyle = "white";
            ctx.fillText(item, menuX + (menuWidth / 2), boxY + 30);
        }
    });
}

// --- Agilent (Keysight)風のメニュー描画 ---
// 特徴: 画面下部に横並び、チャンネルごとに色が変化
function drawMenuAgilent(data) {
    const menuHeight = 65; 
    const menuY = canvas.height - menuHeight;

    // 1. 背景 (半透明の黒)
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)"; // 少し濃くしました
    ctx.fillRect(0, menuY, canvas.width, menuHeight);
    
    // --- ★追加: チャンネルごとの色決定ロジック ---
    let themeColor = "#ccc"; // デフォルト（グレー）
    const menuKey = scopeState.currentMenu;

    if (menuKey === 'CH1_MENU') {
        themeColor = "yellow"; // CH1選択時は黄色
    } else if (menuKey === 'CH2_MENU') {
        themeColor = "cyan";   // CH2選択時は水色
    }

    // 上部の境界線 (テーマカラーにする)
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2; // 少し太くして強調
    ctx.beginPath();
    ctx.moveTo(0, menuY);
    ctx.lineTo(canvas.width, menuY);
    ctx.stroke();

    // 2. 左端にタイトルを表示 (実機っぽく)
    // Agilentは一番左に現在のメニュー名が出ることが多いです
    ctx.fillStyle = themeColor;
    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(data.title, 10, menuY - 10); // メニューバーの少し上に表示


    // 3. 各項目の描画
    const buttonCount = 6;
    const itemWidth = canvas.width / buttonCount;

    ctx.font = "bold 12px 'Segoe UI', sans-serif";

    data.items.forEach((item, index) => {
        if (index >= buttonCount) return;

        const itemX = index * itemWidth;

        // 区切り線
        if (index > 0) {
            ctx.strokeStyle = "#555";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(itemX, menuY);
            ctx.lineTo(itemX, canvas.height);
            ctx.stroke();
        }

        const parts = item.split(": ");
        ctx.textAlign = "center";

        if (parts.length > 1) {
            // 上段: ラベル
            ctx.fillStyle = "#bbb"; 
            ctx.font = "12px sans-serif";
            ctx.fillText(parts[0], itemX + (itemWidth / 2), menuY + 22);
            
            // 下段: 設定値 (★テーマカラーで強調)
            ctx.fillStyle = themeColor; 
            ctx.font = "bold 14px sans-serif";
            ctx.fillText(parts[1], itemX + (itemWidth / 2), menuY + 48);
        } else {
            // 1行のみ
            ctx.fillStyle = "white"; // 共通項目は白のまま
            ctx.font = "bold 13px sans-serif";
            ctx.fillText(item, itemX + (itemWidth / 2), menuY + 38);
        }
    });
}
// =======================================================================
//  波形描画関数 (複数ch同時表示・AC/DC再現・信号操作対応版)
// =======================================================================
// 指定したチャンネル・時刻における電圧値を取得する関数
function getSignalVoltage(ch, t) {
    const signal = scopeState.signals[ch];
    const freq = signal.frequency;
    const amp = signal.amplitude;
    
    // 基本の位相 (2πft)
    const phase = 2 * Math.PI * freq * t;
    
    let val = 0;
    if (signal.type === 'sine') {
        val = Math.sin(phase);
    } else if (signal.type === 'square') {
        val = Math.sin(phase) >= 0 ? 1 : -1;
    } else if (signal.type === 'tri') {
        val = (2 / Math.PI) * Math.asin(Math.sin(phase));
    }
    
    // 実際の電圧 = 値(-1~1) * 振幅 + DCオフセット(今回は0)
    return val * amp;
}

// トリガーポイント（時間オフセット）を計算する関数
function calculateTriggerOffset() {
    const source = scopeState.trigger.source;
    const level = scopeState.trigger.level;
    const signal = scopeState.signals[source];
    
    // 信号が無い場合はそのまま流す
    if (!signal) return scopeState.timeOffset;

    const freq = signal.frequency;
    const period = 1.0 / freq; // 1周期の時間
    
    const steps = 100; 
    const dt = period / steps;
    const baseTime = scopeState.timeOffset; 

    // --- 1. トリガポイントの探索 ---
    for (let i = 0; i < steps * 2; i++) {
        const t1 = baseTime - (i * dt);
        const t2 = baseTime - ((i + 1) * dt);

        const v1 = getSignalVoltage(source, t1);
        const v2 = getSignalVoltage(source, t2);

        // Rising Edge (立ち上がり) 検出
        if (scopeState.trigger.slope === 'rising') {
            if (v2 < level && v1 >= level) {
                // ★トリガ成功！
                scopeState.trigger.isTriggered = true;
                scopeState.trigger.lastOffset = t1; // 位置を記憶
                scopeState.trigger.lossTimer = 0;   // タイマーリセット
                return t1;
            }
        }
        // Falling Edge なら逆の判定...
    }
    
    // --- 2. トリガが見つからなかった場合の処理 (ここが重要) ---
    
    // すぐに諦めず、少しの間(例えば60フレーム=約1秒)は
    // 「前回のトリガ位置」を使い続ける
    const TIMEOUT_FRAMES = 60; 

    if (scopeState.trigger.lossTimer < TIMEOUT_FRAMES) {
        // まだ猶予期間中 -> 前回の位置を返して「止まっているように見せる」
        scopeState.trigger.lossTimer++;
        
        // 画面上の表示は "Trig'd?" のようにしても良いが、
        // 実機に合わせて Trig'd のままか、あるいは点滅させる等の表現になる。
        // ここではチラつき防止優先で isTriggered = true のまま扱う手もあるが、
        // 厳密にはトリガしていないので false にしつつ固定表示する。
        
        // ユーザー体験的には「止まっている＝トリガ中」と感じるので true 維持でもOK
        scopeState.trigger.isTriggered = true; 
        
        return scopeState.trigger.lastOffset;
    } else {
        // 完全にトリガを見失った -> Autoモード（波形を流す）へ移行
        scopeState.trigger.isTriggered = false;
        return scopeState.timeOffset; 
    }
}

// =======================================================================
//  【補助関数】信号電圧の計算
//   指定したチャンネル(ch)と時間(t)における本来の電圧値を返します
// =======================================================================
function getSignalVoltage(ch, t) {
    const signal = scopeState.signals[ch];
    const freq = signal.frequency;
    const amp = signal.amplitude;
    
    // 位相 (2πft)
    // ※ scopeState.timeOffset は calculateTriggerOffset 側で考慮されるためここでは使いません
    const phase = 2 * Math.PI * freq * t;
    
    let val = 0;
    if (signal.type === 'sine') {
        val = Math.sin(phase);
    } else if (signal.type === 'square') {
        val = Math.sin(phase) >= 0 ? 1 : -1;
    } else if (signal.type === 'tri') {
        val = (2 / Math.PI) * Math.asin(Math.sin(phase));
    }
    
    // 実際の電圧 = 波形値(-1~1) * 振幅
    return val * amp;
}

// =======================================================================
//  【補助関数】トリガーオフセットの計算
//   「波形がトリガーレベルをまたぐ瞬間」がいつなのかを計算して返します
// =======================================================================
function calculateTriggerOffset() {
    // ソース（通常CH1）とレベルの設定を取得
    const source = scopeState.trigger.source;
    const level = scopeState.trigger.level;
    const signal = scopeState.signals[source];
    
    // まだ信号設定がない等の場合はそのまま流す
    if (!signal) return scopeState.timeOffset;

    const freq = signal.frequency;
    const period = 1.0 / freq; // 1周期の時間
    
    // トリガー探索の精度（分割数）
    const steps = 100; 
    const dt = period / steps;

    // 現在流れている時間（アニメーション用）を基準にする
    // これにより、トリガーがかからない時は波形が流れて見える
    const baseTime = scopeState.timeOffset; 

    // 「現在時刻」の近くで、電圧がトリガーレベルをまたぐ瞬間を探す
    // 範囲は少し広め（2周期分）にとって確実に捕捉する
    for (let i = 0; i < steps * 2; i++) {
        // 未来に向かって少しずつ時間を進めてチェック
        // (baseTime はマイナス方向に進むことが多いので、ここでは絶対値や剰余で調整しても良いが、
        //  単純に相対時間で検索する方がスムーズにつながる)
        const t1 = baseTime - (i * dt);     // 直前
        const t2 = baseTime - ((i + 1) * dt); // 直後（時間はマイナスに進んでいる前提）

        const v1 = getSignalVoltage(source, t1);
        const v2 = getSignalVoltage(source, t2);

        // Rising Edge（立ち上がり）検出
        // 「直前はレベルより低く」かつ「直後はレベル以上」の瞬間
        if (scopeState.trigger.slope === 'rising') {
            if (v2 < level && v1 >= level) {
                scopeState.trigger.isTriggered = true;
                return t1; // 見つけた時間を返す（これで描画位置を固定する）
            }
        }
        // Falling Edge（立ち下がり）検出なら不等号を逆にする
    }
    
    // 見つからなかった場合（レベルが高すぎる等）
    scopeState.trigger.isTriggered = false;
    return scopeState.timeOffset; // そのまま時間を流す（Autoモード）
}

// =======================================================================
//  メイン描画関数: drawWaveform
// =======================================================================
function drawWaveform() {
    // 1. 画面クリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 電源OFFなら真っ暗にして終了
    if (!scopeState.isOn) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // 2. 背景グリッドを描画
    drawGrid();

    // 共通パラメータの計算
    const currentTimeDiv = TIME_STEPS[scopeState.timeIndex];
    const centerY = canvas.height / 2;
    const pixelsPerGrid = 50; // 1グリッド = 50px

    // ★トリガー計算
    // 波形を止めるための「時間ズレ」を取得
    let drawTimeOffset = calculateTriggerOffset();

    // 画面中央を「時間0（トリガーポイント）」にするための補正値
    // これがないと、画面の左端が時間0になってしまう
    const centerTimeShift = (canvas.width / 2 / pixelsPerGrid) * currentTimeDiv;

    // ==========================================
    // 3. 波形描画ループ (CH1, CH2)
    // ==========================================
    ['CH1', 'CH2'].forEach(ch => {
        const signal = scopeState.signals[ch];
        
        // チャンネルごとの設定（色、電圧レンジ、カップリング）
        let voltIndex, color, coupling;
        if (ch === 'CH1') {
            voltIndex = scopeState.voltIndexCH1;
            color = 'yellow';
            coupling = 'DC';
        } else {
            voltIndex = scopeState.voltIndexCH2;
            color = 'cyan';
            coupling = 'AC';
        }
        
        const currentVoltDiv = VOLT_STEPS[voltIndex];
        
        // オフセット（AC結合なら無視、DCなら反映）
        let effectiveOffset = (coupling === 'AC') ? 0 : (signal.offset || 0);

        // 描画開始
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        // もともとの計算式に、マウスホイールで動かす position の値を足し算（または引き算）します
        // ※ ch が 'CH1' か 'CH2' かによって足す変数を切り替えます
        const wheelOffset = (ch === 'CH1') ? scopeState.positionCH1 : scopeState.positionCH2;

        // 核心部分の行を、このように直接書いてみてください
        const offsetPx = ((effectiveOffset / currentVoltDiv) * pixelsPerGrid) + ((ch === 'CH1') ? scopeState.positionCH1 : scopeState.positionCH2);

        // X座標（画面の左端から右端まで）ループ
        // 負荷軽減のため step=2 (2pxごとに計算) にしています
        for (let x = 0; x < canvas.width; x += 2) {
            
            // 1. 画面上のX座標を「時間」に変換
            const gridX = x / pixelsPerGrid;
            const timeSpan = gridX * currentTimeDiv;

            // 2. 実際の信号時間を計算
            //   [画面の時間] + [トリガーによる固定] - [画面中央への補正]
            const signalTime = timeSpan + drawTimeOffset - centerTimeShift;
            
            // ========================================================
            // ★ 入力ソースの分岐（直流電源 / 発振器+AD/DA / 内部テスト）
            // ========================================================
            let rawVolt = 0;
            if (scopeState.inputSource === 'power_supply') {
                // 【直流電源モード】結線があり、電源と出力が両方ONの時だけ電圧を反映
                const termName = ch === 'CH1' ? 'Ch1' : 'Ch2';
                const conn = wiringState.connections.find(c => c.oscTerminal === termName);
                if (conn && psState.isOn && psState.isOutputOn) {
                    if (conn.psTerminal === 'ch1pura') {
                        rawVolt = psState.ch1.voltage;
                    } else if (conn.psTerminal === 'ch1mai') {
                        rawVolt = -psState.ch1.voltage;
                    } else if (conn.psTerminal === 'ch2pura') {
                        rawVolt = psState.ch2.voltage;
                    } else if (conn.psTerminal === 'ch2mai') {
                        rawVolt = -psState.ch2.voltage;
                    }
                }
            } else if (scopeState.inputSource === 'fg') {
                // 【発振器 + AD/DA変換モード、またはFGワイヤー接続モード】
                const signal = scopeState.signals[ch];
                if (signal && signal.source === 'fg_wire') {
                    // FGワイヤー直結: 生波形を直接描画
                    rawVolt = getSignalVoltageRaw(ch, signalTime);
                } else {
                    rawVolt = getOscilloscopeVoltage(ch, signalTime, x);
                }
            } else {
                // 【内部テスト信号モード】
                rawVolt = getSignalVoltage(ch, signalTime);
            }
            // ========================================================
            
            // 4. 電圧をY座標に変換
            //   Canvasは上が0、下がプラスなのでマイナスする
            const y = centerY - (rawVolt / currentVoltDiv * pixelsPerGrid) - offsetPx;

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });

    // ==========================================
    // 4. トリガーレベルラインと矢印の描画
    // ==========================================
    // CH1の電圧レンジを基準にレベル位置を計算
    const trigRange = VOLT_STEPS[scopeState.voltIndexCH1];
    const trigLevelPx = (scopeState.trigger.level / trigRange) * pixelsPerGrid;
    
    // Y座標を計算 (画面外にはみ出ないように制限をかけるとよりリアルですが、今回はそのまま)
    const trigY = centerY - trigLevelPx;
    
    // --- (A) 点線の描画 ---
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 165, 0, 0.7)"; // オレンジ
    ctx.setLineDash([5, 5]); // 点線
    ctx.lineWidth = 1;
    ctx.moveTo(0, trigY);
    ctx.lineTo(canvas.width, trigY);
    ctx.stroke();
    ctx.setLineDash([]); // 実線に戻す

    // --- (B) ★追加: 右端の矢印マーカー描画 ---
    const markerWidth = 24;  // マーカーの幅
    const markerHeight = 18; // マーカーの高さ
    const markerX = canvas.width; // 画面の右端
    
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 165, 0, 1)"; // 不透明なオレンジ
    
    // ホームベース型を横に倒した形（左向きの矢印）を描く
    ctx.moveTo(markerX - markerWidth, trigY); // 左の先端
    ctx.lineTo(markerX - (markerWidth * 0.4), trigY - (markerHeight / 2)); // 左上の角
    ctx.lineTo(markerX, trigY - (markerHeight / 2)); // 右上の角
    ctx.lineTo(markerX, trigY + (markerHeight / 2)); // 右下の角
    ctx.lineTo(markerX - (markerWidth * 0.4), trigY + (markerHeight / 2)); // 左下の角
    ctx.closePath();
    ctx.fill();
    
    // マーカーの中に「T」の文字を書く
    ctx.fillStyle = "black"; // 文字は黒
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // マーカーの四角い部分の中心あたりに文字を置く
    ctx.fillText("T", markerX - (markerWidth * 0.25), trigY + 1);

    // ==========================================
    // 5. テキスト情報 (インジケーター)
    // ==========================================
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";

    // --- CH1 情報 ---
    const vDiv1 = VOLT_STEPS[scopeState.voltIndexCH1];
    const vText1 = vDiv1 >= 1 ? `${vDiv1.toFixed(2)}V` : `${(vDiv1*1000).toFixed(0)}mV`;
    const marker1 = (scopeState.activeChannel === 'CH1') ? "▶ " : "   ";
    ctx.fillStyle = "yellow";
    const ch1Label = (scopeState.inputSource === 'fg') ? 'DA出力' : 'CH1';
    ctx.fillText(`${marker1}${ch1Label} ${vText1}`, 20, canvas.height - 20);

    // --- CH2 情報 ---
    const vDiv2 = VOLT_STEPS[scopeState.voltIndexCH2];
    const vText2 = vDiv2 >= 1 ? `${vDiv2.toFixed(2)}V` : `${(vDiv2*1000).toFixed(0)}mV`;
    const marker2 = (scopeState.activeChannel === 'CH2') ? "▶ " : "   ";
    ctx.fillStyle = "cyan";
    const ch2Label = (scopeState.inputSource === 'fg') ? '原波形' : 'CH2';
    ctx.fillText(`${marker2}${ch2Label} ${vText2}`, 200, canvas.height - 20);

    // --- 時間軸 情報 ---
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    let tText = currentTimeDiv >= 1 ? `${currentTimeDiv.toFixed(2)}s` : 
                currentTimeDiv >= 0.001 ? `${(currentTimeDiv*1000).toFixed(2)}ms` : `${(currentTimeDiv*1000000).toFixed(0)}us`;
    ctx.fillText(`M ${tText}`, canvas.width / 2, canvas.height - 20);

    // --- FG/AD/DAモード情報 (左上) ---
    if (scopeState.inputSource === 'fg' && fgState.outputOn) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(5, 5, 260, 50);
        ctx.fillStyle = "#00ff88";
        ctx.font = "11px monospace";
        ctx.textAlign = "left";
        const freqStr = fgState.freq >= 1000 ? (fgState.freq/1000).toFixed(2)+'kHz' : fgState.freq.toFixed(0)+'Hz';
        const fsHz = 1000000 / adDaState.samplingPeriodUs;
        const fsStr = fsHz >= 1000 ? (fsHz/1000).toFixed(0)+'kHz' : fsHz+'Hz';
        ctx.fillText(`FG: ${fgState.waveform} ${freqStr} ${fgState.amptd.toFixed(2)}Vpp`, 10, 18);
        ctx.fillStyle = "#ffaa00";
        ctx.fillText(`AD/DA: ${adDaState.resolution}bit  fs=${fsStr}  (${adDaState.samplingPeriodUs}µs)`, 10, 32);
        // サンプリング定理判定
        const inputFreq = fgState.freq;
        const nyquist = fsHz / 2;
        if (inputFreq > nyquist) {
            ctx.fillStyle = "#ff4444";
            ctx.fillText(`⚠ エイリアス! fin(${freqStr}) > fs/2(${(nyquist/1000).toFixed(1)}kHz)`, 10, 46);
        } else {
            ctx.fillStyle = "#88ff88";
            ctx.fillText(`✓ fin < fs/2 (${(nyquist/1000).toFixed(1)}kHz) サンプリング定理OK`, 10, 46);
        }
    }

    // --- トリガー情報 (右上) ---
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255, 165, 0, 1)";
    const statusText = scopeState.trigger.isTriggered ? "Trig'd" : "Auto";
    // トリガーレベルと状態を表示
    ctx.fillText(`T: ${scopeState.trigger.level.toFixed(2)}V (${statusText})`, canvas.width - 10, 30);

    // ==========================================
    // 6. メニュー描画
    // ==========================================
    drawMenu();

    if (scopeState.showMeasure) {
        // 現在アクティブなチャンネルのデータを取得（CH1かCH2）
        const targetCh = scopeState.activeChannel; 
        const signal = scopeState.signals[targetCh];

        // 常に最新の振幅と周波数を取得！
        const currentAmp = signal.amplitude;
        const currentFreq = signal.frequency;

        // Vp-pの計算（振幅の2倍）
        const vpp = (currentAmp * 2).toFixed(2);

        // 周波数の単位調整 (1000Hz以上ならkHzにする)
        let freqDisplay = "";
        if (currentFreq >= 1000) {
            freqDisplay = (currentFreq / 1000).toFixed(2) + " kHz";
        } else {
            freqDisplay = currentFreq.toFixed(2) + " Hz";
        }

        // --- 描画処理 ---
        // 背景の黒い半透明ボックスを描画（右上の邪魔にならない位置に配置）
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        // メニューが開いている時とかぶらないように少し内側に配置
        ctx.fillRect(canvas.width - 250, 40, 140, 70); 

        // 文字の設定
        ctx.fillStyle = "#00FF00"; // 蛍光グリーン
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "left"; // 文字を左揃えにする

        // 文字の描画
        ctx.fillText(`[${targetCh}]`, canvas.width - 240, 60);
        ctx.fillText(`Vp-p: ${vpp} V`, canvas.width - 240, 80);
        ctx.fillText(`Freq: ${freqDisplay}`, canvas.width - 240, 100);
    }

    if (scopeState.cursor.show) {
        ctx.save();
        
        // 1. カーソル線の描画
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // 点線
        
        // カーソルAの線 (現在操作中なら少し明るくするなど色を変えると分かりやすいです)
        ctx.beginPath();
        ctx.strokeStyle = scopeState.cursor.target === 'A' ? "#00FFFF" : "rgba(255,255,255,0.5)";
        ctx.moveTo(scopeState.cursor.posA, 0);
        ctx.lineTo(scopeState.cursor.posA, canvas.height);
        ctx.stroke();

        // カーソルBの線
        ctx.beginPath();
        ctx.strokeStyle = scopeState.cursor.target === 'B' ? "#00FFFF" : "rgba(255,255,255,0.5)";
        ctx.moveTo(scopeState.cursor.posB, 0);
        ctx.lineTo(scopeState.cursor.posB, canvas.height);
        ctx.stroke();

        // 2. 値の計算
        const pixelsPerDiv = 50; // ※お使いのグリッドの1マスのピクセル幅
        const timePerDiv = TIME_STEPS[scopeState.timeIndex]; 
        const timePerPixel = timePerDiv / pixelsPerDiv;
        
        const pixelDiff = Math.abs(scopeState.cursor.posB - scopeState.cursor.posA);
        const deltaT = pixelDiff * timePerPixel;
        const freq = deltaT > 0 ? (1 / deltaT) : 0;

        // 3. 値の描画表示
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(10, 10, 160, 60); // 背景ボックス
        
        ctx.fillStyle = "#FFF";
        ctx.font = "14px sans-serif";
        ctx.setLineDash([]); 
        
        const displayDeltaT = deltaT >= 1 ? `${deltaT.toFixed(2)} s` : `${(deltaT * 1000).toFixed(2)} ms`;
        const displayFreq = freq >= 1000 ? `${(freq / 1000).toFixed(2)} kHz` : `${freq.toFixed(2)} Hz`;

        ctx.fillText(`Δt : ${displayDeltaT}`, 20, 35);
        ctx.fillText(`1/Δt : ${displayFreq}`, 20, 55);
        
        ctx.restore();
    }
}
function animationLoop() {
    if (scopeState.isOn && scopeState.isRunning) {
        scopeState.timeOffset -= 0.0001; 
    }
    if (canvas && ctx) {
        drawWaveform();
    }
    requestAnimationFrame(animationLoop);
}


// --- 5. イベントリスナー ---
const containers = document.querySelectorAll('.instrument-container');

containers.forEach(container => {
    
    // --- クリックイベント ---
// --- クリックイベント (ボタン操作) ---
    container.addEventListener('click', function(e) {
        // 非表示のモデルでのクリックは無視
        if (container.style.display === 'none') return;
        
        // ホットスポット（透明ボタン）以外のクリックは無視
        let target = e.target;
        if (!target.classList.contains('hotspot')) return;

        const title = target.title; // 例: "電源ボタン", "CH1_MENU", "Measure"

        // [0] 端子クリック（結線システム）
        if (PS_TERMINALS.includes(title)) {
            handleTerminalClick(title, target);
            return;
        }
        // オシロ端子（Ch1/Ch2）: 選択中の端子がある場合、または直流電源モード時は結線処理
        if (OSC_TERMINALS.includes(title)) {
            if (wiringState.pendingTerminal || e.shiftKey) {
                handleTerminalClick(title, target);
                return;
            }
        }

        // [A] 電源ボタンの処理
        if (title === '電源ボタン') {
            target.classList.toggle('active'); // activeクラスの付け外し
            
            // 電源状態を更新
            scopeState.isOn = target.classList.contains('active');
            
            if (scopeState.isOn) {
                scopeState.isRunning = true;
                
                // 電源ON時の初期状態設定
                scopeState.activeChannel = 'CH1';  // CH1を選択状態に
                scopeState.currentMenu = 'CH1_MENU'; // メニューも開く
                
                updateControlPanelUI(); // コントロールパネルの表示を同期
            } else {
                // 電源OFF時はメニューを閉じる
                scopeState.currentMenu = null;
            }
        }
        
        // [B] チャンネル選択 & メニュー表示 (CH1)
        else if (title === 'CH1_MENU' || title === 'Ch1') {
            if (!scopeState.isOn) return; // 電源OFFなら何もしない
            if( scopeState.currentMenu === 'CH1_MENU' ) {
                // すでにCH1メニューが開いている場合は閉じる
                scopeState.currentMenu = null;
                updateControlPanelUI(); // コントロールパネルの信号ボタン表示を更新
                return;
            } else {
                scopeState.activeChannel = 'CH1';    // 操作対象をCH1に
                scopeState.currentMenu = 'CH1_MENU'; // メニューを開く
            }
            
            updateControlPanelUI(); // コントロールパネルの信号ボタン表示を更新
        }

            // --- 直流電源のボタン操作 ---
        else if (title === 'ps_power') {
            psState.isOn = !psState.isOn;
            if (!psState.isOn) psState.isOutputOn = false; // 電源OFFで出力も強制OFF
            console.log("直流電源:", psState.isOn ? "ON" : "OFF");
            updatePSDisplay();
        }
        else if (title === 'ch1btn') {
            if (!psState.isOn) return;
            psState.activeChannel = 'CH1';
            console.log("直流電源 操作対象: CH1");
        }
        else if (title === 'ch2btn') {
            if (!psState.isOn) return;
            psState.activeChannel = 'CH2';
            console.log("直流電源 操作対象: CH2");
        }
        else if (title === 'output') {
            if (!psState.isOn) return;
            psState.isOutputOn = !psState.isOutputOn;
            console.log("直流電源 出力:", psState.isOutputOn ? "ON" : "OFF");
            
            // ★ ここでオシロスコープに電圧の値を渡す処理を呼ぶことになります
            updateOscilloscopeSignal(); 
        }
        
        // [C] チャンネル選択 & メニュー表示 (CH2)
        else if (title === 'CH2_MENU' || title === 'Ch2') {
            if (!scopeState.isOn) return;
            if( scopeState.currentMenu === 'CH2_MENU' ) {
                // すでにCH2メニューが開いている場合は閉じる
                scopeState.currentMenu = null;
                updateControlPanelUI(); // コントロールパネルの信号ボタン表示を更新
                return;
            } else {
                scopeState.activeChannel = 'CH2';    // 操作対象をCH2に
                scopeState.currentMenu = 'CH2_MENU'; // メニューを開く
            }
            
            updateControlPanelUI(); // コントロールパネルの信号ボタン表示を更新
        }
        
        // [D] その他の汎用メニューボタン (Measure, Acquire, Utilityなど)
        else {
            // 現在のモデルに対応したメニューデータが存在するかチェック
            let isMenuButton = false;
            
            if (currentModelId === 'hantek' && menuDataHantek[title]) {
                isMenuButton = true;
            } else if (currentModelId === 'agilent' && menuDataAgilent[title]) {
                isMenuButton = true;
            }

            // メニューボタンかつ電源ONなら処理
            if (isMenuButton && scopeState.isOn) {
                // すでに同じメニューが開いていれば閉じる、違えば開く
                if (scopeState.currentMenu === title) {
                    scopeState.currentMenu = null;
                } else {
                    scopeState.currentMenu = title;
                }
            }
            
            // [E] Run/Stopボタン
            if (title === 'RunStop') {
                scopeState.isRunning = !scopeState.isRunning;
            }
            // [F] AutoSetボタン (簡易リセット機能)
            else if (title === 'AutoSet' && scopeState.isOn) {
                // 適当に見やすい値にリセットする演出
                scopeState.voltIndexCH1 = 6; // 1.0V
                scopeState.voltIndexCH2 = 6; // 1.0V
                scopeState.timeIndex = 15;   // 0.1s
                scopeState.timeOffset = 0;
                scopeState.currentMenu = null;
                console.log("AutoSet executed");
            }
            // [G] Measボタンがクリックされた時の処理
            else if (title === 'Meas' || title === 'Measure') {
                if (!scopeState.isOn) return;
                // 表示のON/OFFを切り替える
                scopeState.showMeasure = !scopeState.showMeasure;
                        
                // ついでにメニューも開く/閉じる場合は以下を追加しても良いです
                scopeState.currentMenu = scopeState.showMeasure ? 'Measure' : null;
            }

            else if (title === 'Cursr' || title === 'Cursors') {
            if (!scopeState.isOn) return;
            
            // 状態をローテーションさせる (非表示 -> A操作 -> B操作 -> 非表示)
            if (!scopeState.cursor.show) {
                scopeState.cursor.show = true;
                scopeState.cursor.target = 'A';
            } else if (scopeState.cursor.target === 'A') {
                scopeState.cursor.target = 'B';
            } else {
                scopeState.cursor.show = false;
            }
            drawWaveform(); 
        }
        }
    });
    // --- マウスホイールイベント (ツマミ用) ---
    // ここがループの内側にあることが重要です！
    container.addEventListener('wheel', function(e) {
        if (!e.target.classList.contains('hotspot')) return;
        const title = e.target.title;

        // 電圧ツマミ
        if (title === 'KNOB_VOLT' || title === 'Volt1' || title === 'Volt2' || title === 'Volt3' || title === 'Volt4') {
            e.preventDefault();

            // どのツマミかを判定（モデルによってtitleが違うため、両方に対応）
            // 例: Volt1, Volt3 は CH1用 / Volt2, Volt4 は CH2用
            const isCH1Knob = (title === 'Volt1' || title === 'Volt3');
            const isCH2Knob = (title === 'Volt2' || title === 'Volt4');
            
            // Agilentモデルなどで 'KNOB_VOLT' と共通の名前になっている場合は、
            // 便宜上今まで通り activeChannel を参照するようにしておきます
            let targetCH = scopeState.activeChannel; 
            if (isCH1Knob) targetCH = 'CH1';
            if (isCH2Knob) targetCH = 'CH2';

            if (targetCH === 'CH1') {
                if (e.deltaY > 0) {
                    if (scopeState.voltIndexCH1 < VOLT_STEPS.length - 1) scopeState.voltIndexCH1++;
                } else {
                    if (scopeState.voltIndexCH1 > 0) scopeState.voltIndexCH1--;
                }
            } else {
                // CH2の場合
                if (e.deltaY > 0) {
                    if (scopeState.voltIndexCH2 < VOLT_STEPS.length - 1) scopeState.voltIndexCH2++;
                } else {
                    if (scopeState.voltIndexCH2 > 0) scopeState.voltIndexCH2--;
                }
            }
        }
        // 時間ツマミ
        else if (title === 'KNOB_TIME') {
            e.preventDefault();
            if (e.deltaY > 0) { // 手前へ回す（時間圧縮＝レンジ上げ）
                if (scopeState.timeIndex < TIME_STEPS.length - 1) scopeState.timeIndex++;
            } else { // 奥へ回す（時間拡大＝レンジ下げ）
                if (scopeState.timeIndex > 0) scopeState.timeIndex--;
            }
        }
        // トリガーレベルツマミ
        else if (title === 'Level' || title === 'Trigger Level') {
            e.preventDefault();
            // CH1の現在のボルトレンジを基準に増減量を決める
            const currentRange = VOLT_STEPS[scopeState.voltIndexCH1];
            const step = currentRange * 0.5; // レンジの10%ずつ変化

            if (e.deltaY < 0) { // 奥へ回す（レベル上げる）
                scopeState.trigger.level += step;
            } else { // 手前へ回す（レベル下げる）
                scopeState.trigger.level -= step;
            }
        }
        // --- 直流電源のツマミ操作 ---
        else if (title === 'volt') {
            e.preventDefault();
            if (!psState.isOn) return; // 電源OFF時は無効
            
            const ch = psState.activeChannel.toLowerCase(); // 'ch1' または 'ch2'
            if (e.deltaY < 0) { // 手前に回す（増やす）
                psState[ch].voltage = Math.min(30.0, psState[ch].voltage + 0.1);
            } else { // 奥に回す（減らす）
                psState[ch].voltage = Math.max(0.0, psState[ch].voltage - 0.1);
            }
            
            console.log(`${psState.activeChannel} 電圧: ${psState[ch].voltage.toFixed(1)} V`);
            updatePSDisplay();
            if (typeof updateOscilloscopeSignal === 'function') updateOscilloscopeSignal();
        }
        else if (title === 'curr') {
            e.preventDefault();
            if (!psState.isOn) return;
            
            const ch = psState.activeChannel.toLowerCase();
            if (e.deltaY < 0) {
                psState[ch].current = Math.min(3.00, psState[ch].current + 0.01);
            } else {
                psState[ch].current = Math.max(0.00, psState[ch].current - 0.01);
            }
            
            console.log(`${psState.activeChannel} 電流: ${psState[ch].current.toFixed(2)} A`);
            updatePSDisplay();
        }

        // --- 位置（Position）ツマミ ---
        else if (title === 'Pos1' || title === 'Pos2') {
            e.preventDefault();
            if (!scopeState.isOn) return;

            const step = 5; // 1スクロールで動くピクセル数
            if (title === 'Pos1') {
                scopeState.positionCH1 += (e.deltaY < 0) ? step : -step;
                // ツマミ画像の回転（任意）
                const k = document.getElementById('Pos1');
                if (k) k.style.transform = `rotate(${scopeState.positionCH1}deg)`;
            } else {
                scopeState.positionCH2 += (e.deltaY < 0) ? step : -step;
                const k = document.getElementById('Pos2');
                if (k) k.style.transform = `rotate(${scopeState.positionCH2}deg)`;
            }
        }

        else if (title === 'KNOB_CURSOR' || title === 'Cursrツマミ' ) {
        e.preventDefault();
        if (!scopeState.cursor.show) return; // カーソル非表示時は何もしない

        // スクロール方向の判定 (奥に回すか手前に回すか)
        const direction = e.deltaY > 0 ? 1 : -1;
        const step = 5; // 1回のスクロールで動くピクセル数（好みの速度に調整してください）

        // 選択されているカーソルを動かす
        if (scopeState.cursor.target === 'A') {
            scopeState.cursor.posA += direction * step;
            // 画面外に出ないように制限する場合
            // scopeState.cursor.posA = Math.max(0, Math.min(canvas.width, scopeState.cursor.posA));
        } else if (scopeState.cursor.target === 'B') {
            scopeState.cursor.posB += direction * step;
        }
        drawWaveform(); 


    }




    }, { passive: false });


    // --- ツールチップ関連 ---
    container.addEventListener('mouseover', function(e) {
        if (e.target.classList.contains('hotspot') && descriptions[e.target.title]) {
            tooltip.innerText = descriptions[e.target.title];
            tooltip.style.display = 'block';
        }
    });
    container.addEventListener('mousemove', function(e) {
        if (tooltip && tooltip.style.display === 'block') {
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        }
    });
    container.addEventListener('mouseout', function(e) {
        tooltip.style.display = 'none';
    });
});


// --- 6. マップ変換機能（実装済み=青、未実装=赤 に色分け版） ---
(function convertMapToHotspots() {
    
    // ★「機能が実装されている」ボタン名の一覧
    const activeFeatures = [
        "電源ボタン", "RunStop", "AutoSet", "Meas", 'Cursr',
        "CH1_MENU", "CH2_MENU", "Ch1", "Ch2",
        "KNOB_TIME", "KNOB_VOLT",
        "Volt1", "Volt2", "Volt3", "Volt4",
        "Level", 'Cursrツマミ',
        'ps_power', 'ch1btn', 'ch2btn', 'volt', 'curr', 'output',
        'ch1pura', 'ch1mai', 'ch2pura', 'ch2mai', 'grd',
        'Ch1', 'Ch2', 'Ch3', 'Ch4', 'Pos1', 'Pos2',
        // FGボタン（全て実装済み）
        'latorpowar', 'fctn', 'freq', 'amptd', 'offset',
        'seven', 'eight', 'nine', 'fore', 'five', 'six',
        'one', 'two', 'three', 'zero', 'dot', 'puramai',
        'enter', 'cansel', 'undo', 'out', 'fctnout', 'subout'
    ];

    // FGのマップ名→コンテナIDの特殊マッピング
    // 通常は map.name が "map-xxx" で getElementById("model-xxx") を探すが
    // FGは "fg-map" という名前なので明示的にマッピングする
    const mapNameToContainerId = {
        'fg-map': 'model-fg',
        'adda-map': 'model-adda'
        // 通常のマップは replace('map-', 'model-') で自動処理される
    };

    const maps = document.querySelectorAll('map');
    maps.forEach(map => {
        // コンテナIDを解決（FG用特殊マッピング or 通常ルール）
        const containerId = mapNameToContainerId[map.name] 
                          || map.name.replace('map-', 'model-');
        const targetContainer = document.getElementById(containerId);
        if (!targetContainer) return;

        // FGマップかどうかを判定（クリック処理の振り分けに使う）
        const isFgMap = (map.name === 'fg-map');
        const isAddaMap = (map.name === 'adda-map');

        const areas = map.querySelectorAll('area');
        areas.forEach((area) => {
            const shape = area.getAttribute('shape');
            const coordsStr = area.getAttribute('coords');
            if (!coordsStr) return;
            const coords = coordsStr.split(',').map(Number);
            const title = area.getAttribute('title') || area.getAttribute('alt') || '';

            const div = document.createElement('div');
            div.className = 'hotspot';
            div.title = title;
            div.dataset.btnId = title; // FGボタンIDとして使用
            div.id = 'btn-' + title.replace(/\s+/g, '-');
            div.style.position = 'absolute';
            div.style.zIndex = '100';
            div.style.cursor = 'pointer';

            // FGのhostspotにはクリックハンドラを直接設定
            // （usemapのonclickはズーム時に座標ズレで反応しなくなるため）
            if (isFgMap) {
                div.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // 端子クリック（fctnout / subout）は結線システムへ
                    if (FG_TERMINALS.includes(title)) {
                        handleTerminalClick(title, div);
                    } else {
                        handleFgButton(title);
                    }
                });
            }
            if (isAddaMap) {
                div.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (area.classList.contains('terminal-spot')) {
                        handleTerminalClick(title, div);
                    } else {
                        handleAddaSwitch(title);
                    }
                });
            }

            // 実装状況の色分け
            const isActive = isAddaMap ||
                             activeFeatures.includes(title) || 
                             (typeof menuDataHantek !== 'undefined' && menuDataHantek[title]) ||
                             (typeof menuDataAgilent !== 'undefined' && menuDataAgilent[title]);

            if (isActive) {
                div.style.backgroundColor = 'rgba(0, 100, 255, 0.3)';
                div.style.border = '2px solid rgba(0, 100, 255, 0.6)';
            } else {
                div.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                div.style.border = '1px dashed rgba(255, 0, 0, 0.6)';
            }

            // 座標設定
            if (shape === 'rect') {
                const [x1, y1, x2, y2] = coords;
                div.style.left   = Math.min(x1, x2) + 'px';
                div.style.top    = Math.min(y1, y2) + 'px';
                div.style.width  = Math.abs(x2 - x1) + 'px';
                div.style.height = Math.abs(y2 - y1) + 'px';
            } else if (shape === 'circle') {
                const [x, y, r] = coords;
                div.style.left        = (x - r) + 'px';
                div.style.top         = (y - r) + 'px';
                div.style.width       = (r * 2) + 'px';
                div.style.height      = (r * 2) + 'px';
                div.style.borderRadius = '50%';
            }

            targetContainer.appendChild(div);
        });
    });
})();

// =======================================================================
//  結線（ワイヤー）システム
// =======================================================================

// 結線の状態管理
// 接続情報: { psTerminal: 'ch1pura'|'ch1mai'|'ch2pura'|'ch2mai'|'grd', oscTerminal: 'Ch1'|'Ch2', color: string }
const wiringState = {
    connections: [],       // 確定済みの接続リスト
    pendingTerminal: null, // 最初にクリックした端子の情報 { elementId, terminalName, side:'ps'|'osc', color }
};

// 端子ごとのワイヤー色
const TERMINAL_COLORS = {
    'ch1pura': '#ff4444', // 赤（+）
    'ch2pura': '#ff8800', // オレンジ（+）
    'ch1mai':  '#222222', // 黒（−）
    'ch2mai':  '#222222', // 黒（−）
    'grd':     '#007700', // 緑（GND）
    'Ch1':     '#ffff00', // 黄（オシロCH1）
    'Ch2':     '#00ffff', // 水色（オシロCH2）
    'fctnout': '#ff6600', // オレンジ（FG メイン出力）
    'subout':  '#cc44ff', // 紫（FG サブ出力）
};

// SVGオーバーレイを生成・取得
function getWireSVG() {
    let svg = document.getElementById('wire-overlay');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'wire-overlay';
        svg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:500;';
        document.body.appendChild(svg);
    }
    return svg;
}

// 端子のホットスポット要素の画面上の中心座標を取得
function getTerminalScreenPos(hotspotEl) {
    const rect = hotspotEl.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}

// 端子の「側（ps/fg/osc/adda）」と端子名から、その端子のホットスポット要素を取得する
// 注意: 各コンテナ内には <map><area title="xxx"> が自動生成された
// <div class="hotspot" title="xxx"> より前にDOM上に存在することがある。
// [title=...] セレクタだと、サイズを持たない <area> が先にマッチしてしまい
// getBoundingClientRect() が (0,0,0,0) になってしまうため、
// 必ずホットスポットdiv（id="btn-xxx"）を優先的に取得する。
function getTerminalElementForSide(side, termName) {
    if (!termName) return null;

    if (side === 'osc') {
        // 現在表示されている（display: none でない）オシロスコープのコンテナを取得
        const activeOscContainer = Array.from(document.querySelectorAll('#osc-container .instrument-container'))
                                        .find(el => el.style.display !== 'none');
        if (!activeOscContainer) return null;
        return activeOscContainer.querySelector('#btn-' + termName) ||
               activeOscContainer.querySelector(`[title="${termName}"]`) ||
               activeOscContainer.querySelector(`[alt="${termName}"]`);
    }
    if (side === 'fg') {
        const fgContainer = document.getElementById('model-fg');
        if (!fgContainer) return null;
        return fgContainer.querySelector('#btn-' + termName) ||
               fgContainer.querySelector(`.hotspot[title="${termName}"]`);
    }
    if (side === 'adda') {
        const addaContainer = document.getElementById('model-adda');
        if (!addaContainer) return null;
        return addaContainer.querySelector('#btn-' + termName) ||
               addaContainer.querySelector(`.hotspot[title="${termName}"]`);
    }
    // 'ps' またはそれ以外
    return document.getElementById('btn-' + termName);
}

// ワイヤーを全て再描画
function redrawWires() {
    const svg = getWireSVG();
    svg.innerHTML = ''; // 一旦クリア

    // 確定済みの接続を描画
    wiringState.connections.forEach(conn => {
        let side1, term1, side2, term2;

        if (conn.type === 'fg') {
            side1 = 'fg';  term1 = conn.fgTerminal;
            side2 = 'osc'; term2 = conn.oscTerminal;
        } else if (conn.type === 'adda') {
            side1 = 'adda'; term1 = conn.addaTerminal || conn.psTerminal;
            side2 = 'osc';  term2 = conn.oscTerminal;
        } else if (conn.type === 'ps-adda') {
            side1 = 'ps';   term1 = conn.psTerminal;
            side2 = 'adda'; term2 = conn.addaTerminal;
        } else if (conn.type === 'fg-adda') {
            side1 = 'fg';   term1 = conn.fgTerminal;
            side2 = 'adda'; term2 = conn.addaTerminal;
        } else {
            // 'ps'（直流電源 ↔ オシロ、従来どおり）
            side1 = 'ps';  term1 = conn.psTerminal;
            side2 = 'osc'; term2 = conn.oscTerminal;
        }

        const el1 = getTerminalElementForSide(side1, term1);
        const el2 = getTerminalElementForSide(side2, term2);
        if (!el1 || !el2) return;

        const p1 = getTerminalScreenPos(el1);
        const p2 = getTerminalScreenPos(el2);
        drawWire(svg, p1, p2, conn.color, false);
    });

    // 選択中（未確定）の端子をハイライト
    if (wiringState.pendingTerminal) {
        // 【修正】getElementByIdで再取得せず、保存しておいた要素（el）をそのまま使うことでズレを防止
        const el = wiringState.pendingTerminal.el;
        if (el) {
            const pos = getTerminalScreenPos(el);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', pos.x);
            circle.setAttribute('cy', pos.y);
            circle.setAttribute('r', 12);
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', wiringState.pendingTerminal.color);
            circle.setAttribute('stroke-width', 3);
            circle.setAttribute('stroke-dasharray', '4 3');
            circle.style.animation = 'wirePulse 0.8s ease-in-out infinite alternate';
            svg.appendChild(circle);
        }
    }
}

// ベジェ曲線でワイヤーを描く
function drawWire(svg, p1, p2, color, dashed) {
    // ワイヤーの影（立体感）
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const mx = (p1.x + p2.x) / 2;
    const my = Math.max(p1.y, p2.y) + Math.abs(p2.x - p1.x) * 0.3 + 40;
    const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;

    shadow.setAttribute('d', d);
    shadow.setAttribute('fill', 'none');
    shadow.setAttribute('stroke', 'rgba(0,0,0,0.35)');
    shadow.setAttribute('stroke-width', 7);
    shadow.setAttribute('stroke-linecap', 'round');
    svg.appendChild(shadow);

    // 本体のワイヤー
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', 4);
    path.setAttribute('stroke-linecap', 'round');
    if (dashed) path.setAttribute('stroke-dasharray', '8 5');
    svg.appendChild(path);

    // 両端の丸
    [p1, p2].forEach(p => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        dot.setAttribute('r', 5);
        dot.setAttribute('fill', color);
        dot.setAttribute('stroke', 'white');
        dot.setAttribute('stroke-width', 1.5);
        svg.appendChild(dot);
    });
}

// SVGアニメーション用スタイルを追加
(function addWireStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes wirePulse {
            from { opacity: 1; r: 10; }
            to   { opacity: 0.4; r: 14; }
        }
        .hotspot.wire-selected {
            box-shadow: 0 0 0 4px #fff, 0 0 0 7px gold !important;
            z-index: 200 !important;
        }
        .hotspot.wire-connected {
            border-color: rgba(0,255,100,0.9) !important;
            background-color: rgba(0,200,80,0.25) !important;
        }
        #wire-status-bar {
            position: fixed;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.82);
            color: #fff;
            padding: 8px 20px;
            border-radius: 20px;
            font-size: 14px;
            font-family: sans-serif;
            z-index: 9999;
            pointer-events: none;
            transition: opacity 0.4s;
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
})();

// ステータスバーにメッセージを表示
function showWireStatus(msg, durationMs = 2500) {
    let bar = document.getElementById('wire-status-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'wire-status-bar';
        document.body.appendChild(bar);
    }
    bar.textContent = msg;
    bar.style.opacity = '1';
    clearTimeout(bar._hideTimer);
    bar._hideTimer = setTimeout(() => { bar.style.opacity = '0'; }, durationMs);
}

// 端子がPS側かオシロ側かを判定
const PS_TERMINALS  = ['ch1pura','ch1mai','ch2pura','ch2mai','grd'];
const OSC_TERMINALS = ['Ch1','Ch2'];
const FG_TERMINALS  = ['fctnout','subout']; // 発振器の出力端子

function getTerminalSide(name) {
    if (PS_TERMINALS.includes(name))  return 'ps';
    if (OSC_TERMINALS.includes(name)) return 'osc';
    if (FG_TERMINALS.includes(name))  return 'fg';
    return null;
}

// 接続情報をもとにオシロスコープの入力電圧を更新
// 接続情報をもとにオシロスコープの入力電圧を更新
function updateOscilloscopeSignal() {
    // CH1/CH2 それぞれについて、結線があるか・電源ONか・出力ONかを確認
    ['CH1', 'CH2'].forEach(ch => {
        const termName = ch === 'CH1' ? 'Ch1' : 'Ch2';
        const conn = wiringState.connections.find(c => c.oscTerminal === termName);

        // 【修正】結線がない場合は、オシロの入力を 0V に戻して終了する
        if (!conn) {
            if (scopeState.signals && scopeState.signals[ch]) {
                scopeState.signals[ch].dcOverride = 0;
            }
            return;
        }

        let psVoltage = 0;
        if (psState.isOn && psState.isOutputOn) {
            // 【修正】プラスならそのまま、マイナスなら「-（マイナス）」を掛けて電圧を設定
            if (conn.psTerminal === 'ch1pura') {
                psVoltage = psState.ch1.voltage;
            } else if (conn.psTerminal === 'ch1mai') {
                psVoltage = -psState.ch1.voltage; // 💡マイナス電圧にする
            } else if (conn.psTerminal === 'ch2pura') {
                psVoltage = psState.ch2.voltage;
            } else if (conn.psTerminal === 'ch2mai') {
                psVoltage = -psState.ch2.voltage; // 💡マイナス電圧にする
            }
        }
        
        if (scopeState.signals && scopeState.signals[ch]) {
            scopeState.signals[ch].dcOverride = psVoltage;
        }
    });
}

// 発振器の結線に応じてオシロスコープの信号を更新
function updateFgWireSignal() {
    // 発振器がONかつ出力ONかどうかを確認
    const fgActive = fgState.power && fgState.outputOn;

    ['CH1', 'CH2'].forEach(ch => {
        const termName = ch === 'CH1' ? 'Ch1' : 'Ch2';
        const conn = wiringState.connections.find(c => c.oscTerminal === termName && c.type === 'fg');

        if (!conn) return; // この ch への FG 接続なし → 変更しない

        if (fgActive) {
            // 波形タイプをscope形式に変換
            const waveMap = { 'SINE': 'sine', 'SQUARE': 'square', 'RAMP': 'tri' };
            const waveType = waveMap[fgState.waveform] || 'sine';
            const amplitude = fgState.amptd / 2; // Vpp → 振幅(片側)

            scopeState.signals[ch] = {
                type: waveType,
                amplitude: amplitude,
                frequency: fgState.freq,
                offset: fgState.offset,
                source: 'fg_wire'
            };

            // オシロの入力ソースをFGモードに
            if (scopeState.inputSource !== 'fg') {
                scopeState.inputSource = 'fg';
            }
            // 時間軸を自動調整
            autoAdjustTimeAxis(fgState.freq);
        } else {
            // FG出力OFFの場合はフラットライン
            scopeState.signals[ch] = { type: 'flat', amplitude: 0, frequency: 1, offset: 0, source: 'fg_wire' };
        }
    });
}

// 端子クリック処理（hotspotのclickから呼び出す）
function handleTerminalClick(terminalName, hotspotEl) {
    const side = getTerminalSide(terminalName);
    if (!side) return false; // 端子でない

    const color = TERMINAL_COLORS[terminalName] || '#ffffff';

    if (!wiringState.pendingTerminal) {
        // ─── 1本目の端子を選択 ───
        wiringState.pendingTerminal = { terminalName, side, color, el: hotspotEl };
        hotspotEl.classList.add('wire-selected');
        showWireStatus(`🔌 端子「${terminalName}」を選択。次に接続先の端子をクリックしてください。`, 5000);
        redrawWires();
    } else {
        // ─── 2本目の端子を選択 → 結線を確定 ───
        const pending = wiringState.pendingTerminal;

        // 同じ端子を再クリック → キャンセル
        if (pending.terminalName === terminalName) {
            pending.el.classList.remove('wire-selected');
            wiringState.pendingTerminal = null;
            showWireStatus('❌ 選択を解除しました。');
            redrawWires();
            return true;
        }

        // 同じサイド同士はNG
        if (pending.side === side) {
            const sideNames = { ps: '直流電源', osc: 'オシロスコープ', fg: '発振器' };
            showWireStatus(`⚠️ ${sideNames[side]}の端子同士は繋げません。`);
            return true;
        }

        // FG ↔ OSC の結線
        if ((pending.side === 'fg' && side === 'osc') || (pending.side === 'osc' && side === 'fg')) {
            const oscTerm = side === 'osc' ? terminalName : pending.terminalName;
            const fgTerm  = side === 'fg'  ? terminalName : pending.terminalName;

            // 既に同じオシロ端子に別の線がある場合は削除
            wiringState.connections = wiringState.connections.filter(c => c.oscTerminal !== oscTerm);

            const wireColor = TERMINAL_COLORS[fgTerm] || color;
            wiringState.connections.push({ fgTerminal: fgTerm, oscTerminal: oscTerm, color: wireColor, type: 'fg' });

            pending.el.classList.remove('wire-selected');
            pending.el.classList.add('wire-connected');
            hotspotEl.classList.add('wire-connected');
            wiringState.pendingTerminal = null;

            updateFgWireSignal();
            showWireStatus(`✅ 発振器(${fgTerm}) ↔ オシロ(${oscTerm}) を接続しました。右クリックで切断できます。`);
            redrawWires();
            return true;
        }

        // PS ↔ OSC の結線（従来どおり）
        if ((pending.side === 'ps' && side === 'osc') || (pending.side === 'osc' && side === 'ps')) {
            // 既に同じオシロ端子に別の線が繋がっている場合は既存を削除
            const oscTerm  = side === 'osc' ? terminalName : pending.terminalName;
            const psTerm   = side === 'ps'  ? terminalName : pending.terminalName;
            wiringState.connections = wiringState.connections.filter(c => c.oscTerminal !== oscTerm);

            // 新しい接続を追加
            const wireColor = TERMINAL_COLORS[psTerm] || color;
            wiringState.connections.push({ psTerminal: psTerm, oscTerminal: oscTerm, color: wireColor, type: 'ps' });

            // UI更新
            pending.el.classList.remove('wire-selected');
            pending.el.classList.add('wire-connected');
            hotspotEl.classList.add('wire-connected');

            wiringState.pendingTerminal = null;

            // 結線に応じてオシロ信号を更新
            updateOscilloscopeSignal();

            showWireStatus(`✅ ${psTerm} ↔ ${oscTerm} を接続しました。右クリックで切断できます。`);
            redrawWires();

            // 直流電源モードに自動切替（結線したとき）
            if (scopeState.inputSource !== 'power_supply') {
                switchInputSource('power_supply');
            }
            return true;
        }

        // それ以外の組み合わせはNG（PS ↔ FG など）
        showWireStatus('⚠️ この端子の組み合わせは接続できません。');
    }
    return true;
}

// 右クリックで切断
document.addEventListener('contextmenu', function(e) {
    const el = e.target.closest('.hotspot');
    if (!el) return;
    const terminalName = el.title;
    const side = getTerminalSide(terminalName);
    if (!side) return;

    e.preventDefault();

    // この端子を含む接続を全て削除
    const before = wiringState.connections.length;
    if (side === 'ps') {
        wiringState.connections = wiringState.connections.filter(c => c.psTerminal !== terminalName);
    } else if (side === 'fg') {
        wiringState.connections = wiringState.connections.filter(c => c.fgTerminal !== terminalName);
    } else if (side === 'adda') {
        wiringState.connections = wiringState.connections.filter(c => c.addaTerminal !== terminalName);
    } else {
        wiringState.connections = wiringState.connections.filter(c => c.oscTerminal !== terminalName);
    }
    const after = wiringState.connections.length;

    // ハイライト解除
    el.classList.remove('wire-connected', 'wire-selected');

    // 未確定の選択もキャンセル
    if (wiringState.pendingTerminal) {
        const pEl = document.getElementById('btn-' + wiringState.pendingTerminal.terminalName);
        if (pEl) pEl.classList.remove('wire-selected');
        wiringState.pendingTerminal = null;
    }

    updateOscilloscopeSignal();
    updateFgWireSignal();

    // TB1に結線されていた機器が切断された場合はAD/DA入力状態もリセット
    if (typeof adDaState !== 'undefined') {
        const tb1StillWired = wiringState.connections.some(c => c.addaTerminal === 'TB1');
        if (!tb1StillWired) adDaState.tb1Wired = null;
        if (document.getElementById('adda-photo-ui')) {
            updateAdDaPanelDisplay();
            updateAdDaTerminalSignals();
        }
    }

    redrawWires();

    if (before !== after) {
        showWireStatus(`🔌 接続を切断しました。`);
    }
});

// 全結線を削除
function clearAllWires() {
    // ハイライトを全解除
    document.querySelectorAll('.hotspot.wire-connected, .hotspot.wire-selected').forEach(el => {
        el.classList.remove('wire-connected', 'wire-selected');
    });
    wiringState.connections = [];
    wiringState.pendingTerminal = null;
    updateOscilloscopeSignal();
    updateFgWireSignal();

    if (typeof adDaState !== 'undefined') {
        adDaState.tb1Wired = null;
        if (document.getElementById('adda-photo-ui')) {
            updateAdDaPanelDisplay();
            updateAdDaTerminalSignals();
        }
    }

    redrawWires();
    showWireStatus('🔌 すべての結線を解除しました。');
}

const _origMouseMove = document.onmousemove;
document.addEventListener('mousemove', function() {
    if (dragTarget) redrawWires();
});

// ウィンドウリサイズ時にも再描画
window.addEventListener('resize', redrawWires);

// アプリケーション開始
animationLoop();

// AD/DA変換装置パネルを作成
window.addEventListener('load', function() {
    createAdDaPanel();
    
    // 器具リストにAD/DA装置を追加
    const equipList = document.querySelector('.equipment-list');
    if (equipList) {
        const adDaItem = document.createElement('li');
        adDaItem.innerHTML = 'AD/DA変換機';
        adDaItem.onclick = function() {
            toggleEquipment('adda');
        };
        equipList.appendChild(adDaItem);
    }
});

// =======================================================================
//  実技テストモード機能
// =======================================================================

// テストの状態管理
let testState = {
    active: false,
    currentQuestionIndex: 0
};

// --- 問題データの定義 ---
// setup: 問題開始時にオシロの設定をわざと狂わせる関数
// check: ユーザーの設定が正しいか判定する関数 (trueなら正解)
const quizData = [
    {
        id: 1,
        text: "【第1問】CH1の波形が画面からはみ出しています。<br>電圧レンジ(Volts/Div)を調整して、波形全体が見えるように「2.00V」に設定してください。",
        setup: function() {
            // 初期設定: わざと拡大しすぎてはみ出させる
            scopeState.isOn = true;
            scopeState.activeChannel = 'CH1';
            scopeState.voltIndexCH1 = 3; // 0.1V (はみ出す設定)
            scopeState.signals['CH1'].type = 'sine';
            scopeState.signals['CH1'].amplitude = 3.0; // 振幅3V
            drawWaveform();
        },
        check: function() {
            // 正解条件: CH1の電圧インデックスが 2.0V (Index=7) になっていること
            // VOLT_STEPS = [0.01, ..., 1.0(6), 2.0(7), ...]
            return VOLT_STEPS[scopeState.voltIndexCH1] === 2.0;
        },
        hint: "ヒント: 画像上の「電圧ツマミ」の上でマウスホイールを手前に回すと、レンジが広がります。"
    },
    {
        id: 2,
        text: "【第2問】波形の周期が細かすぎて見づらい状態です。<br>時間軸(Time/Div)を調整して、ゆったり見えるように「5.00ms」に設定してください。",
        setup: function() {
            // 初期設定: 時間軸を細かくしすぎる
            scopeState.timeIndex = 6;
            drawWaveform();
        },
        check: function() {
            // 正解条件: 時間軸が 5ms (0.005s)
            // TIME_STEPS配列の中から 0.005 を探すか、値を直接比較
            const currentT = TIME_STEPS[scopeState.timeIndex];
            // 浮動小数点計算の誤差を考慮して差分で比較するのが安全
            return Math.abs(currentT - 0.005) < 0.0001;
        },
        hint: "ヒント: 右上の「時間ツマミ」を操作してください。"
    },
    {
        id: 3,
        text: "【第3問: 信号の切り替え】<br>現在、画面には丸みを帯びた「正弦波(Sine)」が表示されています。<br>左側のコントロールパネルにあるボタンを操作して、入力信号を角張った「矩形波(Square)」に切り替えてください。",
        setup: function() {
            // 初期設定: 見やすいように調整しつつ、必ずSine波にする
            scopeState.isOn = true;
            scopeState.activeChannel = 'CH1';
            
            scopeState.signals['CH1'].type = 'sine'; // ★ここを正弦波に固定
            scopeState.signals['CH1'].amplitude = 2.0; 
            
            scopeState.voltIndexCH1 = 6; // 1.0V/div (見やすい大きさ)
            scopeState.timeIndex = 15;   // 0.1s (見やすい周期)
            
            updateControlPanelUI(); // パネルのボタン表示を同期
            drawWaveform();
        },
        check: function() {
            // 正解条件: CH1の信号タイプが 'square' になっているか
            return scopeState.signals['CH1'].type === 'square';
        },
        hint: "ヒント: 画面左側（CONTROL PANEL）の下の方にある「SIGNAL GEN」エリアを見てください。「Square」というボタンがあります。"
    },
    {
        id: 4,
        text: "【最終問題】波形の動きを止めて(STOP状態にして)ください。",
        setup: function() {
            scopeState.isRunning = true;
        },
        check: function() {
            return scopeState.isRunning === false;
        },
        hint: "ヒント: 右上の「Run/Stop」ボタンを押します。"
    }
];

// --- テスト制御関数 ---

function startTestMode() {
    testState.active = true;
    testState.currentQuestionIndex = 0;
    
    // パネルを表示
    document.getElementById('test-panel').style.display = 'block';
    
    // 第1問を表示
    showQuestion();
    
    // 画面位置へスクロール
    document.getElementById('test-panel').scrollIntoView({behavior: "smooth"});
}

function showQuestion() {
    const q = quizData[testState.currentQuestionIndex];
    
    // 問題文セット
    document.getElementById('question-text').innerHTML = q.text;
    document.getElementById('question-counter').innerText = `Q ${testState.currentQuestionIndex + 1} / ${quizData.length}`;
    
    // フィードバックリセット
    const fb = document.getElementById('test-feedback');
    fb.innerHTML = "";
    fb.className = "";
    
    // ボタン状態リセット
    document.getElementById('btn-check-answer').style.display = 'inline-block';
    document.getElementById('btn-next-question').style.display = 'none';

    // ★重要: 問題ごとの初期状態（セットアップ）を実行
    if (q.setup) {
        q.setup();
        updateControlPanelUI(); // UIの同期
    }
}

function checkTestAnswer() {
    const q = quizData[testState.currentQuestionIndex];
    const fb = document.getElementById('test-feedback');
    
    // 判定ロジック実行
    const isCorrect = q.check();
    
    if (isCorrect) {
        fb.innerHTML = "正解です！素晴らしい！";
        fb.className = "feedback-correct";
        
        // 「解答」ボタンを隠して「次へ」ボタンを表示
        document.getElementById('btn-check-answer').style.display = 'none';
        
        if (testState.currentQuestionIndex < quizData.length - 1) {
            document.getElementById('btn-next-question').style.display = 'inline-block';
        } else {
            fb.innerHTML += "<br>すべてのテストが終了しました！";
        }
    } else {
        fb.innerHTML = "不正解です。<br>" + q.hint;
        fb.className = "feedback-wrong";
    }
}

function nextQuestion() {
    testState.currentQuestionIndex++;
    showQuestion();
}

// テストモードを中断して閉じる関数
function quitTestMode() {
    // 1. テスト状態を解除
    testState.active = false;
    
    // 2. パネルを非表示にする
    document.getElementById('test-panel').style.display = 'none';

    // 3. フィードバック（正解・不正解の文字）をリセットしておく
    document.getElementById('test-feedback').innerHTML = "";
    document.getElementById('test-feedback').className = "";
}

// script.js の末尾に追加

// ==========================================
// ドラッグ＆ドロップの実装（シンプル版）
// ==========================================

let dragTarget = null;
let drag_x_pos = 0, drag_y_pos = 0, drag_x_elem = 0, drag_y_elem = 0;

document.addEventListener('mousedown', function(e) {
    if (e.target.tagName === 'CANVAS') return;
    // hotspot（ボタン）上のクリックはドラッグ開始しない
    if (e.target.classList.contains('hotspot')) return;

    // クリックされた要素から親の.draggable-equipmentを探す
    const target = e.target.closest('.draggable-equipment');
    if (!target) return;

    dragTarget = target;
    bringToFront(dragTarget);

    drag_x_pos  = e.clientX;
    drag_y_pos  = e.clientY;
    drag_x_elem = dragTarget.offsetLeft;
    drag_y_elem = dragTarget.offsetTop;

    e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
    if (!dragTarget) return;
    dragTarget.style.left = (drag_x_elem + e.clientX - drag_x_pos) + 'px';
    dragTarget.style.top  = (drag_y_elem + e.clientY - drag_y_pos) + 'px';
});

document.addEventListener('mouseup', function() {
    dragTarget = null;
});

function bringToFront(elm) {
    document.querySelectorAll('.draggable-equipment').forEach(d => d.style.zIndex = 10);
    elm.style.zIndex = 100;
}

function toggleSidebar() {
    document.getElementById('equipment-sidebar').classList.toggle('open');
}

function toggleEquipment(eqId) {
    const container = document.getElementById(eqId + '-container');
    if (!container) return;
    if (container.style.display === 'none') {
        container.style.display = 'block';
        bringToFront(container);
        // 表示したばかりのコンテナにも現在のズームを適用する
        setZoom(currentZoom);
    } else {
        container.style.display = 'none';
    }
}

function updatePSDisplay() {
    const ids = ['disp-ch1-v', 'disp-ch1-a', 'disp-ch2-v', 'disp-ch2-a'];
    const elements = ids.map(id => document.getElementById(id));
    
    // 要素が見つからない場合は中断
    if (elements.some(el => !el)) return;

    // 電源がOFFなら真っ暗にする
    if (!psState.isOn) {
        elements.forEach(el => el.textContent = "");
        return;
    }

    // 電源ONなら数値を表示
    document.getElementById('disp-ch1-v').textContent = psState.ch1.voltage.toFixed(2).padStart(5, '0');
    document.getElementById('disp-ch1-a').textContent = psState.ch1.current.toFixed(3);
    document.getElementById('disp-ch2-v').textContent = psState.ch2.voltage.toFixed(2).padStart(5, '0');
    document.getElementById('disp-ch2-a').textContent = psState.ch2.current.toFixed(3);
}

// ==========================================
// 発振器 (ファンクションジェネレータ) の制御
// ==========================================

// 発振器の内部状態を管理するオブジェクト
let fgState = {
    power: false,
    waveform: 'SINE',  // SINE(正弦波), SQUARE(方形波), RAMP(三角波)
    freq: 1000,        // 周波数 (Hz)
    amptd: 1.0,        // 振幅 (Vpp)
    offset: 0.0,       // オフセット (V)
    outputOn: false,   // 出力ボタンのON/OFF
    inputMode: '',     // 現在入力中の項目 ('FREQ', 'AMPTD', 'OFFSET')
    inputValue: ''     // テンキーで入力中の文字列
};

// =======================================================================
//  AD/DA変換装置 (ITF-203B) の状態管理
// =======================================================================
const adDaState = {
    power: true,           // 装置電源（常にON想定）
    inputSource: 'fg',     // 入力ソース: 'fg'(発振器) or 'dc'(直流電源)　※表示上の既定値
    resolution: 8,         // 量子化ビット数 (4 or 8)
    samplingPeriodUs: 5,   // サンプリング周期 [µs] 選択肢: 5,10,50,100,200,500
    FSR: 10.24,            // フルスケールレンジ [V] (実機ITF-203Bの仕様)
    mode: 'bipolar',       // 'unipolar' or 'bipolar'

    // 利用可能なサンプリング周期の選択肢 [µs]
    samplingOptions: [5, 10, 50, 100, 200, 500],

    // TB1（信号入力端子）に実際に結線されている機器: 'dc' | 'fg' | null
    // 実機同様、ここに何も結線されていない場合は入力信号が無いものとして扱う
    tb1Wired: null,
};

// AD/DA変換装置パネルのUIを作成する関数
function createAdDaPanel() {
    // 既存があれば削除
    const existing = document.getElementById('adda-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'adda-panel';
    panel.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        width: 280px;
        background: #1a1a2e;
        border: 2px solid #4a90e2;
        border-radius: 10px;
        padding: 15px;
        color: white;
        font-family: 'Courier New', monospace;
        z-index: 800;
        box-shadow: 0 0 20px rgba(74, 144, 226, 0.4);
    `;

    panel.innerHTML = `
        <div style="text-align:center; margin-bottom:10px;">
            <span style="font-size:14px; font-weight:bold; color:#4a90e2;">AD/DA変換装置 (ITF-203B)</span>
        </div>
        
        <div style="background:#0d0d1a; padding:8px; border-radius:5px; margin-bottom:10px; font-size:12px; line-height:1.6;">
            <div style="color:#00ff88;">▶ サンプリング周波数: <span id="adda-fs">200 kHz</span></div>
            <div style="color:#ffaa00;">▶ 量子化ビット数: <span id="adda-bits">8 bit</span></div>
            <div style="color:#ff88aa;">▶ 量子化ステップ: <span id="adda-step">0.04 V</span></div>
            <div style="color:#88aaff;">▶ 入力: <span id="adda-input-src">発振器(FG)</span></div>
        </div>

        <div style="margin-bottom:8px;">
            <label style="font-size:11px; color:#aaa;">サンプリング周期 (SW4):</label>
            <select id="adda-sampling" onchange="onAdDaSamplingChange(this.value)" 
                style="width:100%; background:#2a2a4a; color:white; border:1px solid #4a90e2; 
                       padding:4px; border-radius:4px; margin-top:4px;">
                <option value="5">5 µs (fs=200kHz)</option>
                <option value="10">10 µs (fs=100kHz)</option>
                <option value="50">50 µs (fs=20kHz)</option>
                <option value="100">100 µs (fs=10kHz)</option>
                <option value="200">200 µs (fs=5kHz)</option>
                <option value="500">500 µs (fs=2kHz)</option>
            </select>
        </div>

        <div style="margin-bottom:8px;">
            <label style="font-size:11px; color:#aaa;">量子化ビット数 (SW4):</label>
            <div style="display:flex; gap:8px; margin-top:4px;">
                <button onclick="onAdDaBitsChange(4)" id="adda-btn-4bit"
                    style="flex:1; background:#2a2a4a; color:white; border:1px solid #4a90e2; 
                           padding:5px; border-radius:4px; cursor:pointer;">4 bit</button>
                <button onclick="onAdDaBitsChange(8)" id="adda-btn-8bit"
                    style="flex:1; background:#4a90e2; color:white; border:1px solid #4a90e2; 
                           padding:5px; border-radius:4px; cursor:pointer; font-weight:bold;">8 bit</button>
            </div>
        </div>

        <div style="margin-bottom:8px;">
            <label style="font-size:11px; color:#aaa;">入力接続:</label>
            <div style="display:flex; gap:8px; margin-top:4px;">
                <button onclick="onAdDaSourceChange('fg')" id="adda-btn-fg"
                    style="flex:1; background:#4a90e2; color:white; border:1px solid #4a90e2; 
                           padding:5px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">発振器(FG)</button>
                <button onclick="onAdDaSourceChange('dc')" id="adda-btn-dc"
                    style="flex:1; background:#2a2a4a; color:white; border:1px solid #4a90e2; 
                           padding:5px; border-radius:4px; cursor:pointer; font-size:11px;">直流電源</button>
            </div>
        </div>

        <div style="background:#0d0d1a; padding:8px; border-radius:5px; font-size:11px; color:#888; line-height:1.5;">
            <div>💡 CH1: DA変換出力（オシロCH1へ）</div>
            <div>💡 CH2: 入力原波形（オシロCH2へ）</div>
        </div>
    `;

    document.body.appendChild(panel);
    updateAdDaPanelDisplay();
}

// AD/DA変換装置パネルの表示を更新
function updateAdDaPanelDisplay() {
    const fsHz = 1000000 / adDaState.samplingPeriodUs;
    const fsText = fsHz >= 1000 ? (fsHz/1000).toFixed(0) + ' kHz' : fsHz + ' Hz';
    const q = adDaState.FSR / Math.pow(2, adDaState.resolution);

    const el_fs = document.getElementById('adda-fs');
    const el_bits = document.getElementById('adda-bits');
    const el_step = document.getElementById('adda-step');
    const el_src = document.getElementById('adda-input-src');

    if (el_fs) el_fs.textContent = fsText;
    if (el_bits) el_bits.textContent = adDaState.resolution + ' bit';
    if (el_step) el_step.textContent = q.toFixed(4) + ' V';
    if (el_src) el_src.textContent = adDaState.inputSource === 'fg' ? '発振器(FG)' : '直流電源';
}

// サンプリング周期変更
function onAdDaSamplingChange(val) {
    adDaState.samplingPeriodUs = parseInt(val);
    updateAdDaPanelDisplay();
    showWireStatus(`サンプリング周期: ${val} µs に変更しました`);
}

// 量子化ビット数変更
function onAdDaBitsChange(bits) {
    adDaState.resolution = bits;
    document.getElementById('adda-btn-4bit').style.background = bits === 4 ? '#4a90e2' : '#2a2a4a';
    document.getElementById('adda-btn-4bit').style.fontWeight = bits === 4 ? 'bold' : 'normal';
    document.getElementById('adda-btn-8bit').style.background = bits === 8 ? '#4a90e2' : '#2a2a4a';
    document.getElementById('adda-btn-8bit').style.fontWeight = bits === 8 ? 'bold' : 'normal';
    updateAdDaPanelDisplay();
    showWireStatus(`量子化ビット数: ${bits} bit に変更しました`);
}

// 入力ソース変更
function onAdDaSourceChange(src) {
    adDaState.inputSource = src;
    document.getElementById('adda-btn-fg').style.background = src === 'fg' ? '#4a90e2' : '#2a2a4a';
    document.getElementById('adda-btn-fg').style.fontWeight = src === 'fg' ? 'bold' : 'normal';
    document.getElementById('adda-btn-dc').style.background = src === 'dc' ? '#4a90e2' : '#2a2a4a';
    document.getElementById('adda-btn-dc').style.fontWeight = src === 'dc' ? 'bold' : 'normal';
    updateAdDaPanelDisplay();

    // オシロの入力ソースも自動切替
    if (src === 'dc') {
        switchInputSource('power_supply');
    } else {
        switchInputSource('fg');
    }
}

// マップのエリアがクリックされたときの処理
function handleFgButton(btnId) {
    // 1. 電源ボタンの処理
    if (btnId === 'latorpowar') {
        fgState.power = !fgState.power;
        if (!fgState.power) {
            fgState.outputOn = false; // 電源OFFで出力も切る
            fgState.inputMode = '';
            fgState.inputValue = '';
        }
        updateFgDisplay();
        return;
    }

    // 電源が入っていない場合は他のボタンは反応しない
    if (!fgState.power) return;

    // 2. テンキー入力処理
    const numMap = { 'zero':'0', 'one':'1', 'two':'2', 'three':'3', 'fore':'4', 'five':'5', 'six':'6', 'seven':'7', 'eight':'8', 'nine':'9' };
    
    if (numMap[btnId]) {
        if (fgState.inputMode) fgState.inputValue += numMap[btnId];
    } else if (btnId === 'dot') {
        if (fgState.inputMode && !fgState.inputValue.includes('.')) {
            fgState.inputValue += '.';
        }
    } else if (btnId === 'puramai') {
        if (fgState.inputMode) {
            if (fgState.inputValue.startsWith('-')) {
                fgState.inputValue = fgState.inputValue.substring(1); // マイナスを外す
            } else {
                fgState.inputValue = '-' + fgState.inputValue; // マイナスをつける
            }
        }
    } 
    // 3. キャンセル・取り消し
    else if (btnId === 'cansel' || btnId === 'undo') {
        fgState.inputValue = ''; // 入力中の値をクリア
    } 
    // 4. Enterキー (入力値の確定)
    else if (btnId === 'enter') {
        if (fgState.inputMode && fgState.inputValue !== '') {
            let val = parseFloat(fgState.inputValue);
            if (!isNaN(val)) {
                if (fgState.inputMode === 'FREQ') {
                    fgState.freq = Math.max(0.001, Math.min(2000000, val));
                }
                if (fgState.inputMode === 'AMPTD') {
                    fgState.amptd = Math.max(0.001, Math.min(10.0, val));
                }
                if (fgState.inputMode === 'OFFSET') {
                    fgState.offset = Math.max(-5.0, Math.min(5.0, val));
                }
            }
        }
        // 確定したら入力モードを解除
        fgState.inputMode = '';
        fgState.inputValue = '';
    } 
    // 5. 波形切り替え (fctn)
    else if (btnId === 'fctn') {
        const waves = ['SINE', 'SQUARE', 'RAMP'];
        let currentIndex = waves.indexOf(fgState.waveform);
        fgState.waveform = waves[(currentIndex + 1) % waves.length];
        showWireStatus(`波形: ${fgState.waveform} に切替`);
    } 
    // 6. パラメータ選択 (周波数、振幅、オフセット)
    else if (btnId === 'freq') {
        fgState.inputMode = 'FREQ';
        fgState.inputValue = '';
    } else if (btnId === 'amptd') {
        fgState.inputMode = 'AMPTD';
        fgState.inputValue = '';
    } else if (btnId === 'offset') {
        fgState.inputMode = 'OFFSET';
        fgState.inputValue = '';
    } 
    // 7. 出力ON/OFF切替
    else if (btnId === 'out') {
        fgState.outputOn = !fgState.outputOn;
        if (fgState.outputOn) {
            // 出力ONになったらオシロを自動起動
            if (!scopeState.isOn) {
                scopeState.isOn = true;
                scopeState.isRunning = true;
            }
            // FGワイヤー接続がある場合はワイヤー経由で信号更新
            const hasFgWire = wiringState.connections.some(c => c.type === 'fg');
            if (hasFgWire) {
                updateFgWireSignal();
            } else {
                // AD/DA入力ソースをFGに切替（ワイヤーなしの旧来動作）
                adDaState.inputSource = 'fg';
                const btnFg = document.getElementById('adda-btn-fg');
                const btnDc = document.getElementById('adda-btn-dc');
                if (btnFg) { btnFg.style.background = '#4a90e2'; btnFg.style.fontWeight = 'bold'; }
                if (btnDc) { btnDc.style.background = '#2a2a4a'; btnDc.style.fontWeight = 'normal'; }
            }
            showWireStatus('📡 発振器 OUTPUT ON');
        } else {
            updateFgWireSignal(); // 出力OFFになったら接続先もフラットにする
            showWireStatus('🔇 発振器 OUTPUT OFF');
        }
    }

    // 表示を更新
    updateFgDisplay();
}

// 画面表示を更新する関数
function updateFgDisplay() {
    const display = document.getElementById('fg-display');
    
    // 電源OFFの場合は画面を消す
    if (!fgState.power) {
        display.classList.remove('fg-display-on');
        updateFgToOscilloscope(); // 出力が切れたのでオシロも更新
        return;
    }
    display.classList.add('fg-display-on');

    // 周波数の表示を整形
    let freqText = fgState.freq >= 1000 
        ? (fgState.freq/1000).toFixed(3) + ' kHz' 
        : fgState.freq.toFixed(1) + ' Hz';

    // 画面に現在の数値を反映
    document.getElementById('fg-disp-wave').innerText = `WAVE: ${fgState.waveform}`;
    document.getElementById('fg-disp-freq').innerText = `FREQ: ${freqText}`;
    document.getElementById('fg-disp-amptd').innerText = `AMP: ${fgState.amptd.toFixed(3)} Vpp`;
    document.getElementById('fg-disp-offset').innerText = `OFS: ${fgState.offset.toFixed(2)} V`;
    document.getElementById('fg-disp-out').innerText = fgState.outputOn ? 'OUTPUT: ON ▶' : 'OUTPUT: OFF';
    
    // 入力中の文字があれば表示、なければ空
    if (fgState.inputMode) {
        document.getElementById('fg-disp-input').innerText = `[入力中] ${fgState.inputMode} > ${fgState.inputValue}_`;
    } else {
        document.getElementById('fg-disp-input').innerText = '';
    }

    // オシロスコープへの信号を更新
    updateFgToOscilloscope();
    // FGワイヤー接続があれば、そちらも更新
    if (typeof updateFgWireSignal === 'function') updateFgWireSignal();
}

// =======================================================================
//  発振器 → オシロスコープ 信号連携
// =======================================================================
function updateFgToOscilloscope() {
    // 発振器がONかつ出力ONの場合のみオシロに信号を送る
    if (fgState.power && fgState.outputOn && adDaState.inputSource === 'fg') {
        // 波形タイプをscope形式に変換
        const waveMap = { 'SINE': 'sine', 'SQUARE': 'square', 'RAMP': 'tri' };
        const waveType = waveMap[fgState.waveform] || 'sine';
        const amplitude = fgState.amptd / 2; // Vpp → 振幅(片側)

        // CH2 = 入力原波形として設定
        scopeState.signals['CH2'] = {
            type: waveType,
            amplitude: amplitude,
            frequency: fgState.freq,
            offset: fgState.offset,
            source: 'fg'
        };

        // CH1 = AD/DA変換後の波形として設定
        scopeState.signals['CH1'] = {
            type: waveType,
            amplitude: amplitude,
            frequency: fgState.freq,
            offset: fgState.offset,
            source: 'adda', // AD/DA変換モード
            adda: {
                resolution: adDaState.resolution,
                samplingPeriodUs: adDaState.samplingPeriodUs,
                FSR: adDaState.FSR
            }
        };

        // オシロの入力ソースを 'fg' モードに
        if (scopeState.inputSource !== 'fg') {
            scopeState.inputSource = 'fg';
        }

        // 時間軸を自動調整（波形が見やすくなるように）
        autoAdjustTimeAxis(fgState.freq);

    } else {
        // 出力OFFの場合はフラットライン
        if (scopeState.inputSource === 'fg') {
            scopeState.signals['CH1'] = { type: 'flat', amplitude: 0, frequency: 1, offset: 0, source: 'fg' };
            scopeState.signals['CH2'] = { type: 'flat', amplitude: 0, frequency: 1, offset: 0, source: 'fg' };
        }
    }
}

// 発振器の周波数に合わせて時間軸を自動調整
function autoAdjustTimeAxis(freq) {
    if (!scopeState.isOn) return;
    
    const period = 1.0 / freq; // 1周期の時間 [s]
    // 約2〜3周期が画面に収まるようにする (画面は10div分)
    const targetTimeDiv = (period * 2.5) / 10;
    
    // TIME_STEPSの中で最も近いインデックスを探す
    let bestIndex = 0;
    let bestDiff = Infinity;
    TIME_STEPS.forEach((step, i) => {
        const diff = Math.abs(step - targetTimeDiv);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIndex = i;
        }
    });
    
    scopeState.timeIndex = bestIndex;
}

// =======================================================================
//  AD/DA変換シミュレーション: AD/DA変換後の電圧値を計算
// =======================================================================
function getAdDaVoltage(rawVolt, adda) {
    const { resolution, FSR, samplingPeriodUs } = adda;
    const n = resolution;
    const q = FSR / Math.pow(2, n); // 量子化ステップ

    // バイポーラモード（実験はバイポーラ想定）
    const halfFSR = FSR / 2;

    // クリッピング（入力範囲超えは飽和）
    let clipped = Math.max(-halfFSR, Math.min(halfFSR, rawVolt));

    // 量子化: q単位に丸める
    const quantized = Math.round(clipped / q) * q;

    return quantized;
}

// AD/DA変換後の波形の電圧値を取得（サンプリングも考慮）
function getAdDaSignalVoltage(ch, signalTime, pixelX) {
    const signal = scopeState.signals[ch];
    if (!signal || !signal.adda) return 0;

    const adda = signal.adda;
    const samplingPeriodSec = adda.samplingPeriodUs * 1e-6; // µs → s

    // 現在のピクセルが属するサンプリング区間の先頭時刻を計算
    // これによりサンプル＆ホールド（階段状）波形を再現
    const sampleTime = Math.floor(signalTime / samplingPeriodSec) * samplingPeriodSec;

    // サンプリング時点での原信号の電圧
    const rawVolt = getSignalVoltageRaw(ch, sampleTime);

    // AD/DA変換（量子化）
    return getAdDaVoltage(rawVolt, adda);
}

// 生の信号電圧を取得するヘルパー（AD/DA変換前の原信号）
function getSignalVoltageRaw(ch, t) {
    const signal = scopeState.signals[ch];
    if (!signal) return 0;
    
    const freq = signal.frequency || 1;
    const amp  = signal.amplitude || 0;
    const phase = 2 * Math.PI * freq * t;
    
    let val = 0;
    if (signal.type === 'sine') {
        val = Math.sin(phase);
    } else if (signal.type === 'square') {
        val = Math.sin(phase) >= 0 ? 1 : -1;
    } else if (signal.type === 'tri') {
        val = (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else if (signal.type === 'flat') {
        val = 0;
    }
    
    return val * amp + (signal.offset || 0);
}

// AD/DA変換装置が接続されているかを確認して適切な電圧を返す
function getOscilloscopeVoltage(ch, signalTime, pixelX) {
    const signal = scopeState.signals[ch];
    if (!signal) return 0;

    // AD/DA変換モード（CH1がDA出力, CH2が原波形）
    if (signal.source === 'adda' && signal.adda) {
        // サンプリングと量子化を適用
        return getAdDaSignalVoltage(ch, signalTime, pixelX);
    }
    
    // 原波形モード（CH2 = 発振器直結）またはFGワイヤー接続
    if (signal.source === 'fg' || signal.source === 'fg_wire') {
        return getSignalVoltageRaw(ch, signalTime);
    }

    // 従来の内部テスト信号
    return getSignalVoltage(ch, signalTime);
}

// =======================================================================
//  AD/DA converter photo controls (ITF-203B)
//  The old floating control panel is intentionally replaced by overlays on
//  the real equipment image.
// =======================================================================
function createAdDaPanel() {
    const oldPanel = document.getElementById('adda-panel');
    if (oldPanel) oldPanel.remove();

    const model = document.getElementById('model-adda');
    if (!model || document.getElementById('adda-photo-ui')) {
        updateAdDaPanelDisplay();
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'adda-photo-ui';
    overlay.innerHTML = `
        <div id="adda-sampling-hotspot" class="adda-invisible-hotspot" title="サンプリング周期切換"></div>
    `;

    model.appendChild(overlay);

    const samplingHotspot = document.getElementById('adda-sampling-hotspot');
    if (samplingHotspot) {
        samplingHotspot.addEventListener('click', e => {
            e.stopPropagation();
            cycleAdDaSampling();
        });
        samplingHotspot.addEventListener('wheel', e => {
            e.preventDefault();
            e.stopPropagation();
            cycleAdDaSampling(e.deltaY < 0 ? -1 : 1);
        });
    }

    updateAdDaPanelDisplay();
}

function formatAdDaFs(periodUs) {
    const fsHz = 1000000 / periodUs;
    if (fsHz >= 100000) return (fsHz / 1000).toFixed(0) + ' kHz';
    if (fsHz >= 1000) return (fsHz / 1000).toFixed(fsHz % 1000 === 0 ? 0 : 1) + ' kHz';
    return fsHz.toFixed(0) + ' Hz';
}

function getAdDaInputVoltage() {
    // 実機同様、TB1に何も結線されていなければ入力電圧は無い
    if (!adDaState.tb1Wired) return 0;

    if (adDaState.tb1Wired === 'dc') {
        return (psState.isOn && psState.isOutputOn) ? psState.ch1.voltage : 0;
    }
    if (adDaState.tb1Wired === 'fg') {
        if (fgState.power && fgState.outputOn) {
            const amp = fgState.amptd / 2;
            return fgState.offset + amp;
        }
    }
    return 0;
}

function getAdDaCode(voltage) {
    const levels = Math.pow(2, adDaState.resolution);
    const q = adDaState.FSR / levels;
    let normalized;

    if (adDaState.mode === 'unipolar') {
        normalized = Math.max(0, Math.min(adDaState.FSR - q, voltage));
    } else {
        const half = adDaState.FSR / 2;
        normalized = Math.max(-half, Math.min(half - q, voltage)) + half;
    }

    return Math.max(0, Math.min(levels - 1, Math.floor(normalized / q)));
}

function getAdDaOutputFromCode(code) {
    const q = adDaState.FSR / Math.pow(2, adDaState.resolution);
    const value = code * q;
    return adDaState.mode === 'unipolar' ? value : value - (adDaState.FSR / 2);
}

function updateAdDaPanelDisplay() {
    const fsText = formatAdDaFs(adDaState.samplingPeriodUs);
    const q = adDaState.FSR / Math.pow(2, adDaState.resolution);
    const vin = getAdDaInputVoltage();
    const code = getAdDaCode(vin);
    const vout = getAdDaOutputFromCode(code);
    const codeText = code.toString(2).padStart(adDaState.resolution, '0');

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setText('adda-fs', fsText);
    setText('adda-ts', adDaState.samplingPeriodUs + ' us');
    setText('adda-step', q.toFixed(4) + ' V');
    setText('adda-input-voltage', vin.toFixed(2) + ' V');
    setText('adda-output-voltage', vout.toFixed(2) + ' V');
    setText('adda-code', codeText);

    const sampling = document.getElementById('adda-sampling');
    if (sampling) sampling.value = String(adDaState.samplingPeriodUs);

    const sourceText = !adDaState.tb1Wired ? 'unconnected' : (adDaState.tb1Wired === 'fg' ? 'FG input' : 'DC input');
    const modeText = adDaState.mode === 'unipolar' ? 'unipolar' : 'bipolar';
    setText('adda-switch-readout',
        `SW1 ${sourceText} / SW4 ${adDaState.resolution}bit, ${adDaState.samplingPeriodUs}us / SW5,SW7 ${modeText} / SW6,SW8 OFF`
    );

    document.querySelectorAll('#adda-led-bank span').forEach((led, i) => {
        const firstActive = 8 - adDaState.resolution;
        const bit = i >= firstActive ? codeText[i - firstActive] : '0';
        led.classList.toggle('on', bit === '1');
        led.classList.toggle('disabled', i < firstActive);
        led.title = i < firstActive ? 'unused in 4bit mode' : `D${7 - i}: ${bit}`;
    });

    document.querySelectorAll('[data-adda-source]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.addaSource === adDaState.inputSource);
    });
    document.querySelectorAll('[data-adda-bits]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.addaBits, 10) === adDaState.resolution);
    });
    document.querySelectorAll('[data-adda-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.addaMode === adDaState.mode);
    });

    updateFgToOscilloscope();
    updateOscilloscopeSignal();
}

function onAdDaSamplingChange(val) {
    adDaState.samplingPeriodUs = parseInt(val, 10);
    updateAdDaPanelDisplay();
    showWireStatus(`AD/DA sampling period: ${adDaState.samplingPeriodUs} us`);
}

function onAdDaBitsChange(bits) {
    adDaState.resolution = bits === 4 ? 4 : 8;
    updateAdDaPanelDisplay();
    showWireStatus(`AD resolution: ${adDaState.resolution} bit`);
}

function onAdDaSourceChange(src) {
    adDaState.inputSource = src === 'dc' ? 'dc' : 'fg';
    switchInputSource(adDaState.inputSource === 'dc' ? 'power_supply' : 'fg');
    updateAdDaPanelDisplay();
}

function onAdDaModeChange(mode) {
    adDaState.mode = mode === 'unipolar' ? 'unipolar' : 'bipolar';
    updateAdDaPanelDisplay();
    showWireStatus(`AD/DA mode: ${adDaState.mode}`);
}

function cycleAdDaSampling(direction = 1) {
    const options = adDaState.samplingOptions || [5, 10, 50, 100, 200, 500];
    const current = options.indexOf(adDaState.samplingPeriodUs);
    const next = (current + direction + options.length) % options.length;
    adDaState.samplingPeriodUs = options[next];
    updateAdDaPanelDisplay();
    showWireStatus(`Ts = ${adDaState.samplingPeriodUs} us`);
}

function handleAddaSwitch(swId) {
    if (swId === 'SW1') {
        if (adDaState.tb1Wired) {
            const deviceName = adDaState.tb1Wired === 'dc' ? '直流電源' : '発振器';
            showWireStatus(`SW1: TB1には${deviceName}が結線されています。切り替えるには先に結線を外してください。`);
            return;
        }
        onAdDaSourceChange(adDaState.inputSource === 'fg' ? 'dc' : 'fg');
    } else if (swId === 'SW4') {
        onAdDaBitsChange(adDaState.resolution === 8 ? 4 : 8);
    } else if (swId === 'SW5' || swId === 'SW7') {
        onAdDaModeChange(adDaState.mode === 'bipolar' ? 'unipolar' : 'bipolar');
    } else if (swId === 'SW6' || swId === 'SW8') {
        showWireStatus(`${swId}: OFF (filter bypass for this experiment)`);
    }
}

function getAdDaVoltage(rawVolt, adda) {
    const resolution = adda.resolution || adDaState.resolution;
    const FSR = adda.FSR || adDaState.FSR;
    const mode = adda.mode || adDaState.mode;
    const q = FSR / Math.pow(2, resolution);

    if (mode === 'unipolar') {
        const clipped = Math.max(0, Math.min(FSR - q, rawVolt));
        return Math.round(clipped / q) * q;
    }

    const halfFSR = FSR / 2;
    const clipped = Math.max(-halfFSR, Math.min(halfFSR - q, rawVolt));
    return Math.round(clipped / q) * q;
}

const originalUpdateFgDisplayForAdDa = updateFgDisplay;
updateFgDisplay = function() {
    originalUpdateFgDisplayForAdDa();
    if (document.getElementById('adda-photo-ui')) updateAdDaPanelDisplay();
};

const originalUpdatePSDisplayForAdDa = updatePSDisplay;
updatePSDisplay = function() {
    originalUpdatePSDisplayForAdDa();
    if (document.getElementById('adda-photo-ui')) updateAdDaPanelDisplay();
};

const ADDA_TERMINALS = ['TB1','TB2','TB3','TB4','TB5','TB6','TP1','TP2','TP3','TP5','TP6','TP7','TP8','TP9','TP10','TP11','TP12'];
Object.assign(TERMINAL_COLORS, {
    TB1: '#27ae60', // 緑（AD/DA信号入力 +）
    TB2: '#7f8c8d', // グレー（AD/DA信号入力 −/GND）
    TB5: '#e74c3c',
    TB6: '#222222',
    TP1: '#3498db',
    TP2: '#222222',
    TP3: '#f1c40f',
    TP5: '#9b59b6',
    TP8: '#1abc9c'
});

const originalGetTerminalSideForAdDa = getTerminalSide;
getTerminalSide = function(name) {
    if (ADDA_TERMINALS.includes(name)) return 'adda';
    return originalGetTerminalSideForAdDa(name);
};

const originalHandleTerminalClickForAdDa = handleTerminalClick;
handleTerminalClick = function(terminalName, hotspotEl) {
    const side = getTerminalSide(terminalName);
    const pending = wiringState.pendingTerminal;
    const usesAdDa = side === 'adda' || (pending && pending.side === 'adda');
    if (!usesAdDa) return originalHandleTerminalClickForAdDa(terminalName, hotspotEl);
    if (!side) return false;

    const color = TERMINAL_COLORS[terminalName] || '#ffffff';
    if (!pending) {
        wiringState.pendingTerminal = { terminalName, side, color, el: hotspotEl };
        hotspotEl.classList.add('wire-selected');
        showWireStatus(`端子「${terminalName}」を選択。接続先をクリックしてください。`, 5000);
        redrawWires();
        return true;
    }

    if (pending.terminalName === terminalName) {
        pending.el.classList.remove('wire-selected');
        wiringState.pendingTerminal = null;
        showWireStatus('選択を解除しました。');
        redrawWires();
        return true;
    }

    if (pending.side === side) {
        showWireStatus('同じ機器側の端子同士は接続できません。');
        return true;
    }

    if ((pending.side === 'adda' && side === 'osc') || (pending.side === 'osc' && side === 'adda')) {
        const oscTerm = side === 'osc' ? terminalName : pending.terminalName;
        const addaTerm = side === 'adda' ? terminalName : pending.terminalName;
        wiringState.connections = wiringState.connections.filter(c => c.oscTerminal !== oscTerm);
        wiringState.connections.push({
            psTerminal: addaTerm,
            addaTerminal: addaTerm,
            oscTerminal: oscTerm,
            color: TERMINAL_COLORS[addaTerm] || color,
            type: 'adda'
        });

        pending.el.classList.remove('wire-selected');
        pending.el.classList.add('wire-connected');
        hotspotEl.classList.add('wire-connected');
        wiringState.pendingTerminal = null;

        scopeState.inputSource = 'fg';
        updateAdDaTerminalSignals();
        showWireStatus(`AD/DA(${addaTerm}) -> オシロ(${oscTerm}) を接続しました。`);
        redrawWires();
        return true;
    }

    // 直流電源 ↔ AD/DA（TB1/TB2への入力結線。図A: AD変換器の変換過程の観察 用）
    if ((pending.side === 'ps' && side === 'adda') || (pending.side === 'adda' && side === 'ps')) {
        const addaTerm = side === 'adda' ? terminalName : pending.terminalName;
        const psTerm   = side === 'ps'   ? terminalName : pending.terminalName;

        if (addaTerm !== 'TB1' && addaTerm !== 'TB2') {
            showWireStatus('⚠️ 直流電源はAD/DA変換機のTB1(+)/TB2(-)端子に接続してください。');
            return true;
        }

        // 同じAD/DA端子に既に結線があれば解除してから繋ぎ直す
        wiringState.connections = wiringState.connections.filter(c => c.addaTerminal !== addaTerm);
        wiringState.connections.push({
            psTerminal: psTerm,
            addaTerminal: addaTerm,
            color: TERMINAL_COLORS[psTerm] || color,
            type: 'ps-adda'
        });

        pending.el.classList.remove('wire-selected');
        pending.el.classList.add('wire-connected');
        hotspotEl.classList.add('wire-connected');
        wiringState.pendingTerminal = null;

        if (addaTerm === 'TB1') {
            adDaState.tb1Wired = 'dc';
            adDaState.inputSource = 'dc';
        }

        updateAdDaPanelDisplay();
        updateAdDaTerminalSignals();
        showWireStatus(`✅ 直流電源(${psTerm}) → AD/DA(${addaTerm}) を接続しました。右クリックで切断できます。`);
        redrawWires();
        return true;
    }

    // 発振器 ↔ AD/DA（TB1/TB2への入力結線。図B: AD/DA変換後の波形の観察 用）
    if ((pending.side === 'fg' && side === 'adda') || (pending.side === 'adda' && side === 'fg')) {
        const addaTerm = side === 'adda' ? terminalName : pending.terminalName;
        const fgTerm   = side === 'fg'   ? terminalName : pending.terminalName;

        if (addaTerm !== 'TB1' && addaTerm !== 'TB2') {
            showWireStatus('⚠️ 発振器はAD/DA変換機のTB1(+)/TB2(-)端子に接続してください。');
            return true;
        }

        wiringState.connections = wiringState.connections.filter(c => c.addaTerminal !== addaTerm);
        wiringState.connections.push({
            fgTerminal: fgTerm,
            addaTerminal: addaTerm,
            color: TERMINAL_COLORS[fgTerm] || color,
            type: 'fg-adda'
        });

        pending.el.classList.remove('wire-selected');
        pending.el.classList.add('wire-connected');
        hotspotEl.classList.add('wire-connected');
        wiringState.pendingTerminal = null;

        if (addaTerm === 'TB1') {
            adDaState.tb1Wired = 'fg';
            adDaState.inputSource = 'fg';
        }

        updateAdDaPanelDisplay();
        updateAdDaTerminalSignals();
        showWireStatus(`✅ 発振器(${fgTerm}) → AD/DA(${addaTerm}) を接続しました。右クリックで切断できます。`);
        redrawWires();
        return true;
    }

    showWireStatus('このAD/DA端子の組み合わせは未対応です。');
    return true;
};

function makeAdDaInputSignal() {
    if (!adDaState.tb1Wired) {
        // TB1未結線: 実機同様、入力信号なし
        return { type: 'flat', amplitude: 0, frequency: 1, offset: 0, source: 'fg' };
    }
    if (adDaState.tb1Wired === 'dc') {
        return { type: 'flat', amplitude: 0, frequency: 1, offset: getAdDaInputVoltage(), source: 'fg' };
    }
    const waveMap = { SINE: 'sine', SQUARE: 'square', RAMP: 'tri' };
    return {
        type: waveMap[fgState.waveform] || 'sine',
        amplitude: fgState.outputOn ? fgState.amptd / 2 : 0,
        frequency: fgState.freq,
        offset: fgState.outputOn ? fgState.offset : 0,
        source: 'fg'
    };
}

function makeAdDaTerminalSignal(terminalName) {
    const input = makeAdDaInputSignal();
    const fsHz = 1000000 / adDaState.samplingPeriodUs;

    if (terminalName === 'TB5') {
        if (!adDaState.tb1Wired) {
            return { type: 'flat', amplitude: 0, frequency: 1, offset: 0, source: 'fg' };
        }
        if (adDaState.tb1Wired === 'dc') {
            return { type: 'flat', amplitude: 0, frequency: 1, offset: getAdDaOutputFromCode(getAdDaCode(getAdDaInputVoltage())), source: 'fg' };
        }
        return {
            ...input,
            source: 'adda',
            adda: {
                resolution: adDaState.resolution,
                samplingPeriodUs: adDaState.samplingPeriodUs,
                FSR: adDaState.FSR,
                mode: adDaState.mode
            }
        };
    }

    if (terminalName === 'TP1') return input;
    if (terminalName === 'TP3') return { type: 'square', amplitude: 2.5, frequency: fsHz, offset: 2.5, source: 'fg' };
    if (terminalName === 'TP5' || terminalName === 'TP8') {
        return { type: 'square', amplitude: 2.5, frequency: Math.max(1, fsHz / Math.max(1, adDaState.resolution)), offset: 2.5, source: 'fg' };
    }
    return { type: 'flat', amplitude: 0, frequency: 1, offset: 0, source: 'fg' };
}

// AD/DA端子ごとの「実際に表示すべき周波数」を返す（時間軸の自動調整に使用）
// null を返す場合はその端子の表示周波数からは自動調整しない（DC等）
function getAdDaTerminalDisplayFrequency(terminalName) {
    const fsHz = 1000000 / adDaState.samplingPeriodUs;

    if (terminalName === 'TP3') return fsHz;
    if (terminalName === 'TP5' || terminalName === 'TP8') {
        return Math.max(1, fsHz / Math.max(1, adDaState.resolution));
    }
    if (terminalName === 'TB5' || terminalName === 'TP1') {
        // 発振器が結線されていて出力ONの時だけ、その周波数に合わせる
        if (adDaState.tb1Wired === 'fg' && fgState.power && fgState.outputOn && fgState.freq) {
            return fgState.freq;
        }
        return null; // DC入力時や未結線時は自動調整しない
    }
    return null;
}

function updateAdDaTerminalSignals() {
    let maxDisplayFreq = 0;

    wiringState.connections
        .filter(c => c.type === 'adda')
        .forEach(conn => {
            const channel = conn.oscTerminal === 'Ch1' ? 'CH1' : 'CH2';
            const termName = conn.addaTerminal || conn.psTerminal;
            scopeState.signals[channel] = makeAdDaTerminalSignal(termName);

            const freq = getAdDaTerminalDisplayFrequency(termName);
            if (freq && freq > maxDisplayFreq) maxDisplayFreq = freq;
        });

    // 接続されているAD/DA端子の中で最も速い信号に合わせて時間軸を自動調整
    // （TP3/TP5/TP8などはkHzオーダーのため、手動のTime/Divでは追いつかないことがある）
    if (maxDisplayFreq > 0) {
        autoAdjustTimeAxis(maxDisplayFreq);
    }

    if (scopeState.isOn) drawWaveform();
}

const originalUpdateOscilloscopeSignalForAdDa = updateOscilloscopeSignal;
updateOscilloscopeSignal = function() {
    originalUpdateOscilloscopeSignalForAdDa();
    updateAdDaTerminalSignals();
};

document.addEventListener('contextmenu', function(e) {
    const el = e.target.closest('.hotspot');
    if (!el || !ADDA_TERMINALS.includes(el.title)) return;
    e.preventDefault();
    wiringState.connections = wiringState.connections.filter(c =>
        c.addaTerminal !== el.title && c.psTerminal !== el.title && c.fgTerminal !== el.title
    );
    el.classList.remove('wire-connected', 'wire-selected');
    wiringState.pendingTerminal = null;

    if (el.title === 'TB1') {
        adDaState.tb1Wired = null;
    }

    updateAdDaPanelDisplay();
    updateAdDaTerminalSignals();
    redrawWires();
}, true);