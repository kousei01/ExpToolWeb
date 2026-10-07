// =======================================================================
//  実験器具シミュレータ  script.js
//
//  オシロスコープ・直流電源・発振器・AD/DA変換機(ITF-203B) を画面上で操作し、
//  端子同士を結線して波形を観察する学習用シミュレータ。
//
//  【目次】
//     1. 定数
//     2. 状態（各機器の現在の設定値）
//     3. 表示用データ（メニュー・ツールチップ・実験手順の文言）
//     4. 画面レイアウト（機種切替・説明書・ズーム・サイズ調整・ドラッグ・サイドバー）
//     5. 信号の計算（ある時刻の電圧を求める）
//     6. オシロスコープの描画
//     7. 直流電源
//     8. 発振器
//     9. AD/DA変換機
//    10. 結線（ワイヤー）
//    11. 結線 → オシロに映す信号への反映
//    12. ホットスポット（機器画像の上のボタン）
//    13. 実技テストモード
//    14. 起動処理
//
//  【処理の流れ】
//    機器を操作する / 結線を変える
//      → 11章の関数が scopeState.signals[CH] を作り直す
//      → 6章の drawWaveform() が毎フレーム signals を読んで波形を描く
// =======================================================================


// =======================================================================
//  1. 定数
// =======================================================================

// --- オシロスコープ ---

// 機種ごとに表示できるチャンネル（Hantekは2ch機、AgilentはCh3端子まで対応）
const MODEL_CHANNELS = {
    hantek:  ['CH1', 'CH2'],
    agilent: ['CH1', 'CH2', 'CH3'],
};
const ALL_CHANNELS = ['CH1', 'CH2', 'CH3'];

// チャンネルごとの波形の色と入力カップリング
const CHANNEL_COLORS   = { CH1: 'yellow', CH2: 'cyan', CH3: '#ff66ff' };
const CHANNEL_COUPLING = { CH1: 'DC',     CH2: 'AC',   CH3: 'DC' };

// ツマミで切り替わるレンジ（1-2-5 ステップ）
const VOLT_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];   // [V/div]
const TIME_STEPS = [                                                         // [s/div]
    0.000001, 0.000002, 0.000005,   // 1us, 2us, 5us（AD/DA内部クロックなど高速信号用）
    0.00001,  0.00002,  0.00005,    // 10us, 20us, 50us
    0.0001,   0.0002,   0.0005,     // 100us, 200us, 500us
    0.001,    0.002,    0.005,      // 1ms, 2ms, 5ms
    0.01,     0.02,     0.05,
    0.1,      0.2,      0.5,
    1.0,
];

// 画面の1目盛り(1div)のピクセル数
const PIXELS_PER_DIV = 50;

// 「内部テスト信号」モードで各チャンネルに表示する信号
const INTERNAL_TEST_SIGNALS = {
    CH1: { type: 'sine', amplitude: 2.0, frequency: 50 },
    CH2: { type: 'sine', amplitude: 2.0, frequency: 50 },
    CH3: { type: 'flat', amplitude: 0, frequency: 1, offset: 0 },
};

// --- 結線 ---

// 機器（側）ごとの端子名。端子名は index.html の <area> の title / alt と対応する
const TERMINALS = {
    ps:   ['ch1pura', 'ch1mai', 'ch2pura', 'ch2mai', 'grd'],
    osc:  ['Ch1', 'Ch2', 'Ch3'],
    fg:   ['fctnout', 'subout'],
    adda: ['TB1', 'TB2', 'TB3', 'TB4', 'TB5', 'TB6',
           'TP1', 'TP2', 'TP3', 'TP5', 'TP6', 'TP7', 'TP8', 'TP9', 'TP10', 'TP11', 'TP12'],
};

// メッセージに使う機器名
const SIDE_NAMES = { ps: '直流電源', osc: 'オシロスコープ', fg: '発振器', adda: 'AD/DA変換機' };

// 端子ごとのワイヤーの色
const TERMINAL_COLORS = {
    // 直流電源
    ch1pura: '#ff4444',   // 赤（+）
    ch2pura: '#ff8800',   // オレンジ（+）
    ch1mai:  '#222222',   // 黒（−）
    ch2mai:  '#222222',   // 黒（−）
    grd:     '#007700',   // 緑（GND）
    // オシロスコープ
    Ch1:     '#ffff00',   // 黄
    Ch2:     '#00ffff',   // 水色
    Ch3:     '#ff66ff',   // マゼンタ
    // 発振器
    fctnout: '#ff6600',   // オレンジ（メイン出力）
    subout:  '#cc44ff',   // 紫（サブ出力）
    // AD/DA変換機
    TB1:     '#27ae60',   // 緑（信号入力 +）
    TB2:     '#7f8c8d',   // グレー（信号入力 −/GND）
    TB5:     '#e74c3c',
    TB6:     '#222222',
    TP1:     '#3498db',
    TP2:     '#222222',
    TP3:     '#f1c40f',
    TP5:     '#9b59b6',
    TP8:     '#1abc9c',
};

// --- ホットスポット ---

// 機能を実装済みのボタン（青で表示。ここに無いものは未実装として赤で表示する）
// ※ AD/DA変換機の端子・スイッチと、メニューを持つボタンは自動的に実装済み扱いになる
const IMPLEMENTED_BUTTONS = new Set([
    // オシロスコープ
    '電源ボタン', 'RunStop', 'AutoSet', 'Meas', 'Cursr', 'Cursrツマミ',
    'CH1_MENU', 'CH2_MENU', 'CH3_MENU', 'Ch1', 'Ch2', 'Ch3', 'Ch4',
    'KNOB_TIME', 'KNOB_VOLT', 'Volt1', 'Volt2', 'Volt3', 'Volt4',
    'Pos1', 'Pos2', 'Level',
    // 直流電源
    'ps_power', 'ch1btn', 'ch2btn', 'volt', 'curr', 'output',
    'ch1pura', 'ch1mai', 'ch2pura', 'ch2mai', 'grd',
    // 発振器
    'latorpowar', 'fctn', 'freq', 'amptd', 'offset',
    'seven', 'eight', 'nine', 'fore', 'five', 'six',
    'one', 'two', 'three', 'zero', 'dot', 'puramai',
    'enter', 'cansel', 'undo', 'out', 'fctnout', 'subout',
]);

// <map name="..."> と、ホットスポットを置く機器コンテナ(id)の対応
const MAP_TO_CONTAINER = {
    'map-hantek':  'model-hantek',
    'map-agilent': 'model-agilent',
    'map-ps':      'model-ps',
    'fg-map':      'model-fg',
    'adda-map':    'model-adda',
};


// =======================================================================
//  2. 状態（各機器の現在の設定値）
// =======================================================================

// --- オシロスコープ ---
const scopeState = {
    isOn: false,              // 電源
    isRunning: true,          // RUN / STOP
    activeChannel: 'CH1',     // 操作対象のチャンネル

    // 入力の種類
    //   'internal'     : 内部テスト信号（結線なしでテスト波形を表示）
    //   'power_supply' : 直流電源を直結
    //   'fg'           : 発振器 または AD/DA変換機を結線
    inputSource: 'internal',

    voltIndexCH1: 6,          // VOLT_STEPS の添字（初期値 1V/div）
    voltIndexCH2: 6,
    voltIndexCH3: 6,
    timeIndex: 15,            // TIME_STEPS の添字（初期値 0.1s/div）
    timeOffset: 0,            // 波形を流すための時刻（RUN中は毎フレーム進む）

    positionCH1: 0,           // 波形の上下位置 [px]
    positionCH2: 0,
    positionCH3: 0,

    currentMenu: null,        // 表示中のメニュー（MENU_DATA のキー）
    showMeasure: false,       // 自動計測（Vp-p・周波数）の表示

    cursor: {
        show: false,
        posA: 150,            // 時間カーソルAのX座標 [px]
        posB: 350,            // 時間カーソルBのX座標 [px]
        offsetY1: 100,        // 電圧カーソルY1の位置 [px]（画面中央から上向きを正）
        offsetY2: -100,       // 電圧カーソルY2の位置 [px]
        target: 'A',          // ツマミ・画面クリックで動かす対象 ('A' | 'B' | 'Y1' | 'Y2')
    },

    trigger: {
        level: 4.0,           // トリガレベル [V]
        slope: 'rising',      // 立ち上がりエッジ
        source: 'CH1',        // トリガソース
        isTriggered: false,   // トリガがかかっているか（描画のたびに更新）
    },

    // 各チャンネルに入力されている信号
    //   type      : 'sine' | 'square' | 'tri' | 'flat'
    //               'sequence' … AD変換の過程で出る、一定周期で繰り返す階段状の信号（ビット列など）。
    //                            levels に1周期分の電圧の並び、tsSec に周期 [s] を持つ
    //   amplitude : 振幅 [V]（片側）   frequency : 周波数 [Hz]   offset : オフセット [V]
    //   source    : 信号の出どころ
    //                 なし      … 内部テスト信号
    //                 'fg_wire' … 発振器を直結
    //                 'fg'      … AD/DA変換機の端子（アナログ波形・ビット列）
    //                 'adda'    … AD/DA変換機のDA出力（標本化＋量子化して描く。adda に変換条件を持つ）
    //                 'none'    … 結線なし（0V）
    signals: {
        CH1: { ...INTERNAL_TEST_SIGNALS.CH1 },
        CH2: { ...INTERNAL_TEST_SIGNALS.CH2 },
        CH3: { ...INTERNAL_TEST_SIGNALS.CH3 },
    },
};

// --- 直流電源 (GPD-4303S) ---
const psState = {
    isOn: false,              // 電源
    isOutputOn: false,        // OUTPUT ボタン
    activeChannel: 'CH1',     // ツマミの操作対象 ('CH1' | 'CH2')
    fineMode: false,          // 電圧ツマミの微調整（FINE）モード。ツマミをクリックで切替
    ch1: { voltage: 0.0, current: 0.00 },
    ch2: { voltage: 0.0, current: 0.00 },
};

// --- 発振器（ファンクションジェネレータ） ---
const fgState = {
    power: false,
    waveform: 'SINE',         // 'SINE'(正弦波) | 'SQUARE'(方形波) | 'RAMP'(三角波)
    freq: 1000,               // 周波数 [Hz]
    amptd: 1.0,               // 振幅 [Vpp]
    offset: 0.0,              // オフセット [V]
    outputOn: false,          // OUTPUT ボタン
    inputMode: '',            // テンキーで入力中の項目 ('FREQ' | 'AMPTD' | 'OFFSET' | '')
    inputValue: '',           // テンキーで入力中の文字列
};

// --- AD/DA変換機 (ITF-203B) ---
const adDaState = {
    inputSource: 'fg',        // SW1（入力切換）の位置: 'fg' | 'dc'
    resolution: 8,            // 量子化ビット数 (4 | 8)
    samplingPeriodUs: 5,      // サンプリング周期 [µs]
    samplingOptions: [5, 10, 50, 100, 200, 500],   // 切り替えられるサンプリング周期 [µs]
    FSR: 10.24,               // フルスケールレンジ [V]
    mode: 'bipolar',          // 'bipolar' | 'unipolar'
};

// --- 結線 ---
const wiringState = {
    // 確定済みの接続。1本につき1要素で、両端の端子名を「側 + Terminal」のキーで持つ
    //   type: 'ps'      … 直流電源 → オシロ   { psTerminal,   oscTerminal }
    //         'fg'      … 発振器   → オシロ   { fgTerminal,   oscTerminal }
    //         'adda'    … AD/DA    → オシロ   { addaTerminal, oscTerminal }
    //         'ps-adda' … 直流電源 → AD/DA    { psTerminal,   addaTerminal }
    //         'fg-adda' … 発振器   → AD/DA    { fgTerminal,   addaTerminal }
    //   color: ワイヤーの色
    connections: [],

    // 1本目としてクリックされ、接続先を待っている端子 { terminalName, side, color, el }
    pendingTerminal: null,
};

// --- 画面表示 ---
let currentModelId = 'agilent';                          // 表示中のオシロの機種
let canvas = document.getElementById('canvas-agilent');  // 表示中のオシロの画面
let ctx = canvas.getContext('2d');
let currentZoom = 100;                                   // 全体の表示倍率 [%]
const tooltip = document.getElementById('tooltip');

// SIZE ADJUST で設定した機器ごとの倍率
const instrumentScales = {
    'model-agilent': 1.0,
    'model-hantek': 1.0,
    'model-adda': 1.0,
    'model-fg': 1.0,
    'model-ps': 1.0,
};

// ドラッグ中の機器（.draggable-equipment）と、ドラッグ開始時の位置
let dragTarget = null;
let dragStart = { mouseX: 0, mouseY: 0, left: 0, top: 0 };


// =======================================================================
//  3. 表示用データ（メニュー・ツールチップ・実験手順の文言）
// =======================================================================

// オシロスコープのメニュー項目（Hantek: DSO5000/2000系を想定）
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

