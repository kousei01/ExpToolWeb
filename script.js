// =======================================================================
//  script.js (メニュー表示・電源連動対応版)
// =======================================================================

// --- 1. グローバル変数と初期設定 ---

let currentModelId = 'hantek';
let canvas = document.querySelector('#canvas-hantek');
let ctx = canvas.getContext('2d');
let tooltip = document.querySelector('#tooltip-hantek');

// オシロスコープの状態管理
const scopeState = {
    isOn: false,      // 電源の状態
    isRunning: true,  // 波形の動き
    voltage: 5.0,     // 電圧スケール
    timeScale: 0.1,   // 時間スケール
    timeOffset: 0,    // 波形オフセット
    currentMenu: null // ★追加: 現在表示中のメニューキー
};

// --- ★追加: メニューの内容データ ---
const menuData = {
    "CH1_MENU": {
        title: "CH1 SETTING",
        items: ["Coupling: DC", "BW Limit: Off", "Probe: 1X", "Invert: Off", "Volts/Div: Coarse"]
    },
    "CH2_MENU": {
        title: "CH2 SETTING",
        items: ["Coupling: AC", "BW Limit: On", "Probe: 10X", "Invert: Off", "Volts/Div: Fine"]
    },
    "Measure": {
        title: "MEASURE",
        items: ["Source: CH1", "Type: Vpp", "Type: Freq", "Type: Period", "Clear: All"]
    },
    // 必要なら他のボタンもここに追加
    "Acquire": {
        title: "ACQUIRE",
        items: ["Mode: Sample", "Peak Detect", "Average", "Depth: Normal"]
    }
};

// --- 2. ボタンの説明文データ ---
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
    "Ch2": "CH2入力端子。"
};

// --- 3. モデル切り替え機能 ---
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

// ズーム関連
let currentZoom = 100;
function setZoom(newZoom) {
    // 範囲制限 (20% ~ 400%くらいまで拡大できるように上限を上げる)
    if (newZoom < 20) newZoom = 20;
    if (newZoom > 400) newZoom = 400; // 上限を増やしました

    currentZoom = Math.floor(newZoom);
    const scale = currentZoom / 100;

    // 画面のパーセント表示を更新
    const zoomDisplay = document.getElementById('zoom-display');
    if (zoomDisplay) {
        zoomDisplay.innerText = currentZoom + '%';
    }

    // コンテナの取得
    const containers = document.querySelectorAll('.instrument-container');
    const stage = document.querySelector('.main-stage');

    containers.forEach(container => {
        // 1. 変形を適用
        container.style.transform = `scale(${scale})`;
        
        // 2. 拡大した分のスペース確保（スクロールバーを出すため）
        // transform: scale は元の領域サイズしか確保しないため、
        // 拡大した分のはみ出し量を margin で押し広げる
        
        const rect = container.getBoundingClientRect(); // 現在の見た目のサイズ
        const originalHeight = container.offsetHeight;
        const originalWidth = container.offsetWidth;

        // 縦方向: 下に伸びた分だけ margin-bottom を追加
        // transform-origin: top center なので下方向への伸びは (scale - 1) * height
        if (scale > 1) {
            const verticalOverflow = originalHeight * (scale - 1);
            container.style.marginBottom = verticalOverflow + "px";
            
            // 横方向: 左右に広がった分、margin-left/right を追加して重なり防止
            const horizontalOverflow = (originalWidth * (scale - 1)) / 2;
            container.style.marginLeft = horizontalOverflow + "px";
            container.style.marginRight = horizontalOverflow + "px";
        } else {
            container.style.marginBottom = "0px";
            container.style.marginLeft = "0px";
            container.style.marginRight = "0px";
        }
    });

    // 3. 左端見切れ対策
    // 拡大して画面幅より大きくなった場合、中央揃え(center)だと左端が見切れてスクロールできない。
    // そのため、画面からはみ出す場合は左寄せ(flex-start)に切り替える。
    
    // 現在表示中の画像の幅を取得
    const activeImg = document.querySelector('#model-' + currentModelId + ' img');
    if (activeImg) {
        const currentWidth = activeImg.naturalWidth * scale;
        
        if (currentWidth > window.innerWidth) {
            stage.style.justifyContent = 'flex-start';
        } else {
            stage.style.justifyContent = 'center';
        }
    }
}
function changeZoom(amount) { setZoom(currentZoom + amount); }
function autoFit() {
    const img = document.querySelector('#model-' + currentModelId + ' img');    
    if (!img || img.naturalWidth === 0) return;
    const availableWidth = window.innerWidth - 40;
    const availableHeight = window.innerHeight - 180;
    let bestScale = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);
    let bestZoom = bestScale * 100;
    if (bestZoom > 100) bestZoom = 100;
    setZoom(bestZoom);
}
window.addEventListener('load', autoFit);
window.addEventListener('resize', autoFit);

// --- 4. 描画ロジック ---

