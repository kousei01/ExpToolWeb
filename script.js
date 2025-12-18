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
const TIME_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0];

// オシロスコープの状態管理
const scopeState = {
    isOn: false,      // 電源の状態
    isRunning: true,  // 波形の動き
    activeChannel: 'CH1',
    
    voltIndexCH1: 6,     // CH1の電圧 (初期値 1V)
    voltIndexCH2: 6,     // CH2の電圧 (初期値 1V)
    timeIndex: 6,     // 初期値: TIME_STEPS[6] = 0.1s (=100ms)
    
    timeOffset: 0,    // 波形アニメーション用
    currentMenu: null, // 表示中のメニュー

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
    "Ch1": "CH1入力端子。",
    "Ch2": "CH2入力端子。",
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

};


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

        // 2. 位置計算
        // 親枠より画像が小さい -> 余白を入れて中央へ
        // 親枠より画像が大きい -> 余白0で左詰め（スクロールさせるため）
        
        let marginLeft = 0;
        let marginTop = 0; // 縦方向も中央にしたい場合用

        if (scaledWidth < viewWidth) {
            marginLeft = (viewWidth - scaledWidth) / 2;
        }

        // (任意) 縦方向も中央寄せしたい場合は以下のコメントを外す
        /*
        if (scaledHeight < viewHeight) {
            marginTop = (viewHeight - scaledHeight) / 2;
        }
        */

        // 3. マージン適用
        container.style.marginLeft = `${marginLeft}px`;
        container.style.marginTop = `${marginTop}px`; // 通常は0

        // 4. スクロール領域の確保
        // transformで拡大した分を margin-bottom/right で押し広げる
        const marginBottom = (scaledHeight - originalHeight) + 50; 
        const marginRight = (scaledWidth - originalWidth);

        container.style.marginBottom = `${marginBottom}px`;
        container.style.marginRight = `${marginRight}px`;
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

        const offsetPx = (effectiveOffset / currentVoltDiv) * pixelsPerGrid;

        // X座標（画面の左端から右端まで）ループ
        // 負荷軽減のため step=2 (2pxごとに計算) にしています
        for (let x = 0; x < canvas.width; x += 2) {
            
            // 1. 画面上のX座標を「時間」に変換
            const gridX = x / pixelsPerGrid;
            const timeSpan = gridX * currentTimeDiv;

            // 2. 実際の信号時間を計算
            //   [画面の時間] + [トリガーによる固定] - [画面中央への補正]
            const signalTime = timeSpan + drawTimeOffset - centerTimeShift;
            
            // 3. その時間の電圧を取得
            const rawVolt = getSignalVoltage(ch, signalTime);
            
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
    ctx.fillText(`${marker1}CH1 ${vText1}`, 20, canvas.height - 20);

    // --- CH2 情報 ---
    const vDiv2 = VOLT_STEPS[scopeState.voltIndexCH2];
    const vText2 = vDiv2 >= 1 ? `${vDiv2.toFixed(2)}V` : `${(vDiv2*1000).toFixed(0)}mV`;
    const marker2 = (scopeState.activeChannel === 'CH2') ? "▶ " : "   ";
    ctx.fillStyle = "cyan";
    ctx.fillText(`${marker2}CH2 ${vText2}`, 200, canvas.height - 20);

    // --- 時間軸 情報 ---
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    let tText = currentTimeDiv >= 1 ? `${currentTimeDiv.toFixed(2)}s` : 
                currentTimeDiv >= 0.001 ? `${(currentTimeDiv*1000).toFixed(2)}ms` : `${(currentTimeDiv*1000000).toFixed(0)}us`;
    ctx.fillText(`M ${tText}`, canvas.width / 2, canvas.height - 20);

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
            }else{
            scopeState.activeChannel = 'CH1';    // 操作対象をCH1に
            scopeState.currentMenu = 'CH1_MENU'; // メニューを開く
            }
            
            updateControlPanelUI(); // コントロールパネルの信号ボタン表示を更新
        }
        
        // [C] チャンネル選択 & メニュー表示 (CH2)
        else if (title === 'CH2_MENU' || title === 'Ch2') {
            if (!scopeState.isOn) return;
            if( scopeState.currentMenu === 'CH2_MENU' ) {
                // すでにCH2メニューが開いている場合は閉じる
                scopeState.currentMenu = null;
                updateControlPanelUI(); // コントロールパネルの信号ボタン表示を更新
                return;
            }else{
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
            else if (title === 'RunStop') {
                scopeState.isRunning = !scopeState.isRunning;
            }
            
            // [F] AutoSetボタン (簡易リセット機能)
            else if (title === 'AutoSet' && scopeState.isOn) {
                // 適当に見やすい値にリセットする演出
                scopeState.voltIndexCH1 = 6; // 1.0V
                scopeState.voltIndexCH2 = 6; // 1.0V
                scopeState.timeIndex = 6;    // 0.1s
                scopeState.timeOffset = 0;
                scopeState.currentMenu = null;
                console.log("AutoSet executed");
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
            if (scopeState.activeChannel === 'CH1') {
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
    
    // ★ここに「機能が実装されている（クリックやホイールで動く）ボタン」の名前を登録します
    const activeFeatures = [
        // 電源・基本操作
        "電源ボタン", "RunStop", "AutoSet", 
        
        // チャンネル操作
        "CH1_MENU", "CH2_MENU", "Ch1", "Ch2",
        
        // ツマミ（ホイール操作できるもの）
        "KNOB_TIME", "KNOB_VOLT",
        "Volt1", "Volt2", "Volt3", "Volt4",
        "Level",
        
    ];

    const maps = document.querySelectorAll('map');
    maps.forEach(map => {
        const containerId = map.name.replace('map-', 'model-');
        const targetContainer = document.getElementById(containerId);
        if (!targetContainer) return;

        const areas = map.querySelectorAll('area');
        areas.forEach((area) => {
            const shape = area.getAttribute('shape');
            const coords = area.getAttribute('coords').split(',').map(Number);
            const title = area.getAttribute('title') || area.getAttribute('alt');

            const div = document.createElement('div');
            div.className = 'hotspot';
            div.title = title;
            div.id = 'btn-' + title.replace(/\s+/g, '-');
            div.style.position = 'absolute';
            div.style.zIndex = '100';
            div.style.cursor = 'pointer';

            // ★機能の実装状況を判定
            const isActive = activeFeatures.includes(title) || 
                             (typeof menuDataHantek !== 'undefined' && menuDataHantek[title]) ||
                             (typeof menuDataAgilent !== 'undefined' && menuDataAgilent[title]);

            if (isActive) {
                // 【実装済み】青色
                div.style.backgroundColor = 'rgba(0, 100, 255, 0.3)';
                div.style.border = '2px solid rgba(0, 100, 255, 0.6)';
            } else {
                // 【未実装】赤色（これで場所がわかり、ツールチップも出ます）
                div.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                div.style.border = '1px dashed rgba(255, 0, 0, 0.6)';
            }

            // 座標設定
            if (shape === 'rect') {
                const [x1, y1, x2, y2] = coords;
                div.style.left = Math.min(x1, x2) + 'px';
                div.style.top = Math.min(y1, y2) + 'px';
                div.style.width = Math.abs(x2 - x1) + 'px';
                div.style.height = Math.abs(y2 - y1) + 'px';
            } else if (shape === 'circle') {
                const [x, y, r] = coords;
                div.style.left = (x - r) + 'px';
                div.style.top = (y - r) + 'px';
                div.style.width = (r * 2) + 'px';
                div.style.height = (r * 2) + 'px';
                div.style.borderRadius = '50%';
            }
            targetContainer.appendChild(div);
        });
    });
})();// アプリケーション開始
animationLoop();

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
            scopeState.timeIndex = 6;    // 0.1s (見やすい周期)
            
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