// オシロスコープのメニュー項目（Agilent / Keysight: InfiniiVision系を想定）
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
    "CH3_MENU": {
        title: "Vertical (CH3)",
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

const MENU_DATA = { hantek: menuDataHantek, agilent: menuDataAgilent };

// ホットスポットにマウスを乗せたときに出す説明文（キーはホットスポットの title）
const descriptions = {
    // ---------- オシロスコープ ----------
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
    "Cursor": "手動計測を行います。",
    "CH1_MENU": "CH1の詳細設定を行います。",
    "CH2_MENU": "CH2の詳細設定を行います。",
    "CH3_MENU": "CH3の詳細設定を行います。",
    "CH4_MENU": "CH4の詳細設定を行います。",
    "Ch1": "CH1入力端子。\n🔌 直流電源と結線するには：PS端子をクリックしてから、この端子をクリック\n（または Shift+クリックで選択開始）\n右クリックで切断",
    "Ch2": "CH2入力端子。\n🔌 直流電源と結線するには：PS端子をクリックしてから、この端子をクリック\n（または Shift+クリックで選択開始）\n右クリックで切断",
    "Ch3": "CH3入力端子。\n🔌 AD/DA変換機のTP5(逐次比較のDA出力)などと結線するには：AD/DA側の端子をクリックしてから、この端子をクリック\n右クリックで切断\n※「AD変換器の変換過程の観察」実験では、CH1=TP3(S/H信号)、CH2=TP8(比較器出力)、CH3=TP5(逐次比較のDA出力)を接続します。",
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
    "Cursr": "カーソル測定。\n画面に点線（カーソル）を表示し、手動で時間や電圧を測ります。\n押すたびに操作するカーソルが A → B（時間）→ Y1 → Y2（電圧）→ 非表示 と切り替わります。\n電圧は選択中のチャンネルの目盛りで読みます。",
    "Cursrツマミ": "汎用ツマミ。\nホイールで操作中のカーソルを動かします。\n画面を直接クリックして、その位置へ移動させることもできます。",
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

    // ---------- 発振器 ----------
    "fctnout": "【発振器 MAIN OUT 端子】\nメイン出力端子（BNC）。設定した波形を出力します。\n🔌 クリックして選択し、オシロスコープの端子と接続できます\n右クリックで切断",
    "subout":  "【発振器 SUB OUT 端子】\nサブ出力端子。\n🔌 クリックして選択し、オシロスコープの端子と接続できます\n右クリックで切断",

    // ---------- 直流電源 ----------
    "ps_power": "【直流電源 電源】\n直流電源の電源をオン・オフします。",
    "ch1btn": "【CH1選択】\n電圧・電流ツマミの操作対象をCH1に切り替えます。",
    "ch2btn": "【CH2選択】\n電圧・電流ツマミの操作対象をCH2に切り替えます。",
    "volt": "【電圧(V)ツマミ】\nホイール操作で選択中のチャンネルの電圧を変更します。\nクリック（ツマミを押す）で 粗調整(0.1V刻み) ⇔ FINE(0.01V刻み) を切り替えます。",
    "curr": "【電流(A)ツマミ】\nホイール操作で選択中のチャンネルの電流上限を変更します。",
    "output": "【出力(Output)】\n設定した電圧・電流の出力をオン・オフします。",
    "ch1pura": "CH1 プラス端子（赤）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
    "ch1mai":  "CH1 マイナス端子（黒）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
    "ch2pura": "CH2 プラス端子（赤）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
    "ch2mai":  "CH2 マイナス端子（黒）\n🔌 クリックして選択し、オシロの端子と接続できます\n右クリックで切断",
};

// 実験手順（左サイドバーの項目をクリックしたときにモーダルに表示する内容。body はHTML）
const EXPERIMENT_DATA = {
    exp1: {
        title: '手順1：AD変換器の変換過程の観察',
        body: `
            <h4 style="margin:0 0 12px;color:#2c3e50;">【配線】</h4>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
                <tr style="background:#f0f4f8;"><th style="padding:6px 10px;text-align:left;border:1px solid #ddd;">接続元</th><th style="padding:6px 10px;text-align:left;border:1px solid #ddd;">接続先</th><th style="padding:6px 10px;text-align:left;border:1px solid #ddd;">端子</th></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">直流電源 CH1(+)</td><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">TB1</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">直流電源 CH1(−)</td><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">TB2</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機 TP3</td><td style="padding:6px 10px;border:1px solid #ddd;">オシロスコープ</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Ch1（S/H制御信号）</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機 TP8</td><td style="padding:6px 10px;border:1px solid #ddd;">オシロスコープ</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Ch2（比較器出力）</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機 TP5</td><td style="padding:6px 10px;border:1px solid #ddd;">オシロスコープ</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Ch3（逐次比較のDA出力）</td></tr>
            </table>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【スイッチ設定】</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>SW1：A-D入力（TB1結線で自動切替）</li>
                <li>SW4：<strong>8ビット</strong></li>
                <li>SW5：<strong>ユニポーラ</strong></li>
                <li>SW6：OFF　SW7：ユニポーラ　SW8：OFF</li>
                <li>サンプリング周期：<strong>5µs</strong></li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【直流電源の設定】</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>CH1を使用し、出力電圧を <strong>5V</strong> にセット → OUTPUT ON</li>
                <li>その後、電圧を数種類変えて繰り返す</li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【測定】</h4>
            <ul style="margin:0 0 16px;padding-left:18px;">
                <li>AD/DA変換機の下の <strong>LED</strong> でデジタルコードを読み取って記録</li>
                <li>オシロの <strong>Cursr</strong> を押して Y1 を選び、Ch3 を選択した状態で、TP5 の各段の電圧を読み取る</li>
            </ul>
            <div style="background:#fff3cd;padding:10px 14px;border-radius:4px;font-size:13px;">
                💡 TP3（S/H制御信号）は一定周期のパルス波形、TP8（比較器出力）は変換結果のビット列、TP5（逐次比較のDA出力）は入力電圧と比べる電圧が1ビットごとに階段状に変わる波形が観測されます。
            </div>
        `
    },
    exp2: {
        title: '手順2：AD変換における入出力電圧特性の測定',
        body: `
            <h4 style="margin:0 0 12px;color:#2c3e50;">【配線】手順1と同じ（TP3/TP8/TP5はオシロ接続不要）</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>直流電源 CH1(+) → AD/DA変換機 <strong>TB1</strong></li>
                <li>直流電源 CH1(−) → AD/DA変換機 <strong>TB2</strong></li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【測定①】量子化ビット数 = 4bit</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>SW4を <strong>4ビット</strong> に設定</li>
                <li>直流電源の出力電圧を <strong>0V〜10.20V</strong> まで段階的に変化</li>
                <li>各電圧でのデジタルコード（2進数）を、AD/DA変換機の下の <strong>LED</strong> から読み取って記録</li>
                <li>グラフ：横軸＝入力電圧、縦軸＝デジタルコード（階段状になるはず）</li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【測定②】量子化ビット数 = 8bit</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>SW4を <strong>8ビット</strong> に設定</li>
                <li>直流電源の出力電圧を <strong>5.12V ± 5%</strong> 程度（約 4.86V〜5.38V）の範囲で変化</li>
                <li>電圧ツマミをクリックして <strong>FINE（0.01V刻み）</strong> に切り替えると、コードが変わる境目を細かく追える</li>
                <li>各電圧でのデジタルコードを記録し同様のグラフを作成</li>
            </ul>
            <div style="background:#fff3cd;padding:10px 14px;border-radius:4px;font-size:13px;">
                💡 FSR = 10.24V、量子化ステップ q = FSR/2ⁿ です。4bit では q=0.64V、8bit では q=0.04V となり、8bitの方が細かく変化します。
            </div>
        `
    },
    exp3: {
        title: '手順3：AD/DA変換後の波形の観察',
        body: `
            <h4 style="margin:0 0 12px;color:#2c3e50;">【配線】</h4>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
                <tr style="background:#f0f4f8;"><th style="padding:6px 10px;text-align:left;border:1px solid #ddd;">接続元</th><th style="padding:6px 10px;text-align:left;border:1px solid #ddd;">接続先</th><th style="padding:6px 10px;text-align:left;border:1px solid #ddd;">端子</th></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">発振器 OUTPUT</td><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">TB1</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機 TB5</td><td style="padding:6px 10px;border:1px solid #ddd;">オシロスコープ</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Ch1（DA出力）</td></tr>
                <tr><td style="padding:6px 10px;border:1px solid #ddd;">AD/DA変換機 TP1</td><td style="padding:6px 10px;border:1px solid #ddd;">オシロスコープ</td><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">Ch2（原波形）</td></tr>
            </table>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【スイッチ設定】</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>SW1：A-D入力　SW5・SW7：<strong>バイポーラ</strong>　SW6・SW8：OFF</li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【発振器の設定】</h4>
            <ul style="margin:0 0 4px;padding-left:18px;">
                <li>波形：正弦波（SINE）、振幅：<strong>3V</strong>、周波数：<strong>1000Hz</strong></li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;margin-top:10px;">【観察パターン】</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>基本条件：サンプリング周期 <strong>5µs</strong>、量子化ビット数 <strong>8bit</strong> → 両波形がほぼ重なる</li>
                <li>サンプリング周期を 10µs → 50µs → 100µs → 200µs → <strong>500µs</strong> に変更して観察</li>
                <li>量子化ビット数を <strong>4bit</strong> に変更して観察（波形が粗くなる）</li>
                <li>発振器の周波数を <strong>4000Hz</strong> に変更し、同様に繰り返す</li>
            </ul>
            <div style="background:#fff3cd;padding:10px 14px;border-radius:4px;font-size:13px;">
                💡 サンプリング周期を長くすると階段が粗くなります。fs/2（ナイキスト周波数）を下回る前にエイリアスが発生します。
            </div>
        `
    },
    exp4: {
        title: '手順4：AD/DA変換時の入出力周波数特性の測定',
        body: `
            <h4 style="margin:0 0 12px;color:#2c3e50;">【配線】手順3と同じ</h4>
            <ul style="margin:0 0 12px;padding-left:18px;">
                <li>発振器 OUTPUT → AD/DA <strong>TB1</strong></li>
                <li>AD/DA <strong>TB5</strong>（DA出力）→ オシロ Ch1</li>
                <li>AD/DA <strong>TP1</strong>（原波形）→ オシロ Ch2</li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【発振器の設定】</h4>
            <ul style="margin:0 0 4px;padding-left:18px;">
                <li>波形：正弦波（SINE）、振幅：<strong>3V</strong></li>
            </ul>
            <h4 style="margin:0 0 8px;color:#2c3e50;margin-top:10px;">【測定①】サンプリング周期 = 5µs（fs = 200kHz）</h4>
            <p style="margin:4px 0 8px;font-size:13px;">以下の周波数で順に観察・記録：</p>
            <p style="margin:0 0 12px;font-weight:bold;letter-spacing:1px;font-size:13px;">
                1kHz → 2.5kHz → 5kHz → 10kHz → 100kHz → 150kHz → 200kHz
            </p>
            <h4 style="margin:0 0 8px;color:#2c3e50;">【測定②】サンプリング周期 = 200µs（fs = 5kHz）</h4>
            <p style="margin:4px 0 8px;font-size:13px;">同じ周波数で繰り返す。fs/2 = 2.5kHz を超えるとエイリアスが発生します。</p>
            <div style="background:#fff3cd;padding:10px 14px;border-radius:4px;font-size:13px;">
                💡 エイリアス周波数： f_out = |f_in − n × fs|（nは整数）で計算できます。<br>
                例：fs=5kHz、f_in=4kHz → f_out = |4000 − 5000| = <strong>1000Hz</strong> として折り返されます。<br>
                オシロ画面左上に「⚠ エイリアス！」と表示される条件を確認してください。
            </div>
        `
    }
};


// =======================================================================
//  4. 画面レイアウト
// =======================================================================

// -----------------------------------------------------------------------
//  オシロスコープの機種切替・説明書
// -----------------------------------------------------------------------

// オシロスコープの機種を切り替える（説明書を開いていた場合は閉じる）
function switchModelUI(modelName) {
    currentModelId = modelName;

    // オシロの2機種のうち、選んだ方だけを表示する（直流電源などほかの機器には触らない）
    document.querySelectorAll('#osc-container .instrument-container').forEach(el => {
        el.style.display = (el.id === 'model-' + modelName) ? 'block' : 'none';
    });
    canvas = document.getElementById('canvas-' + modelName);
    ctx = canvas.getContext('2d');

    closeManual();
    autoFit();       // 機種によって本体の大きさが違うので、画面に収まる倍率にし直す
    redrawWires();   // オシロに繋いだ線を、新しい機種の端子に付け替える
}

// 説明書を開く。
// 開いている間は body に manual-open クラスを付け、機器とワイヤーをCSSで隠す（style.css 9章）。
// 機器の表示状態・位置・倍率には触らないので、閉じればそのまま元の配置に戻る
function showManual() {
    document.body.classList.add('manual-open');
    updateViewButtons();
}

// 説明書を閉じて、開く前の画面に戻る
function closeManual() {
    document.body.classList.remove('manual-open');
    updateViewButtons();
    redrawWires();   // 開いている間にウィンドウの大きさなどが変わっていても、線を端子に合わせ直す
}

// コントロールパネルの「説明書」「Hantek」「Agilent」ボタンの選択表示を、現在の画面に合わせる
function updateViewButtons() {
    const isManualOpen = document.body.classList.contains('manual-open');
    document.getElementById('btn-manual').classList.toggle('active', isManualOpen);
    ['hantek', 'agilent'].forEach(model => {
        document.getElementById('btn-model-' + model).classList.toggle('active', !isManualOpen && model === currentModelId);
    });
}

// -----------------------------------------------------------------------
//  ズーム・サイズ調整
// -----------------------------------------------------------------------

// 機器を scale 倍で表示し、ドラッグ用の外枠も表示サイズに合わせる
function applyContainerScale(container, scale) {
    container.style.transform = `scale(${scale})`;

    const img = container.querySelector('img');
    const wrapper = container.closest('.draggable-equipment');
    if (img && wrapper) {
        // 画像の下に状態表示バー（.status-strip）が付いている機器は、その高さも外枠に含める
        const strip = container.querySelector('.status-strip');
        const stripHeight = strip ? parseFloat(getComputedStyle(strip).height) : 0;
        wrapper.style.width  = `${img.naturalWidth * scale}px`;
        wrapper.style.height = `${(img.naturalHeight + stripHeight) * scale}px`;
    }
}

// 全体の表示倍率を設定する [%]（VIEW SCALE）
function setZoom(newZoom) {
    if (newZoom < 20) newZoom = 20;
    if (newZoom > 400) newZoom = 400;
    currentZoom = Math.floor(newZoom);

    const zoomDisplay = document.getElementById('zoom-display');
    if (zoomDisplay) zoomDisplay.innerText = currentZoom + '%';

    document.querySelectorAll('.instrument-container').forEach(container => {
        if (container.style.display === 'none') return;   // 表示していない方のオシロの機種は対象外
        const img = container.querySelector('img');
        if (!img || img.naturalWidth === 0) return;       // 画像の読み込み前は何もしない
        applyContainerScale(container, currentZoom / 100);
    });

    redrawWires();   // 機器の大きさが変わると端子の位置も変わるので、線を付け直す
}

function changeZoom(amount) {
    setZoom(currentZoom + amount);
}

// 表示中のオシロスコープが画面に収まる倍率にする
function autoFit() {
    const img = document.querySelector('#model-' + currentModelId + ' img');
    if (!img || img.naturalWidth === 0) return;

    const stage = document.querySelector('.main-stage');
    const availableWidth  = stage ? stage.clientWidth  : (window.innerWidth - 40);
    const availableHeight = stage ? stage.clientHeight : (window.innerHeight - 180);

    // 収まる倍率の 95%（少し余白を持たせる）。等倍より大きくはしない
    const bestScale = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);
    let bestZoom = bestScale * 100 * 0.95;
    if (bestZoom > 100) bestZoom = 100;
    setZoom(bestZoom);
}