// グリッド描画
function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.lineWidth = 1;
    const gridSpacing = 50;
    for (let x = 0; x < canvas.width; x += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSpacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

// ★追加: メニュー描画関数
function drawMenu() {
    // メニューが開いていない、または電源OFFなら描画しない
    if (!scopeState.currentMenu || !scopeState.isOn) return;

    const key = scopeState.currentMenu;
    const data = menuData[key];
    if (!data) return;

    // メニューの幅と位置 (画面右端に固定)
    const menuWidth = 140;
    const menuX = canvas.width - menuWidth; 

    // 背景 (半透明の濃紺)
    ctx.fillStyle = "rgba(0, 0, 50, 0.85)";
    ctx.fillRect(menuX, 0, menuWidth, canvas.height);

    // 枠線
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;
    ctx.strokeRect(menuX, 0, menuWidth, canvas.height);

    // タイトル
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(data.title, menuX + (menuWidth / 2), 30);
    
    // 区切り線
    ctx.beginPath();
    ctx.moveTo(menuX, 40);
    ctx.lineTo(canvas.width, 40);
    ctx.stroke();

    // 各項目を描画
    ctx.font = "13px sans-serif";
    const stepY = (canvas.height - 50) / 5; // 5つのボタンに対応する間隔

    data.items.forEach((item, index) => {
        // 項目の背景ボックス（ボタンっぽく）
        const boxY = 50 + (index * stepY);
        const boxHeight = 40;
        
        ctx.fillStyle = "#444";
        ctx.fillRect(menuX + 5, boxY, menuWidth - 10, boxHeight);
        
        // 文字
        ctx.fillStyle = "#fff";
        // 2行に分かれる場合など簡易対応（ここでは1行中央表示）
        ctx.fillText(item, menuX + (menuWidth / 2), boxY + 25);
    });
}

// 波形描画（メインループから呼ばれる）
function drawWaveform() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 電源OFFなら真っ暗にして終了
    if (!scopeState.isOn) {
        // 画面を暗く塗りつぶす演出（任意）
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // 1. グリッドを描く
    drawGrid();

    // 2. 波形を描く
    ctx.beginPath();
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 2;

    const centerY = canvas.height / 2;
    const amplitude = (canvas.height / 2) * (scopeState.voltage / 5.0);

    for (let x = 0; x < canvas.width; x++) {
        const time = (x / canvas.width) * (scopeState.timeScale * 10);
        const y = centerY - Math.sin((time + scopeState.timeOffset) * 20) * amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ★追加: 最後にメニューを描画する（波形の上に重ねるため）
    drawMenu();
}

function animationLoop() {
    if (scopeState.isOn && scopeState.isRunning) {
        scopeState.timeOffset -= 0.005; 
    }
    if (canvas && ctx) {
        drawWaveform();
    }
    requestAnimationFrame(animationLoop);
}

// --- 5. イベントリスナー ---
const containers = document.querySelectorAll('.instrument-container');
containers.forEach(container => {
    
    container.addEventListener('click', function(e) {
        if (container.style.display === 'none') return;
        
        // ホットスポットの判定
        // ※map変換後のID(btn-xxx)か、元のtitle属性かどちらかで判定
        let target = e.target;
        if (!target.classList.contains('hotspot')) return;

        const title = target.title; // 例: "電源ボタン", "CH1_MENU"

        // [A] 電源ボタン
        if (title === '電源ボタン') {
            const btn = target;
            btn.classList.toggle('active'); // activeクラスの付け外し
            
            scopeState.isOn = btn.classList.contains('active');
            
            if (scopeState.isOn) {
                scopeState.isRunning = true;
            } 
        }
        // [B] メニュー切り替えボタン (menuDataに定義があるもの)
        else if (menuData[title]) {
            console.log('メニューボタン:', title);
            // 電源が入っていないとメニューは操作できない
            if (!scopeState.isOn) return;

            // 同じボタンなら閉じる、違うボタンなら切り替える
            if (scopeState.currentMenu === title) {
                scopeState.currentMenu = null;
            } else {
                scopeState.currentMenu = title;
            }
        }
        // [C] RunStop
        else if (title === 'RunStop') {
            scopeState.isRunning = !scopeState.isRunning;
        }
    });

    // ツールチップ関連
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
        if (e.target.classList.contains('hotspot')) {
            tooltip.style.display = 'none';
        }
    });
});

// --- 6. マップ変換機能 ---
(function convertMapToHotspots() {
    const maps = document.querySelectorAll('map');
    maps.forEach(map => {
        const containerId = map.name.replace('map-', 'model-');
        const targetContainer = document.getElementById(containerId);
        if (!targetContainer) return;

        const areas = map.querySelectorAll('area');
        areas.forEach((area, index) => {
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
            // 開発用：赤色 (完成時は transparent にする)
            div.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';

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
})();

function switchModelUI(modelName) {
    changeModel(modelName);
    document.getElementById('btn-model-hantek').classList.remove('active');
    document.getElementById('btn-model-agilent').classList.remove('active');
    document.getElementById('btn-model-' + modelName).classList.add('active');
}

// アプリケーション開始
animationLoop();