// SIZE ADJUST: プルダウンで機器を選び直したとき、スライダーをその機器の倍率に合わせる
function updateSizeSliderDisplay() {
    const targetId = document.getElementById('size-target-select').value;
    const currentScale = instrumentScales[targetId] || 1.0;

    document.getElementById('size-slider').value = currentScale;
    document.getElementById('val-size-display').innerText = currentScale.toFixed(1) + 'x';
}

// SIZE ADJUST: スライダーの倍率を、選択中の機器だけに適用する
function applySizeChange() {
    const targetId = document.getElementById('size-target-select').value;
    const scaleValue = parseFloat(document.getElementById('size-slider').value);

    instrumentScales[targetId] = scaleValue;
    document.getElementById('val-size-display').innerText = scaleValue.toFixed(1) + 'x';

    const container = document.getElementById(targetId);
    if (container) applyContainerScale(container, scaleValue);
    redrawWires();
}

// -----------------------------------------------------------------------
//  機器の表示切替・ドラッグ移動
// -----------------------------------------------------------------------

// 機器（'osc' | 'ps' | 'fg' | 'adda'）の表示 / 非表示を切り替える
function toggleEquipment(eqId) {
    const container = document.getElementById(eqId + '-container');
    if (!container) return;

    if (container.style.display === 'none') {
        container.style.display = 'block';
        bringToFront(container);
        setZoom(currentZoom);   // 表示したばかりの機器にも現在のズームを適用する
    } else {
        container.style.display = 'none';
    }
}

// 機器を最前面に出す
function bringToFront(equipment) {
    document.querySelectorAll('.draggable-equipment').forEach(d => d.style.zIndex = 10);
    equipment.style.zIndex = 100;
}

function onDragStart(e) {
    // 画面(canvas)とボタン(hotspot)の上ではドラッグを始めない
    if (e.target.tagName === 'CANVAS') return;
    if (e.target.classList.contains('hotspot')) return;

    const target = e.target.closest('.draggable-equipment');
    if (!target) return;

    dragTarget = target;
    bringToFront(dragTarget);
    dragStart = { mouseX: e.clientX, mouseY: e.clientY, left: dragTarget.offsetLeft, top: dragTarget.offsetTop };
    e.preventDefault();
}

function onDragMove(e) {
    if (!dragTarget) return;
    dragTarget.style.left = (dragStart.left + e.clientX - dragStart.mouseX) + 'px';
    dragTarget.style.top  = (dragStart.top  + e.clientY - dragStart.mouseY) + 'px';
    redrawWires();   // ワイヤーを機器の移動に追従させる
}

function onDragEnd() {
    dragTarget = null;
}

// -----------------------------------------------------------------------
//  サイドバー・実験手順
// -----------------------------------------------------------------------

function toggleSidebar() {
    document.getElementById('equipment-sidebar').classList.toggle('open');
}

function toggleExperimentSidebar() {
    document.getElementById('experiment-sidebar').classList.toggle('open');
}

// 実験手順をモーダルに表示する（内容は 3章の EXPERIMENT_DATA）
function showExperiment(expId) {
    const data = EXPERIMENT_DATA[expId];
    if (!data) return;
    document.getElementById('exp-modal-title').textContent = data.title;
    document.getElementById('exp-modal-body').innerHTML = data.body;
    document.getElementById('experiment-modal').style.display = 'block';
}

function closeExperimentModal() {
    document.getElementById('experiment-modal').style.display = 'none';
}

// -----------------------------------------------------------------------
//  コントロールパネル
// -----------------------------------------------------------------------

// オシロの入力の種類を切り替える（INPUT SOURCE ボタン）
function switchInputSource(source) {
    scopeState.inputSource = source;

    // 内部テスト信号に戻すときは、結線していたときの信号を残さずテスト信号に戻す
    if (source === 'internal') {
        ALL_CHANNELS.forEach(ch => {
            scopeState.signals[ch] = { ...INTERNAL_TEST_SIGNALS[ch] };
        });
    }

    // ボタンの選択表示（'fg' のときはどちらも選択しない）
    document.getElementById('btn-src-internal').classList.toggle('active', source === 'internal');
    document.getElementById('btn-src-ps').classList.toggle('active', source === 'power_supply');
}

// --- 内部テスト信号の操作パネル（SIGNAL GEN） ---
// ※ 現在の index.html にはこのパネルのボタン（id="btn-wave-sine" など）が無いため、
//    下の3つの関数は画面から呼ばれていない。実技テスト第3問がこのパネルを前提にしている。

// 選択中のチャンネルの波形の種類を変える ('sine' | 'square' | 'tri')
function setWaveType(type) {
    scopeState.signals[scopeState.activeChannel].type = type;
    updateControlPanelUI();
    if (scopeState.isOn) drawWaveform();
}

// 選択中のチャンネルの振幅を変える（0.5V〜10V）
function changeSignalAmplitude(amount) {
    const signal = scopeState.signals[scopeState.activeChannel];
    signal.amplitude = Math.max(0.5, Math.min(10.0, signal.amplitude + amount));
    if (scopeState.isOn) drawWaveform();
}

// 波形ボタンの選択表示を、選択中のチャンネルの信号に合わせる
function updateControlPanelUI() {
    const currentType = scopeState.signals[scopeState.activeChannel].type;
    document.querySelectorAll('[id^="btn-wave-"]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('btn-wave-' + currentType);
    if (activeBtn) activeBtn.classList.add('active');
}


// =======================================================================
//  5. 信号の計算（ある時刻の電圧を求める）
// =======================================================================

// 振幅1・オフセット0の基本波形の値（-1〜1）
function waveShape(type, phase) {
    if (type === 'sine')   return Math.sin(phase);
    if (type === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
    if (type === 'tri')    return (2 / Math.PI) * Math.asin(Math.sin(phase));
    return 0;   // 'flat' など
}

// 基本波形 × 振幅 だけの電圧（オフセットは含まない）
// 内部テスト信号の表示と、トリガの判定に使う
function getBaseWaveVoltage(ch, t) {
    const signal = scopeState.signals[ch];
    return waveShape(signal.type, 2 * Math.PI * signal.frequency * t) * signal.amplitude;
}

// 結線された信号のアナログ電圧（オフセット込み。AD変換の階段状の信号にも対応）
function getAnalogVoltage(ch, t) {
    const signal = scopeState.signals[ch];
    if (!signal) return 0;

    if (signal.type === 'sequence') return getSequenceVoltage(signal, t);

    const freq = signal.frequency || 1;
    const amp  = signal.amplitude || 0;
    return waveShape(signal.type, 2 * Math.PI * freq * t) * amp + (signal.offset || 0);
}

// 逐次比較型AD変換器の内部信号（TP3: サンプル/ホールド信号、TP5: DA出力、TP8: 比較器出力）の電圧
//   signal.levels : 1サンプリング周期の中に並ぶ電圧 [V]
//   signal.tsSec  : サンプリング周期 [s]。この中を levels の個数で等分し、周期ごとに繰り返す
function getSequenceVoltage(signal, t) {
    const ts = signal.tsSec;
    const levels = signal.levels;
    if (!ts || !levels || levels.length === 0) return 0;

    // 周期の中での位置（負の時刻にも対応）
    let tt = t % ts;
    if (tt < 0) tt += ts;

    const idx = Math.min(Math.floor(tt / (ts / levels.length)), levels.length - 1);
    return levels[idx];
}

// 電圧を量子化する（AD → DA 変換後の電圧）
//   adda: { resolution, FSR, mode }
function quantizeVoltage(rawVolt, adda) {
    const q = adda.FSR / Math.pow(2, adda.resolution);   // 量子化ステップ [V]

    if (adda.mode === 'unipolar') {
        const clipped = Math.max(0, Math.min(adda.FSR - q, rawVolt));
        return Math.round(clipped / q) * q;
    }

    const halfFSR = adda.FSR / 2;
    const clipped = Math.max(-halfFSR, Math.min(halfFSR - q, rawVolt));
    return Math.round(clipped / q) * q;
}

// DA出力の電圧（標本化＋量子化した階段状の波形）
function getDaOutputVoltage(ch, t) {
    const adda = scopeState.signals[ch].adda;
    const ts = adda.samplingPeriodUs * 1e-6;        // サンプリング周期 [s]
    const sampleTime = Math.floor(t / ts) * ts;     // 直前のサンプリング時刻（サンプル＆ホールド）
    return quantizeVoltage(getAnalogVoltage(ch, sampleTime), adda);
}

// 直流電源の端子の電圧（電源OFF・出力OFFのときは0V）
function getPsTerminalVoltage(psTerminal) {
    if (!psState.isOn || !psState.isOutputOn) return 0;
    if (psTerminal === 'ch1pura') return psState.ch1.voltage;
    if (psTerminal === 'ch1mai')  return -psState.ch1.voltage;
    if (psTerminal === 'ch2pura') return psState.ch2.voltage;
    if (psTerminal === 'ch2mai')  return -psState.ch2.voltage;
    return 0;
}

// オシロのチャンネル ch に、時刻 t で入力されている電圧
function getChannelVoltage(ch, t) {
    // 直流電源を直結: 繋がっている端子の電圧をそのまま表示
    if (scopeState.inputSource === 'power_supply') {
        const conn = getOscChannelConnection(ch);
        return conn ? getPsTerminalVoltage(conn.psTerminal) : 0;
    }

    // 発振器 / AD/DA変換機を結線: 線が繋がっていないチャンネルは必ず0V
    if (scopeState.inputSource === 'fg') {
        if (!getOscChannelConnection(ch)) return 0;
        const signal = scopeState.signals[ch];
        if (signal.source === 'adda' && signal.adda) return getDaOutputVoltage(ch, t);
        if (signal.source === 'fg' || signal.source === 'fg_wire') return getAnalogVoltage(ch, t);
        return getBaseWaveVoltage(ch, t);
    }

    // 内部テスト信号
    return getBaseWaveVoltage(ch, t);
}

// トリガがかかる時刻（波形がトリガレベルを立ち上がりで横切る瞬間）を探す。
// 見つかればその時刻を返して波形を静止させ、見つからなければ現在時刻を返して波形を流す。
function calculateTriggerOffset() {
    const { source, level, slope } = scopeState.trigger;
    const signal = scopeState.signals[source];
    if (!signal) return scopeState.timeOffset;

    // 判定に使う電圧と周期
    //   AD変換の階段状の信号（ビット列など）… 実際の電圧と、その繰り返し周期
    //   それ以外                           … 基本波形（オフセットは考慮されない）と、その周期
    const isSequence = (signal.type === 'sequence');
    const period = isSequence ? signal.tsSec : 1.0 / signal.frequency;
    const voltageAt = t => isSequence ? getSequenceVoltage(signal, t) : getBaseWaveVoltage(source, t);

    // 現在時刻から過去へ2周期分を、1周期あたり100分割して調べる
    const steps = 100;
    const dt = period / steps;
    const baseTime = scopeState.timeOffset;

    for (let i = 0; i < steps * 2; i++) {
        let after  = baseTime - (i * dt);         // 区間の新しい側の時刻
        let before = baseTime - ((i + 1) * dt);   // 区間の古い側の時刻

        if (slope === 'rising' && voltageAt(before) < level && voltageAt(after) >= level) {
            // 区間を半分ずつ狭めて、横切る瞬間を正確に求める（毎フレーム同じ位置で止めるため）
            for (let k = 0; k < 30; k++) {
                const mid = (before + after) / 2;
                if (voltageAt(mid) >= level) after = mid;
                else before = mid;
            }
            scopeState.trigger.isTriggered = true;
            return after;
        }
    }

    scopeState.trigger.isTriggered = false;
    return scopeState.timeOffset;
}

// 信号の周波数に合わせて、約2.5周期が画面（10div）に収まるよう時間軸を選ぶ
function autoAdjustTimeAxis(freq) {
    if (!scopeState.isOn) return;

    const targetTimeDiv = ((1.0 / freq) * 2.5) / 10;

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
//  6. オシロスコープの描画
// =======================================================================

// 画面全体を描く（毎フレーム animationLoop から呼ばれる）
function drawWaveform() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 電源OFFなら真っ暗にして終了
    if (!scopeState.isOn) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    ctx.textBaseline = 'middle';   // 画面内の文字はすべて上下中央基準で描く

    drawGrid();
    drawChannelTraces();
    drawTriggerLevel();
    drawScaleReadout();
    drawAdDaInfo();
    drawTriggerStatus();
    drawMenu();
    drawMeasurePanel();
    drawCursors();
}

// 背景の目盛り線
function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += PIXELS_PER_DIV) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += PIXELS_PER_DIV) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

// 各チャンネルの波形
function drawChannelTraces() {
    const timeDiv = TIME_STEPS[scopeState.timeIndex];
    const centerY = canvas.height / 2;

    // 画面中央をトリガ点（時刻0）にするための補正
    const triggerTime = calculateTriggerOffset();
    const centerTimeShift = (canvas.width / 2 / PIXELS_PER_DIV) * timeDiv;

    (MODEL_CHANNELS[currentModelId] || ['CH1', 'CH2']).forEach(ch => {
        const signal = scopeState.signals[ch];
        const voltDiv = VOLT_STEPS[scopeState['voltIndex' + ch]];

        // 外部入力モードで線が繋がっていないチャンネルは、signals の内容に関係なく0Vで描く
        const isUnwired = (scopeState.inputSource === 'fg') && !getOscChannelConnection(ch);

        // 信号のオフセット（AC結合のチャンネルでは見えない）＋ 位置ツマミによる上下移動
        const signalOffset = (CHANNEL_COUPLING[ch] === 'AC' || isUnwired) ? 0 : (signal.offset || 0);
        const offsetPx = ((signalOffset / voltDiv) * PIXELS_PER_DIV) + scopeState['position' + ch];

        ctx.beginPath();
        ctx.strokeStyle = CHANNEL_COLORS[ch];
        ctx.lineWidth = 2;

        // 2pxごとに、その位置の時刻の電圧を求めて線で結ぶ
        for (let x = 0; x < canvas.width; x += 2) {
            const timeSpan = (x / PIXELS_PER_DIV) * timeDiv;
            const signalTime = timeSpan + triggerTime - centerTimeShift;
            const volt = getChannelVoltage(ch, signalTime);

            // canvas は下向きが正なので、電圧が高いほど y を小さくする
            const y = centerY - (volt / voltDiv * PIXELS_PER_DIV) - offsetPx;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });
}

// トリガレベルの点線と、右端の「T」マーカー（CH1の電圧レンジ基準）
function drawTriggerLevel() {
    const voltDiv = VOLT_STEPS[scopeState.voltIndexCH1];
    const trigY = canvas.height / 2 - (scopeState.trigger.level / voltDiv) * PIXELS_PER_DIV;

    // 点線
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.moveTo(0, trigY);
    ctx.lineTo(canvas.width, trigY);
    ctx.stroke();
    ctx.setLineDash([]);

    // マーカー（左向きの矢印形）
    const markerWidth = 24;
    const markerHeight = 18;
    const markerX = canvas.width;

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 165, 0, 1)';
    ctx.moveTo(markerX - markerWidth, trigY);
    ctx.lineTo(markerX - (markerWidth * 0.4), trigY - (markerHeight / 2));
    ctx.lineTo(markerX, trigY - (markerHeight / 2));
    ctx.lineTo(markerX, trigY + (markerHeight / 2));
    ctx.lineTo(markerX - (markerWidth * 0.4), trigY + (markerHeight / 2));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('T', markerX - (markerWidth * 0.25), trigY + 1);
}

// 画面下端の表示（各チャンネルの電圧レンジと時間軸）
function drawScaleReadout() {
    const y = canvas.height - 20;
    const isExternal = (scopeState.inputSource === 'fg');

    // チャンネルの表示位置と、外部入力モードのときの呼び名
    const readouts = [
        { ch: 'CH1', x: 20,  label: isExternal ? 'DA出力' : 'CH1' },
        { ch: 'CH2', x: 200, label: isExternal ? '原波形' : 'CH2' },
        { ch: 'CH3', x: 380, label: 'CH3' },
    ];

    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    readouts.forEach(({ ch, x, label }) => {
        if (!(MODEL_CHANNELS[currentModelId] || []).includes(ch)) return;

        const vDiv = VOLT_STEPS[scopeState['voltIndex' + ch]];
        const vText = vDiv >= 1 ? `${vDiv.toFixed(2)}V` : `${(vDiv * 1000).toFixed(0)}mV`;
        const marker = (scopeState.activeChannel === ch) ? '▶ ' : '   ';   // 選択中のチャンネルに印
        ctx.fillStyle = CHANNEL_COLORS[ch];
        ctx.fillText(`${marker}${label} ${vText}`, x, y);
    });

    // 時間軸
    const timeDiv = TIME_STEPS[scopeState.timeIndex];
    const tText = timeDiv >= 1     ? `${timeDiv.toFixed(2)}s`
                : timeDiv >= 0.001 ? `${(timeDiv * 1000).toFixed(2)}ms`
                :                    `${(timeDiv * 1000000).toFixed(0)}us`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(`M ${tText}`, canvas.width / 2, y);
}

// 左上の表示（発振器とAD/DA変換機の設定、サンプリング定理の判定）
function drawAdDaInfo() {
    if (scopeState.inputSource !== 'fg' || !fgState.outputOn) return;

    const fmtKHz = hz => hz >= 1000 ? (hz / 1000).toFixed(2) + 'kHz' : hz.toFixed(0) + 'Hz';
    const freqStr = fmtKHz(fgState.freq);
    const fsHz = 1000000 / adDaState.samplingPeriodUs;
    const fsStr = fsHz >= 1000 ? (fsHz / 1000).toFixed(0) + 'kHz' : fsHz + 'Hz';
    const nyquist = fsHz / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(5, 5, 260, 50);

    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`FG: ${fgState.waveform} ${freqStr} ${fgState.amptd.toFixed(2)}Vpp`, 10, 18);
    ctx.fillStyle = '#ffaa00';
    ctx.fillText(`AD/DA: ${adDaState.resolution}bit  fs=${fsStr}  (${adDaState.samplingPeriodUs}µs)`, 10, 32);

    // 入力周波数が fs/2 を超えるとエイリアス（折り返し）が起きる
    if (fgState.freq > nyquist) {
        const foldedStr = fmtKHz(getAliasedFrequency(fgState.freq, fsHz));
        ctx.fillStyle = '#ff4444';
        ctx.fillText(`⚠ エイリアス! fin(${freqStr}) > fs/2(${(nyquist / 1000).toFixed(1)}kHz) → fout=${foldedStr}`, 10, 46);
    } else {
        ctx.fillStyle = '#88ff88';
        ctx.fillText(`✓ fin < fs/2 (${(nyquist / 1000).toFixed(1)}kHz) サンプリング定理OK`, 10, 46);
    }
}

// 右上の表示（トリガレベルと状態）
function drawTriggerStatus() {
    const statusText = scopeState.trigger.isTriggered ? "Trig'd" : 'Auto';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 165, 0, 1)';
    ctx.fillText(`T: ${scopeState.trigger.level.toFixed(2)}V (${statusText})`, canvas.width - 10, 30);
}

// メニュー（機種ごとに見た目が違う）
function drawMenu() {
    if (!scopeState.currentMenu || !scopeState.isOn) return;

    const data = MENU_DATA[currentModelId][scopeState.currentMenu];
    if (!data) return;

    if (currentModelId === 'hantek') drawMenuHantek(data);
    else drawMenuAgilent(data);
}

// Hantek風メニュー: 画面右端に縦並び（F1〜F5ボタンの横）
function drawMenuHantek(data) {
    const menuWidth = 100;
    const menuX = canvas.width - menuWidth;
    const centerX = menuX + (menuWidth / 2);

    // 背景の帯
    ctx.fillStyle = 'rgba(0, 50, 100, 0.8)';
    ctx.fillRect(menuX, 0, menuWidth, canvas.height);

    // タイトル
    ctx.fillStyle = '#002d5c';
    ctx.fillRect(menuX + 2, 2, menuWidth - 4, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.title, centerX, 25);

    // 項目（F1〜F5 の5個まで）
    const startY = 60;
    const buttonHeight = 50;
    const gap = 10;

    ctx.font = '12px sans-serif';
    data.items.forEach((item, index) => {
        if (index >= 5) return;
        const boxY = startY + index * (buttonHeight + gap);

        ctx.fillStyle = '#004080';
        ctx.strokeStyle = '#4da6ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(menuX + 5, boxY, menuWidth - 10, buttonHeight);
        ctx.fill();
        ctx.stroke();

        // 「項目名: 値」の形なら2行に分け、値を黄色で表示する
        const parts = item.split(': ');
        ctx.fillStyle = 'white';
        if (parts.length > 1) {
            ctx.fillText(parts[0], centerX, boxY + 20);
            ctx.fillStyle = 'yellow';
            ctx.fillText(parts[1], centerX, boxY + 38);
        } else {
            ctx.fillText(item, centerX, boxY + 30);
        }
    });
}

// Agilent風メニュー: 画面下端に横並び（ソフトキーの上）。チャンネルのメニューはその色で表示
function drawMenuAgilent(data) {
    const menuHeight = 65;
    const menuY = canvas.height - menuHeight;
    const themeColor = { CH1_MENU: 'yellow', CH2_MENU: 'cyan', CH3_MENU: '#ff66ff' }[scopeState.currentMenu] || '#ccc';

    // 背景と上端の線
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, menuY, canvas.width, menuHeight);
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, menuY);
    ctx.lineTo(canvas.width, menuY);
    ctx.stroke();

    // タイトル（メニューの左上）
    ctx.fillStyle = themeColor;
    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText(data.title, 10, menuY - 10);

    // 項目（ソフトキー6個分）
    const buttonCount = 6;
    const itemWidth = canvas.width / buttonCount;

    data.items.forEach((item, index) => {
        if (index >= buttonCount) return;
        const itemX = index * itemWidth;
        const centerX = itemX + (itemWidth / 2);

        // 区切り線
        if (index > 0) {
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(itemX, menuY);
            ctx.lineTo(itemX, canvas.height);
            ctx.stroke();
        }

        // 「項目名: 値」の形なら2段に分け、値をメニューの色で表示する
        const parts = item.split(': ');
        ctx.textAlign = 'center';
        if (parts.length > 1) {
            ctx.fillStyle = '#bbb';
            ctx.font = '12px sans-serif';
            ctx.fillText(parts[0], centerX, menuY + 22);
            ctx.fillStyle = themeColor;
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(parts[1], centerX, menuY + 48);
        } else {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(item, centerX, menuY + 38);
        }
    });
}

// 自動計測の表示（選択中のチャンネルの Vp-p と周波数）
function drawMeasurePanel() {
    if (!scopeState.showMeasure) return;

    const ch = scopeState.activeChannel;
    const signal = scopeState.signals[ch];

    // 振幅・周波数を持たない信号（AD変換の階段状の信号）は計測できないので「---」と表示する
    let vppText = '---';
    let freqText = '---';
    if (typeof signal.amplitude === 'number' && typeof signal.frequency === 'number') {
        vppText = (signal.amplitude * 2).toFixed(2) + ' V';
        freqText = signal.frequency >= 1000
            ? (signal.frequency / 1000).toFixed(2) + ' kHz'
            : signal.frequency.toFixed(2) + ' Hz';
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvas.width - 250, 40, 140, 70);

    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`[${ch}]`, canvas.width - 240, 60);
    ctx.fillText(`Vp-p: ${vppText}`, canvas.width - 240, 80);
    ctx.fillText(`Freq: ${freqText}`, canvas.width - 240, 100);
}

// カーソル: 時間カーソルA・B（縦線）と、電圧カーソルY1・Y2（横線）。左上に読み値を表示する
//   時間 … A・B の間隔から Δt と 1/Δt
//   電圧 … 選択中のチャンネルの電圧レンジと上下位置を基準にした Y1・Y2 の電圧と、その差 ΔY
function drawCursors() {
    const cursor = scopeState.cursor;
    if (!cursor.show) return;

    const ch = scopeState.activeChannel;
    const centerY = canvas.height / 2;
    const voltDiv = VOLT_STEPS[scopeState['voltIndex' + ch]];
    const voltageOf = offsetY => (offsetY - scopeState['position' + ch]) / PIXELS_PER_DIV * voltDiv;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.font = '12px sans-serif';

    // 線と名前（ツマミで動かせるカーソルを明るく表示）
    const colorOf = name => (cursor.target === name) ? '#00FFFF' : 'rgba(255,255,255,0.5)';
    [['A', cursor.posA], ['B', cursor.posB]].forEach(([name, x]) => {
        ctx.beginPath();
        ctx.strokeStyle = colorOf(name);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
        ctx.fillStyle = colorOf(name);
        ctx.textAlign = 'left';
        ctx.fillText(name, x + 4, canvas.height - 50);
    });
    [['Y1', cursor.offsetY1], ['Y2', cursor.offsetY2]].forEach(([name, offsetY]) => {
        const y = centerY - offsetY;
        ctx.beginPath();
        ctx.strokeStyle = colorOf(name);
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
        ctx.fillStyle = colorOf(name);
        ctx.textAlign = 'right';
        ctx.fillText(name, canvas.width - 30, y - 8);
    });

    // 時間: カーソル間のピクセル数を時間に換算する
    const timePerPixel = TIME_STEPS[scopeState.timeIndex] / PIXELS_PER_DIV;
    const deltaT = Math.abs(cursor.posB - cursor.posA) * timePerPixel;
    const freq = deltaT > 0 ? (1 / deltaT) : 0;
    const deltaTText = deltaT >= 1     ? `${deltaT.toFixed(2)} s`
                     : deltaT >= 0.001 ? `${(deltaT * 1000).toFixed(2)} ms`
                     :                   `${(deltaT * 1000000).toFixed(2)} us`;
    const freqText = freq >= 1000 ? `${(freq / 1000).toFixed(2)} kHz` : `${freq.toFixed(2)} Hz`;

    // 電圧: カーソルの高さを、選択中のチャンネルの電圧に換算する
    const y1 = voltageOf(cursor.offsetY1);
    const y2 = voltageOf(cursor.offsetY2);

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 190, 120);

    ctx.fillStyle = '#FFF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Δt : ${deltaTText}`, 20, 28);
    ctx.fillText(`1/Δt : ${freqText}`, 20, 48);
    ctx.fillStyle = CHANNEL_COLORS[ch];
    ctx.fillText(`Y1 (${ch}) : ${y1.toFixed(2)} V`, 20, 74);
    ctx.fillText(`Y2 (${ch}) : ${y2.toFixed(2)} V`, 20, 94);
    ctx.fillText(`ΔY : ${Math.abs(y1 - y2).toFixed(2)} V`, 20, 114);

    ctx.restore();
}

// 描画ループ（RUN中は時刻を進める）
function animationLoop() {
    if (scopeState.isOn && scopeState.isRunning) {
        scopeState.timeOffset -= 0.0001;
    }
    drawWaveform();
    requestAnimationFrame(animationLoop);
}


// =======================================================================
//  7. 直流電源
// =======================================================================

// ボタン操作（ツマミを回す操作は 12章の onHotspotWheel で処理する）
function handlePsButton(title) {
    if (title === 'ps_power') {
        psState.isOn = !psState.isOn;
        if (!psState.isOn) psState.isOutputOn = false;   // 電源OFFで出力も切れる
        updatePSDisplay();

    } else if (title === 'ch1btn' || title === 'ch2btn') {
        if (!psState.isOn) return;
        psState.activeChannel = (title === 'ch1btn') ? 'CH1' : 'CH2';
        renderPsDisplay();

    } else if (title === 'output') {
        if (!psState.isOn) return;
        psState.isOutputOn = !psState.isOutputOn;
        renderPsDisplay();
        applyAdDaSignals();

    } else if (title === 'volt') {
        // 電圧ツマミを押す: 粗調整(0.1V刻み) ⇔ 微調整 FINE(0.01V刻み)
        if (!psState.isOn) return;
        psState.fineMode = !psState.fineMode;
        renderPsDisplay();
        showWireStatus(psState.fineMode
            ? '直流電源 VOLTAGE: FINE（0.01V刻み）'
            : '直流電源 VOLTAGE: 粗調整（0.1V刻み）');
    }
}

// 電圧ツマミを1段階回す（direction: +1 = 上げる / -1 = 下げる）。0〜30V
function stepPsVoltage(direction) {
    const channel = psState[psState.activeChannel.toLowerCase()];
    const step = psState.fineMode ? 0.01 : 0.1;
    const next = Math.max(0, Math.min(30, channel.voltage + direction * step));
    channel.voltage = Math.round(next * 100) / 100;   // 小数の誤差がたまらないよう 0.01V 単位に丸める
    updatePSDisplay();
}

// 本体のLED表示（電圧・電流）と、下の状態表示バーを現在の状態に合わせる
function renderPsDisplay() {
    const setText = (id, text) => { document.getElementById(id).textContent = text; };

    // 電源OFFなら表示を消す
    setText('disp-ch1-v', psState.isOn ? psState.ch1.voltage.toFixed(2).padStart(5, '0') : '');
    setText('disp-ch1-a', psState.isOn ? psState.ch1.current.toFixed(3) : '');
    setText('disp-ch2-v', psState.isOn ? psState.ch2.voltage.toFixed(2).padStart(5, '0') : '');
    setText('disp-ch2-a', psState.isOn ? psState.ch2.current.toFixed(3) : '');

    // 状態表示バー
    setText('ps-st-power', psState.isOn ? 'ON' : 'OFF');
    setText('ps-st-output', psState.isOutputOn ? 'ON' : 'OFF');
    setText('ps-st-channel', psState.activeChannel);
    setText('ps-st-fine', psState.fineMode ? 'FINE (0.01V刻み)' : '粗調整 (0.1V刻み)');
    document.getElementById('ps-st-output').classList.toggle('is-on', psState.isOutputOn);
    document.getElementById('ps-st-fine').classList.toggle('is-on', psState.fineMode);
}

// 本体の表示を更新し、電圧の変化をオシロにも反映する
function updatePSDisplay() {
    renderPsDisplay();
    refreshScopeSignals();
}


// =======================================================================
//  8. 発振器
// =======================================================================

// テンキーのボタン名 → 入力される文字
const FG_NUMBER_KEYS = {
    zero: '0', one: '1', two: '2', three: '3', fore: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

// 項目選択ボタン → 入力中の項目
const FG_INPUT_MODES = { freq: 'FREQ', amptd: 'AMPTD', offset: 'OFFSET' };

// ボタン操作
function handleFgButton(btnId) {
    // 電源
    if (btnId === 'latorpowar') {
        fgState.power = !fgState.power;
        if (!fgState.power) {
            fgState.outputOn = false;   // 電源OFFで出力も切れる
            fgState.inputMode = '';
            fgState.inputValue = '';
        }
        updateFgDisplay();
        return;
    }

    // 電源が入っていなければ他のボタンは反応しない
    if (!fgState.power) return;

    if (FG_NUMBER_KEYS[btnId]) {
        // テンキー（項目を選択しているときだけ入力できる）
        if (fgState.inputMode) fgState.inputValue += FG_NUMBER_KEYS[btnId];

    } else if (btnId === 'dot') {
        if (fgState.inputMode && !fgState.inputValue.includes('.')) fgState.inputValue += '.';

    } else if (btnId === 'puramai') {
        // 符号の反転
        if (fgState.inputMode) {
            fgState.inputValue = fgState.inputValue.startsWith('-')
                ? fgState.inputValue.substring(1)
                : '-' + fgState.inputValue;
        }

    } else if (btnId === 'cansel' || btnId === 'undo') {
        fgState.inputValue = '';

    } else if (btnId === 'enter') {
        // 入力した値を確定する（設定できる範囲に収める）
        const val = parseFloat(fgState.inputValue);
        if (fgState.inputMode && fgState.inputValue !== '' && !isNaN(val)) {
            if (fgState.inputMode === 'FREQ')   fgState.freq   = Math.max(0.001, Math.min(2000000, val));
            if (fgState.inputMode === 'AMPTD')  fgState.amptd  = Math.max(0.001, Math.min(10.0, val));
            if (fgState.inputMode === 'OFFSET') fgState.offset = Math.max(-5.0, Math.min(5.0, val));
        }
        fgState.inputMode = '';
        fgState.inputValue = '';

    } else if (btnId === 'fctn') {
        // 波形の切替: SINE → SQUARE → RAMP → SINE ...
        const waves = ['SINE', 'SQUARE', 'RAMP'];
        fgState.waveform = waves[(waves.indexOf(fgState.waveform) + 1) % waves.length];
        showWireStatus(`波形: ${fgState.waveform} に切替`);

    } else if (FG_INPUT_MODES[btnId]) {
        // 入力する項目の選択（周波数・振幅・オフセット）
        fgState.inputMode = FG_INPUT_MODES[btnId];
        fgState.inputValue = '';

    } else if (btnId === 'out') {
        // 出力のON/OFF
        fgState.outputOn = !fgState.outputOn;
        if (fgState.outputOn) {
            // 出力ONでオシロの電源も入れる
            if (!scopeState.isOn) {
                scopeState.isOn = true;
                scopeState.isRunning = true;
            }
            // オシロに直結していないときは、AD/DA変換機の入力切換(SW1)を発振器側にする
            const isWiredToScope = wiringState.connections.some(c => c.type === 'fg');
            if (!isWiredToScope) adDaState.inputSource = 'fg';
            showWireStatus('📡 発振器 OUTPUT ON');
        } else {
            showWireStatus('🔇 発振器 OUTPUT OFF');
        }
    }

    updateFgDisplay();
}

// 本体の画面表示を更新し、設定の変化をオシロにも反映する
function updateFgDisplay() {
    const display = document.getElementById('fg-display');
    display.classList.toggle('fg-display-on', fgState.power);   // 電源OFFなら画面を消す

    if (fgState.power) {
        const freqText = fgState.freq >= 1000
            ? (fgState.freq / 1000).toFixed(3) + ' kHz'
            : fgState.freq.toFixed(1) + ' Hz';

        document.getElementById('fg-disp-wave').innerText   = `WAVE: ${fgState.waveform}`;
        document.getElementById('fg-disp-freq').innerText   = `FREQ: ${freqText}`;
        document.getElementById('fg-disp-amptd').innerText  = `AMP: ${fgState.amptd.toFixed(3)} Vpp`;
        document.getElementById('fg-disp-offset').innerText = `OFS: ${fgState.offset.toFixed(2)} V`;
        document.getElementById('fg-disp-out').innerText    = fgState.outputOn ? 'OUTPUT: ON ▶' : 'OUTPUT: OFF';
        document.getElementById('fg-disp-input').innerText  = fgState.inputMode
            ? `[入力中] ${fgState.inputMode} > ${fgState.inputValue}_`
            : '';
    }

    refreshScopeSignals();
}


// =======================================================================
//  9. AD/DA変換機 (ITF-203B)
// =======================================================================

// -----------------------------------------------------------------------
//  スイッチ操作
// -----------------------------------------------------------------------

function handleAddaSwitch(swId) {
    if (swId === 'SW1') {
        // 入力切換: TB1 に結線があるときは、結線されている機器で決まるので切り替えられない
        const tb1Source = getTb1Source();
        if (tb1Source) {
            const deviceName = (tb1Source === 'dc') ? '直流電源' : '発振器';
            showWireStatus(`SW1: TB1には${deviceName}が結線されています。切り替えるには先に結線を外してください。`);
            return;
        }
        adDaState.inputSource = (adDaState.inputSource === 'fg') ? 'dc' : 'fg';
        switchInputSource(adDaState.inputSource === 'dc' ? 'power_supply' : 'fg');
        refreshScopeSignals();

    } else if (swId === 'SW4') {
        // 量子化ビット数: 8bit ⇔ 4bit
        adDaState.resolution = (adDaState.resolution === 8) ? 4 : 8;
        refreshScopeSignals();
        showWireStatus(`AD resolution: ${adDaState.resolution} bit`);

    } else if (swId === 'SW5' || swId === 'SW7') {
        // 動作モード: バイポーラ ⇔ ユニポーラ
        adDaState.mode = (adDaState.mode === 'bipolar') ? 'unipolar' : 'bipolar';
        refreshScopeSignals();
        showWireStatus(`AD/DA mode: ${adDaState.mode}`);

    } else if (swId === 'SW6' || swId === 'SW8') {
        showWireStatus(`${swId}: OFF (filter bypass for this experiment)`);
    }
}

// サンプリング周期を1段階切り替える（direction: +1 = 次へ / -1 = 前へ。端まで行くと反対側に戻る）
function cycleAdDaSampling(direction = 1) {
    const options = adDaState.samplingOptions;
    const current = options.indexOf(adDaState.samplingPeriodUs);
    adDaState.samplingPeriodUs = options[(current + direction + options.length) % options.length];
    refreshScopeSignals();
    showWireStatus(`Ts = ${adDaState.samplingPeriodUs} us`);
}

// -----------------------------------------------------------------------
//  状態表示バー（基板の下。デジタルコードのLEDと、スイッチの現在の設定）
// -----------------------------------------------------------------------

function updateAdDaStatus() {
    const setText = (id, text) => { document.getElementById(id).textContent = text; };
    const n = adDaState.resolution;
    const tb1Source = getTb1Source();

    // --- デジタルコード（LED 8個。左が最上位ビット）---
    // 4bit のときは上位側の4個だけを使う。
    // 発振器を入力しているときはコードが高速に変わり続けるので、全体を薄く点灯させる
    const isChanging = (tb1Source === 'fg' && fgState.power && fgState.outputOn);
    const code = getAdDaCode(getAdDaInputVoltage());
    const codeText = code.toString(2).padStart(n, '0');

    document.querySelectorAll('#adda-leds .led').forEach((led, i) => {
        const isUsed = (i < n);
        led.classList.toggle('unused', !isUsed);
        led.classList.toggle('dim', isUsed && isChanging);
        led.classList.toggle('on', isUsed && !isChanging && codeText[i] === '1');
    });
    setText('adda-st-code', isChanging ? '(変化中)' : codeText);

    // --- スイッチの設定 ---
    const fsHz = 1000000 / adDaState.samplingPeriodUs;
    setText('adda-st-input', tb1Source === 'dc' ? '直流電源' : (tb1Source === 'fg' ? '発振器' : '未結線'));
    setText('adda-st-bits', n + ' bit');
    setText('adda-st-mode', adDaState.mode === 'unipolar' ? 'ユニポーラ' : 'バイポーラ');
    setText('adda-st-sampling', `${adDaState.samplingPeriodUs} µs (${fsHz / 1000} kHz)`);
}

// -----------------------------------------------------------------------
//  入力電圧と AD変換
// -----------------------------------------------------------------------

// 信号入力端子 TB1 に結線されている機器（'dc' = 直流電源 / 'fg' = 発振器 / null = 未結線）
function getTb1Source() {
    const conn = wiringState.connections.find(c =>
        c.addaTerminal === 'TB1' && (c.type === 'ps-adda' || c.type === 'fg-adda'));
    if (!conn) return null;
    return (conn.type === 'ps-adda') ? 'dc' : 'fg';
}

// AD変換する入力電圧。発振器の場合は波形のピーク値を代表値とする
// ※ 直流電源は、どの端子を繋いでも CH1 の設定電圧を使う
function getAdDaInputVoltage() {
    const source = getTb1Source();
    if (source === 'dc') {
        return (psState.isOn && psState.isOutputOn) ? psState.ch1.voltage : 0;
    }
    if (source === 'fg' && fgState.power && fgState.outputOn) {
        return fgState.offset + fgState.amptd / 2;
    }
    return 0;
}

// 電圧 → AD変換結果のコード（0 〜 2^n - 1）
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

// コード → DA変換後の電圧
function getAdDaOutputFromCode(code) {
    const q = adDaState.FSR / Math.pow(2, adDaState.resolution);
    const value = code * q;
    return (adDaState.mode === 'unipolar') ? value : value - (adDaState.FSR / 2);
}

// --- 逐次比較型AD変換器の内部信号 ---
// 1サンプリング周期を n+2 個の区間に分けて表す（n = 量子化ビット数）。
//   区間 0      : 入力をサンプルする（変換開始）
//   区間 1 〜 n : 上位ビット(MSB)から順に1ビットずつ決める
//   区間 n+1    : 変換終了
// 3つの信号は同じ区切りなので、オシロで並べると時間軸が対応する。

// 論理 0 / 1 に対応する電圧 [V]
const LOGIC_LOW = 0;
const LOGIC_HIGH = 5;

// サンプル/ホールド制御信号（TP3）: 区間0だけ1（サンプル）、残りは0（ホールド）
function buildSarSyncBits(resolution) {
    const bits = new Array(resolution + 2).fill(0);
    bits[0] = 1;
    return bits;
}

// 比較器出力（TP8）: 変換開始マーカー(1) + 変換結果 n ビット(MSB→LSB) + 変換終了マーカー(0)
function buildSarOutputBits(code, resolution) {
    const bits = [1];
    for (let i = resolution - 1; i >= 0; i--) {
        bits.push((code >> i) & 1);
    }
    bits.push(0);
    return bits;
}

// 逐次比較用の内部DA変換器の出力（TP5）: 入力電圧と比べる「試しの電圧」が階段状に変わっていく。
//   区間 0      : リセット（コード0の電圧）
//   区間 1 〜 n : それまでに確定したビット ＋ いま試しているビットを1にしたコードの電圧。
//                 入力の方が大きければそのビットは1に確定し、小さければ0に戻して次のビットへ進む
//   区間 n+1    : 確定したコード（＝AD変換結果）の電圧
// 例: FSR=10.24V・8bit・ユニポーラで入力 6.98V → 0, 5.12, 7.68, 6.40, 7.04, 6.72, 6.88, 6.96, 7.00, 6.96 [V]
function buildSarDacLevels(code, resolution) {
    const levels = [getAdDaOutputFromCode(0)];
    let decided = 0;                              // 確定済みのビット
    for (let i = resolution - 1; i >= 0; i--) {
        const trial = decided | (1 << i);         // このビットを1にして試す
        levels.push(getAdDaOutputFromCode(trial));
        if (code & (1 << i)) decided = trial;     // 入力 ≧ 試しの電圧 なら1に確定
    }
    levels.push(getAdDaOutputFromCode(code));
    return levels;
}

// サンプリング周波数 fs で周波数 fin を標本化したときに観測される周波数（折り返し後、0〜fs/2）
function getAliasedFrequency(fin, fs) {
    if (!fs || fs <= 0) return fin;
    let f = fin % fs;
    if (f < 0) f += fs;
    if (f > fs / 2) f = fs - f;
    return f;
}

// -----------------------------------------------------------------------
//  各端子から出る信号
// -----------------------------------------------------------------------

// 0V を基準にした直流（一定電圧）の信号
function flatSignal(source, offset = 0) {
    return { type: 'flat', amplitude: 0, frequency: 1, offset, source };
}

// TB1 に入力されているアナログ信号
function makeAdDaInputSignal() {
    const tb1Source = getTb1Source();
    if (!tb1Source)         return flatSignal('fg');                          // 未結線: 入力なし
    if (tb1Source === 'dc') return flatSignal('fg', getAdDaInputVoltage());   // 直流電源

    // 発振器
    const waveMap = { SINE: 'sine', SQUARE: 'square', RAMP: 'tri' };
    return {
        type: waveMap[fgState.waveform] || 'sine',
        amplitude: fgState.outputOn ? fgState.amptd / 2 : 0,
        frequency: fgState.freq,
        offset: fgState.outputOn ? fgState.offset : 0,
        source: 'fg',
    };
}

// AD/DA変換機の端子 terminalName をオシロに繋いだときに観測される信号
function makeAdDaTerminalSignal(terminalName) {
    const tb1Source = getTb1Source();
    const tsSec = adDaState.samplingPeriodUs * 1e-6;

    // TP1: 入力の原波形
    if (terminalName === 'TP1') return makeAdDaInputSignal();

    // TB5: DA出力
    if (terminalName === 'TB5') {
        if (!tb1Source) return flatSignal('fg');
        if (tb1Source === 'dc') {
            return flatSignal('fg', getAdDaOutputFromCode(getAdDaCode(getAdDaInputVoltage())));
        }
        // 発振器: 原波形に、描画時に標本化＋量子化をかける
        return {
            ...makeAdDaInputSignal(),
            source: 'adda',
            adda: {
                resolution: adDaState.resolution,
                samplingPeriodUs: adDaState.samplingPeriodUs,
                FSR: adDaState.FSR,
                mode: adDaState.mode,
            },
        };
    }

    // 逐次比較の内部信号（1サンプリング周期で繰り返す階段状の信号）
    const sequence = levels => ({ type: 'sequence', levels, tsSec, source: 'fg' });
    const logic = bits => bits.map(bit => bit ? LOGIC_HIGH : LOGIC_LOW);
    const code = getAdDaCode(getAdDaInputVoltage());

    // TP3: サンプル/ホールド制御信号
    if (terminalName === 'TP3') return sequence(logic(buildSarSyncBits(adDaState.resolution)));

    // TP8: 比較器出力（AD変換結果のビット列）
    if (terminalName === 'TP8') return sequence(logic(buildSarOutputBits(code, adDaState.resolution)));

    // TP5: 逐次比較用DA変換器の出力（試しの電圧の階段波）
    if (terminalName === 'TP5') return sequence(buildSarDacLevels(code, adDaState.resolution));

    // そのほかの端子は未対応（0V）
    return flatSignal('fg');
}

// 端子の信号を見やすく表示するための基準周波数（時間軸の自動調整に使う）。
// 自動調整しない場合（直流入力・未結線など）は null
function getAdDaTerminalDisplayFrequency(terminalName) {
    const fsHz = 1000000 / adDaState.samplingPeriodUs;

    // 逐次比較の内部信号は1サンプリング周期を n+2 個に区切っているので、その速さを基準にする
    if (terminalName === 'TP3' || terminalName === 'TP5' || terminalName === 'TP8') {
        return fsHz * (adDaState.resolution + 2);
    }

    if (terminalName === 'TB5' || terminalName === 'TP1') {
        const isFgInput = getTb1Source() === 'fg' && fgState.power && fgState.outputOn && fgState.freq;
        if (!isFgInput) return null;
        if (terminalName === 'TP1') return fgState.freq;

        // DA出力は折り返し後の周波数で見える。fin が fs の整数倍で直流になるときは
        // 時間軸が広がりすぎないよう下限を設ける
        const aliased = getAliasedFrequency(fgState.freq, fsHz);
        return aliased > 0 ? aliased : Math.max(1, fsHz / 100);
    }
    return null;
}


// =======================================================================
//  10. 結線（ワイヤー）
//
//   操作: 端子をクリック（1本目を選択）→ 別の機器の端子をクリック（接続）
//         端子を右クリック（その端子の線を切断）
// =======================================================================

// -----------------------------------------------------------------------
//  端子・接続の問い合わせ
// -----------------------------------------------------------------------

// 端子名 → どの機器の端子か ('ps' | 'osc' | 'fg' | 'adda')。端子でなければ null
function getTerminalSide(name) {
    return Object.keys(TERMINALS).find(side => TERMINALS[side].includes(name)) || null;
}

// オシロのチャンネル名 ('CH1') → 入力端子名 ('Ch1')
function oscTerminalOf(ch) {
    return ch === 'CH1' ? 'Ch1' : (ch === 'CH3' ? 'Ch3' : 'Ch2');
}

// そのチャンネルの入力端子に繋がっている接続（無ければ undefined）
function getOscChannelConnection(ch) {
    const term = oscTerminalOf(ch);
    return wiringState.connections.find(c => c.oscTerminal === term);
}

// 接続1本の両端を [[側, 端子名], [側, 端子名]] で返す（信号源側が先）
function getConnectionEndpoints(conn) {
    return ['ps', 'fg', 'adda', 'osc']
        .filter(side => conn[side + 'Terminal'])
        .map(side => [side, conn[side + 'Terminal']]);
}

// 端子のホットスポット要素を取得する（オシロは表示中の機種のものを返す）
function getTerminalElement(side, terminalName) {
    const containerId = (side === 'osc') ? 'model-' + currentModelId : 'model-' + side;
    return document.querySelector(`#${containerId} .hotspot[title="${terminalName}"]`);
}

// -----------------------------------------------------------------------
//  ワイヤーの描画
// -----------------------------------------------------------------------

// 要素の中心の画面座標
function getCenterPos(el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function createSvgElement(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
}

// 端子の「接続中」表示（緑）を、現在の結線に合わせて付け直す
function syncTerminalHighlights() {
    document.querySelectorAll('.hotspot.wire-connected').forEach(el => el.classList.remove('wire-connected'));
    wiringState.connections.forEach(conn => {
        getConnectionEndpoints(conn).forEach(([side, term]) => {
            const el = getTerminalElement(side, term);
            if (el) el.classList.add('wire-connected');
        });
    });
}

// すべてのワイヤーを描き直す（結線の変更・機器の移動・ウィンドウのリサイズ時に呼ぶ）
function redrawWires() {
    const svg = document.getElementById('wire-overlay');   // 画面全体に重ねたSVG
    svg.innerHTML = '';

    syncTerminalHighlights();

    // 確定済みの接続
    wiringState.connections.forEach(conn => {
        const [[side1, term1], [side2, term2]] = getConnectionEndpoints(conn);
        const el1 = getTerminalElement(side1, term1);
        const el2 = getTerminalElement(side2, term2);
        if (!el1 || !el2) return;
        drawWire(svg, getCenterPos(el1), getCenterPos(el2), conn.color);
    });

    // 選択中（接続先待ち）の端子を、点滅する輪で囲む
    const pending = wiringState.pendingTerminal;
    if (pending && pending.el) {
        const pos = getCenterPos(pending.el);
        const circle = createSvgElement('circle', {
            cx: pos.x, cy: pos.y, r: 12,
            fill: 'none', stroke: pending.color, 'stroke-width': 3, 'stroke-dasharray': '4 3',
        });
        circle.style.animation = 'wirePulse 0.8s ease-in-out infinite alternate';
        svg.appendChild(circle);
    }
}

// 2点を、下にたるんだ曲線のワイヤーで結ぶ
function drawWire(svg, p1, p2, color) {
    const mx = (p1.x + p2.x) / 2;
    const my = Math.max(p1.y, p2.y) + Math.abs(p2.x - p1.x) * 0.3 + 40;
    const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;

    // 影（立体感）→ 本体 → 両端の丸 の順に重ねる
    svg.appendChild(createSvgElement('path', {
        d, fill: 'none', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 7, 'stroke-linecap': 'round',
    }));
    svg.appendChild(createSvgElement('path', {
        d, fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round',
    }));
    [p1, p2].forEach(p => {
        svg.appendChild(createSvgElement('circle', {
            cx: p.x, cy: p.y, r: 5, fill: color, stroke: 'white', 'stroke-width': 1.5,
        }));
    });
}

// 画面下端のステータスバーにメッセージを一定時間表示する
function showWireStatus(msg, durationMs = 2500) {
    const bar = document.getElementById('wire-status-bar');
    bar.textContent = msg;
    bar.style.opacity = '1';
    clearTimeout(bar._hideTimer);
    bar._hideTimer = setTimeout(() => { bar.style.opacity = '0'; }, durationMs);
}

// -----------------------------------------------------------------------
//  接続・切断
// -----------------------------------------------------------------------

// 端子がクリックされたときの処理
function handleTerminalClick(terminalName, hotspotEl) {
    const side = getTerminalSide(terminalName);
    if (!side) return;

    const pending = wiringState.pendingTerminal;

    // 1本目: この端子を選択して、接続先のクリックを待つ
    if (!pending) {
        wiringState.pendingTerminal = {
            terminalName, side, el: hotspotEl,
            color: TERMINAL_COLORS[terminalName] || '#ffffff',
        };
        hotspotEl.classList.add('wire-selected');
        showWireStatus(`🔌 端子「${terminalName}」を選択。次に接続先の端子をクリックしてください。`, 5000);
        redrawWires();
        return;
    }

    // 同じ端子をもう一度クリック → 選択を解除
    if (pending.terminalName === terminalName) {
        cancelPendingTerminal();
        showWireStatus('❌ 選択を解除しました。');
        redrawWires();
        return;
    }

    // 2本目: 接続を試みる（接続できない組み合わせのときは、1本目の選択を残す）
    if (pending.side === side) {
        showWireStatus(`⚠️ ${SIDE_NAMES[side]}の端子同士は繋げません。`);
        return;
    }
    const result = connectTerminals(pending, { terminalName, side });
    showWireStatus(result.message);
    if (result.connected) {
        cancelPendingTerminal();
        redrawWires();
    }
}

// 1本目の選択を取り消す
function cancelPendingTerminal() {
    const pending = wiringState.pendingTerminal;
    if (pending && pending.el) pending.el.classList.remove('wire-selected');
    wiringState.pendingTerminal = null;
}

// 2つの端子（{ terminalName, side }）を接続する。first が先に選んだ端子、second が後からクリックした端子。
// 戻り値: { connected: 接続できたか, message: ステータスバーに出すメッセージ }
function connectTerminals(first, second) {
    const term = { [first.side]: first.terminalName, [second.side]: second.terminalName };   // 側 → 端子名
    const sourceSide = term.ps ? 'ps' : (term.fg ? 'fg' : 'adda');                           // 信号を出す側
    const sourceTerm = term[sourceSide];

    // ワイヤーの色は信号源側の端子の色（色が決まっていない端子なら、後からクリックした端子の色）
    const color = TERMINAL_COLORS[sourceTerm] || TERMINAL_COLORS[second.terminalName] || '#ffffff';

    // --- オシロの入力端子へ繋ぐ（直流電源 / 発振器 / AD/DA変換機 → オシロ）---
    if (term.osc) {
        // オシロの1つの入力端子に繋げる線は1本だけ。すでにあれば繋ぎ替える
        wiringState.connections = wiringState.connections.filter(c => c.oscTerminal !== term.osc);
        wiringState.connections.push({
            type: sourceSide, [sourceSide + 'Terminal']: sourceTerm, oscTerminal: term.osc, color,
        });

        if (sourceSide === 'fg') {
            applyFgSignals();
            return { connected: true, message: `✅ 発振器(${sourceTerm}) ↔ オシロ(${term.osc}) を接続しました。右クリックで切断できます。` };
        }
        if (sourceSide === 'ps') {
            applyAdDaSignals();
            if (scopeState.inputSource !== 'power_supply') switchInputSource('power_supply');
            return { connected: true, message: `✅ ${sourceTerm} ↔ ${term.osc} を接続しました。右クリックで切断できます。` };
        }
        scopeState.inputSource = 'fg';
        applyAdDaSignals();
        return { connected: true, message: `✅ AD/DA(${sourceTerm}) → オシロ(${term.osc}) を接続しました。右クリックで切断できます。` };
    }

    // --- AD/DA変換機の信号入力へ繋ぐ（直流電源 / 発振器 → TB1・TB2）---
    if (term.adda) {
        const sourceName = SIDE_NAMES[sourceSide];
        if (term.adda !== 'TB1' && term.adda !== 'TB2') {
            return { connected: false, message: `⚠️ ${sourceName}はAD/DA変換機のTB1(+)/TB2(-)端子に接続してください。` };
        }

        // 同じ入力端子にすでに線があれば繋ぎ替える
        wiringState.connections = wiringState.connections.filter(c => c.addaTerminal !== term.adda);
        wiringState.connections.push({
            type: sourceSide + '-adda', [sourceSide + 'Terminal']: sourceTerm, addaTerminal: term.adda, color,
        });

        // TB1 に繋いだ機器に合わせて、入力切換(SW1)の位置も切り替える
        if (term.adda === 'TB1') adDaState.inputSource = (sourceSide === 'ps') ? 'dc' : 'fg';

        refreshScopeSignals();
        return { connected: true, message: `✅ ${sourceName}(${sourceTerm}) → AD/DA(${term.adda}) を接続しました。右クリックで切断できます。` };
    }

    // --- それ以外（直流電源 ↔ 発振器）は接続できない ---
    return { connected: false, message: '⚠️ この端子の組み合わせは接続できません。' };
}

// 端子に繋がっている線をすべて切断する
function disconnectTerminal(terminalName) {
    const key = getTerminalSide(terminalName) + 'Terminal';
    const countBefore = wiringState.connections.length;
    wiringState.connections = wiringState.connections.filter(c => c[key] !== terminalName);

    cancelPendingTerminal();
    refreshScopeSignals();
    redrawWires();

    if (wiringState.connections.length !== countBefore) {
        showWireStatus('🔌 接続を切断しました。');
    }
}

// すべての結線を外す（結線クリアボタン）
function clearAllWires() {
    wiringState.connections = [];
    cancelPendingTerminal();
    refreshScopeSignals();
    redrawWires();
    showWireStatus('🔌 すべての結線を解除しました。');
}

// 端子の右クリック → 切断
function onContextMenu(e) {
    const hotspot = e.target.closest('.hotspot');
    if (!hotspot || !getTerminalSide(hotspot.title)) return;
    e.preventDefault();
    disconnectTerminal(hotspot.title);
}


// =======================================================================
//  11. 結線 → オシロに映す信号への反映
//
//   scopeState.signals[CH] は、ここの関数だけが結線から作る。
//     発振器 → オシロ          … applyFgSignals()
//     AD/DA変換機 → オシロ      … applyAdDaSignals()
//     直流電源 → オシロ         … signals は使わず、描画時に電圧を直接読む（getChannelVoltage）
//     どこにも繋がっていない    … clearUnwiredChannelSignals() で 0V
// =======================================================================

// 機器の設定や結線が変わったときに呼ぶ。全チャンネルの信号を作り直す
function refreshScopeSignals() {
    applyFgSignals();
    applyAdDaSignals();
}

// 発振器を直結したチャンネルの信号を作る
function applyFgSignals() {
    const isOutputting = fgState.power && fgState.outputOn;
    const waveMap = { SINE: 'sine', SQUARE: 'square', RAMP: 'tri' };

    ALL_CHANNELS.forEach(ch => {
        const conn = getOscChannelConnection(ch);
        if (!conn || conn.type !== 'fg') return;

        if (!isOutputting) {
            scopeState.signals[ch] = flatSignal('fg_wire');   // 出力OFF: 0V
            return;
        }

        scopeState.signals[ch] = {
            type: waveMap[fgState.waveform] || 'sine',
            amplitude: fgState.amptd / 2,   // Vpp → 片側振幅
            frequency: fgState.freq,
            offset: fgState.offset,
            source: 'fg_wire',
        };
        scopeState.inputSource = 'fg';
        autoAdjustTimeAxis(fgState.freq);
    });

    clearUnwiredChannelSignals();
}

// AD/DA変換機の端子を繋いだチャンネルの信号を作る
function applyAdDaSignals() {
    clearUnwiredChannelSignals();

    // 時間軸は、繋がっている端子のうち最も遅い信号に合わせる
    // （速い方に合わせると、エイリアスで生じるゆっくりしたうねりが画面に収まらない）
    let minDisplayFreq = Infinity;

    ALL_CHANNELS.forEach(ch => {
        const conn = getOscChannelConnection(ch);
        if (!conn || conn.type !== 'adda') return;

        scopeState.signals[ch] = makeAdDaTerminalSignal(conn.addaTerminal);

        const freq = getAdDaTerminalDisplayFrequency(conn.addaTerminal);
        if (freq && freq > 0 && freq < minDisplayFreq) minDisplayFreq = freq;
    });

    if (minDisplayFreq < Infinity) autoAdjustTimeAxis(minDisplayFreq);

    // 入力電圧や設定が変わるとLEDのコードも変わるので、基板下の状態表示も合わせる
    updateAdDaStatus();

    if (scopeState.isOn) drawWaveform();
}

// 線が繋がっていないチャンネルを「入力なし(0V)」に戻す。
// これを忘れると、結線を切断しても前の波形が画面に残り続ける
function clearUnwiredChannelSignals() {
    ALL_CHANNELS.forEach(ch => {
        if (getOscChannelConnection(ch)) return;

        // 内部テスト信号モードのテスト信号（source を持たない）は消さない
        const signal = scopeState.signals[ch];
        if (scopeState.inputSource === 'internal' && signal && !signal.source) return;

        scopeState.signals[ch] = flatSignal('none');
    });
}


// =======================================================================
//  12. ホットスポット（機器画像の上のボタン）
//
//   index.html の <map> / <area> に書かれた座標から、機器画像の上に
//   <div class="hotspot" title="ボタン名"> を自動生成する。
//   クリック・ホイール・ツールチップは、この title を見て処理を振り分ける。
// =======================================================================

// -----------------------------------------------------------------------
//  生成
// -----------------------------------------------------------------------

function buildHotspots() {
    document.querySelectorAll('map').forEach(map => {
        const container = document.getElementById(MAP_TO_CONTAINER[map.name]);
        if (!container) return;

        map.querySelectorAll('area').forEach(area => {
            const coordsStr = area.getAttribute('coords');
            if (!coordsStr) return;
            const coords = coordsStr.split(',').map(Number);
            const title = area.getAttribute('title') || area.getAttribute('alt') || '';

            const div = document.createElement('div');
            div.className = 'hotspot';
            div.title = title;

            // 実装済み = 青 / 未実装 = 赤
            const isImplemented = container.id === 'model-adda'
                               || IMPLEMENTED_BUTTONS.has(title)
                               || menuDataHantek[title]
                               || menuDataAgilent[title];
            div.classList.add(isImplemented ? 'implemented' : 'unimplemented');

            // 位置と大きさ（rect: 左上と右下の2点 / circle: 中心と半径）
            if (area.getAttribute('shape') === 'rect') {
                const [x1, y1, x2, y2] = coords;
                div.style.left   = Math.min(x1, x2) + 'px';
                div.style.top    = Math.min(y1, y2) + 'px';
                div.style.width  = Math.abs(x2 - x1) + 'px';
                div.style.height = Math.abs(y2 - y1) + 'px';
            } else if (area.getAttribute('shape') === 'circle') {
                const [x, y, r] = coords;
                div.style.left   = (x - r) + 'px';
                div.style.top    = (y - r) + 'px';
                div.style.width  = (r * 2) + 'px';
                div.style.height = (r * 2) + 'px';
                div.style.borderRadius = '50%';
            }

            container.appendChild(div);
        });
    });
}

// -----------------------------------------------------------------------
//  クリック
// -----------------------------------------------------------------------

// 機器コンテナ上のクリックを、端子 → 結線 / ボタン → 各機器の処理 に振り分ける
function onHotspotClick(e) {
    const container = e.currentTarget;
    const hotspot = e.target;
    if (!hotspot.classList.contains('hotspot')) return;

    const title = hotspot.title;
    const side = getTerminalSide(title);

    if (side === 'osc') {
        // オシロの入力端子は、チャンネル選択ボタンも兼ねている。
        // 1本目を選択済みのとき、または Shift+クリックのときだけ結線として扱う
        if (wiringState.pendingTerminal || e.shiftKey) {
            handleTerminalClick(title, hotspot);
            return;
        }
    } else if (side) {
        handleTerminalClick(title, hotspot);
        return;
    }

    if (container.id === 'model-ps')        handlePsButton(title);
    else if (container.id === 'model-fg')   handleFgButton(title);
    else if (container.id === 'model-adda') handleAddaSwitch(title);
    else                                    handleOscButton(title, hotspot);
}

// オシロスコープのボタン操作（ツマミは onHotspotWheel で処理する）
function handleOscButton(title, hotspot) {
    // 電源
    if (title === '電源ボタン') {
        hotspot.classList.toggle('active');
        scopeState.isOn = hotspot.classList.contains('active');
        if (scopeState.isOn) {
            // 電源ON直後は RUN 状態で、CH1 のメニューを開いておく
            scopeState.isRunning = true;
            scopeState.activeChannel = 'CH1';
            scopeState.currentMenu = 'CH1_MENU';
            updateControlPanelUI();
        } else {
            scopeState.currentMenu = null;
        }
        return;
    }

    // チャンネルの選択（メニューボタン または 入力端子）。もう一度押すとメニューを閉じる
    const channelButtons = {
        CH1_MENU: 'CH1', Ch1: 'CH1',
        CH2_MENU: 'CH2', Ch2: 'CH2',
        CH3_MENU: 'CH3', Ch3: 'CH3',
    };
    const ch = channelButtons[title];
    if (ch) {
        if (!scopeState.isOn) return;
        if (scopeState.currentMenu === ch + '_MENU') {
            scopeState.currentMenu = null;
        } else {
            scopeState.activeChannel = ch;
            scopeState.currentMenu = ch + '_MENU';
        }
        updateControlPanelUI();
        return;
    }

    // RUN / STOP
    if (title === 'RunStop') {
        scopeState.isRunning = !scopeState.isRunning;
        return;
    }

    // 以下は電源ONのときだけ反応する
    if (!scopeState.isOn) return;

    if (title === 'AutoSet') {
        // 見やすい設定に戻す（1V/div・0.1s/div）
        scopeState.voltIndexCH1 = 6;
        scopeState.voltIndexCH2 = 6;
        scopeState.timeIndex = 15;
        scopeState.timeOffset = 0;
        scopeState.currentMenu = null;

    } else if (title === 'Meas' || title === 'Measure') {
        // 自動計測の表示ON/OFF（メニューも一緒に開閉する）
        scopeState.showMeasure = !scopeState.showMeasure;
        scopeState.currentMenu = scopeState.showMeasure ? 'Measure' : null;

    } else if (title === 'Cursr') {
        // 押すたびに操作するカーソルが変わる: 非表示 → A → B（時間）→ Y1 → Y2（電圧）→ 非表示
        const cursor = scopeState.cursor;
        const order = ['A', 'B', 'Y1', 'Y2'];
        const next = cursor.show ? order[order.indexOf(cursor.target) + 1] : order[0];
        cursor.show = (next !== undefined);
        if (cursor.show) cursor.target = next;
        drawWaveform();

    } else if (MENU_DATA[currentModelId][title]) {
        // メニューを持つボタン（Acquire など）: 開く / 同じメニューなら閉じる
        scopeState.currentMenu = (scopeState.currentMenu === title) ? null : title;
    }
}

// オシロの画面をクリック: カーソル表示中なら、操作中のカーソルをクリックした位置へ移動する
function onScreenClick(e) {
    const cursor = scopeState.cursor;
    if (!scopeState.isOn || !cursor.show) return;

    // クリック位置を、ズームに関係なく canvas 上の座標 [px] に直す
    const screen = e.currentTarget;
    const rect = screen.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (screen.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (screen.height / rect.height));

    if (cursor.target === 'A')       cursor.posA = x;
    else if (cursor.target === 'B')  cursor.posB = x;
    else if (cursor.target === 'Y1') cursor.offsetY1 = Math.round(screen.height / 2 - y);
    else if (cursor.target === 'Y2') cursor.offsetY2 = Math.round(screen.height / 2 - y);
    drawWaveform();
}

// -----------------------------------------------------------------------
//  マウスホイール（ツマミ）
// -----------------------------------------------------------------------

// レンジの添字を1段階動かす（配列の端で止まる）
function stepIndex(index, deltaY, length) {
    if (deltaY > 0) return Math.min(index + 1, length - 1);
    return Math.max(index - 1, 0);
}

function onHotspotWheel(e) {
    if (!e.target.classList.contains('hotspot')) return;
    const title = e.target.title;
    const turnedUp = e.deltaY < 0;   // ホイールを奥へ回した

    // --- オシロ: 電圧軸ツマミ（ホイールを手前に回すとレンジが広がる）---
    if (['KNOB_VOLT', 'Volt1', 'Volt2', 'Volt3', 'Volt4'].includes(title)) {
        e.preventDefault();
        // Volt1〜3 は各チャンネル専用。それ以外（Hantek の共通ツマミ・Volt4）は選択中のチャンネルを操作する
        const ch = { Volt1: 'CH1', Volt2: 'CH2', Volt3: 'CH3' }[title] || scopeState.activeChannel;
        const key = 'voltIndex' + ch;
        scopeState[key] = stepIndex(scopeState[key], e.deltaY, VOLT_STEPS.length);

    // --- オシロ: 時間軸ツマミ ---
    } else if (title === 'KNOB_TIME') {
        e.preventDefault();
        scopeState.timeIndex = stepIndex(scopeState.timeIndex, e.deltaY, TIME_STEPS.length);

    // --- オシロ: トリガレベルツマミ（CH1のレンジの半分ずつ動く）---
    } else if (title === 'Level') {
        e.preventDefault();
        const step = VOLT_STEPS[scopeState.voltIndexCH1] * 0.5;
        scopeState.trigger.level += turnedUp ? step : -step;

    // --- オシロ: 位置ツマミ（波形を上下に動かす）---
    } else if (title === 'Pos1' || title === 'Pos2' || title === 'Pos3') {
        e.preventDefault();
        if (!scopeState.isOn) return;
        const key = 'positionCH' + title.slice(-1);
        scopeState[key] += turnedUp ? 5 : -5;

    // --- オシロ: カーソルツマミ（選択中のカーソルを動かす）---
    //   時間カーソル A・B  : 手前に回すと右へ（5px ずつ）
    //   電圧カーソル Y1・Y2: 奥へ回すと上へ（細かく読めるよう 1px ずつ）
    } else if (title === 'Cursrツマミ') {
        e.preventDefault();
        const cursor = scopeState.cursor;
        if (!cursor.show) return;
        if (cursor.target === 'A')       cursor.posA += (e.deltaY > 0) ? 5 : -5;
        else if (cursor.target === 'B')  cursor.posB += (e.deltaY > 0) ? 5 : -5;
        else if (cursor.target === 'Y1') cursor.offsetY1 += turnedUp ? 1 : -1;
        else if (cursor.target === 'Y2') cursor.offsetY2 += turnedUp ? 1 : -1;
        drawWaveform();

    // --- 直流電源: 電圧ツマミ（0〜30V。刻みは粗調整 0.1V / FINE 0.01V）---
    } else if (title === 'volt') {
        e.preventDefault();
        if (!psState.isOn) return;
        stepPsVoltage(turnedUp ? +1 : -1);

    // --- 直流電源: 電流ツマミ（0〜3A、0.01A刻み）---
    } else if (title === 'curr') {
        e.preventDefault();
        if (!psState.isOn) return;
        const channel = psState[psState.activeChannel.toLowerCase()];
        channel.current = turnedUp ? Math.min(3.00, channel.current + 0.01) : Math.max(0.00, channel.current - 0.01);
        updatePSDisplay();
    }
}

// -----------------------------------------------------------------------
//  ツールチップ（ボタンの説明）
// -----------------------------------------------------------------------

function onHotspotMouseOver(e) {
    if (e.target.classList.contains('hotspot') && descriptions[e.target.title]) {
        tooltip.innerText = descriptions[e.target.title];
        tooltip.style.display = 'block';
    }
}

function onHotspotMouseMove(e) {
    if (tooltip.style.display === 'block') {
        tooltip.style.left = (e.pageX + 15) + 'px';
        tooltip.style.top  = (e.pageY + 15) + 'px';
    }
}

function onHotspotMouseOut() {
    tooltip.style.display = 'none';
}


// =======================================================================
//  13. 実技テストモード
// =======================================================================

const testState = {
    active: false,
    currentQuestionIndex: 0,
};

// 問題の定義
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

            scopeState.signals['CH1'].type = 'sine';
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

function startTestMode() {
    testState.active = true;
    testState.currentQuestionIndex = 0;

    document.getElementById('test-panel').style.display = 'block';
    showQuestion();
    document.getElementById('test-panel').scrollIntoView({ behavior: 'smooth' });
}

// 現在の問題を表示し、その問題の初期状態（setup）にオシロを設定する
function showQuestion() {
    const q = quizData[testState.currentQuestionIndex];

    document.getElementById('question-text').innerHTML = q.text;
    document.getElementById('question-counter').innerText =
        `Q ${testState.currentQuestionIndex + 1} / ${quizData.length}`;

    const fb = document.getElementById('test-feedback');
    fb.innerHTML = '';
    fb.className = '';

    document.getElementById('btn-check-answer').style.display = 'inline-block';
    document.getElementById('btn-next-question').style.display = 'none';

    if (q.setup) {
        q.setup();
        updateControlPanelUI();
    }
}

// 「解答する」: 現在の問題の正解条件（check）を判定する
function checkTestAnswer() {
    const q = quizData[testState.currentQuestionIndex];
    const fb = document.getElementById('test-feedback');

    if (!q.check()) {
        fb.innerHTML = '不正解です。<br>' + q.hint;
        fb.className = 'feedback-wrong';
        return;
    }

    fb.innerHTML = '正解です！素晴らしい！';
    fb.className = 'feedback-correct';
    document.getElementById('btn-check-answer').style.display = 'none';

    // 最後の問題でなければ「次の問題へ」を出す
    if (testState.currentQuestionIndex < quizData.length - 1) {
        document.getElementById('btn-next-question').style.display = 'inline-block';
    } else {
        fb.innerHTML += '<br>すべてのテストが終了しました！';
    }
}

function nextQuestion() {
    testState.currentQuestionIndex++;
    showQuestion();
}

// 「中断して閉じる」
function quitTestMode() {
    testState.active = false;
    document.getElementById('test-panel').style.display = 'none';
    document.getElementById('test-feedback').innerHTML = '';
    document.getElementById('test-feedback').className = '';
}


// =======================================================================
//  14. 起動処理
// =======================================================================

// 機器画像の上にボタンを生成する
buildHotspots();

// 機器ごとの操作イベント
document.querySelectorAll('.instrument-container').forEach(container => {
    container.addEventListener('click', onHotspotClick);
    container.addEventListener('wheel', onHotspotWheel, { passive: false });
    container.addEventListener('mouseover', onHotspotMouseOver);
    container.addEventListener('mousemove', onHotspotMouseMove);
    container.addEventListener('mouseout', onHotspotMouseOut);
});

// オシロの画面クリック（カーソルの移動）
document.querySelectorAll('.screen-area canvas').forEach(screen => {
    screen.addEventListener('click', onScreenClick);
});

// AD/DA変換機のサンプリング周期切換（クリックで次へ、ホイールで前後に切り替え）
const samplingHotspot = document.getElementById('adda-sampling-hotspot');
samplingHotspot.addEventListener('click', e => {
    e.stopPropagation();
    cycleAdDaSampling();
});
samplingHotspot.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation();
    cycleAdDaSampling(e.deltaY < 0 ? -1 : 1);
});

// 結線の切断（端子を右クリック）
document.addEventListener('contextmenu', onContextMenu);

// 機器のドラッグ移動
document.addEventListener('mousedown', onDragStart);
document.addEventListener('mousemove', onDragMove);
document.addEventListener('mouseup', onDragEnd);

// 実験手順のモーダルは、外側（暗い部分）をクリックしても閉じる
document.addEventListener('click', e => {
    if (e.target.id === 'experiment-modal') closeExperimentModal();
});

// 画像の読み込み完了時とウィンドウのリサイズ時に、表示倍率とワイヤーを合わせ直す
window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);
window.addEventListener('resize', redrawWires);

// 状態表示バーを初期状態に合わせる
renderPsDisplay();
updateAdDaStatus();

// 描画ループ開始
animationLoop();