// =======================================================================
//  script.js (メニュー・ズーム・ツマミ操作 完全統合版)
// =======================================================================

// --- 1. グローバル変数と初期設定 ---

let currentModelId = 'hantek';
let canvas = document.querySelector('#canvas-hantek');
let ctx = canvas.getContext('2d');
let tooltip = document.querySelector('#tooltip-hantek');

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
    currentMenu: null // 表示中のメニュー
};

// メニューの内容データ
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
    "Ch2": "CH2入力端子。"
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
    document.getElementById('btn-model-hantek').classList.remove('active');
    document.getElementById('btn-model-agilent').classList.remove('active');
    document.getElementById('btn-model-' + modelName).classList.add('active');
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

function drawMenu() {
    if (!scopeState.currentMenu || !scopeState.isOn) return;
    const key = scopeState.currentMenu;
    const data = menuData[key];
    if (!data) return;

    const menuWidth = 140;
    const menuX = canvas.width - menuWidth; 

    ctx.fillStyle = "rgba(0, 0, 50, 0.85)";
    ctx.fillRect(menuX, 0, menuWidth, canvas.height);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;
    ctx.strokeRect(menuX, 0, menuWidth, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(data.title, menuX + (menuWidth / 2), 30);
    
    ctx.beginPath(); ctx.moveTo(menuX, 40); ctx.lineTo(canvas.width, 40); ctx.stroke();

    ctx.font = "13px sans-serif";
    const stepY = (canvas.height - 50) / 5;
    data.items.forEach((item, index) => {
        const boxY = 50 + (index * stepY);
        ctx.fillStyle = "#444";
        ctx.fillRect(menuX + 5, boxY, menuWidth - 10, 40);
        ctx.fillStyle = "#fff";
        ctx.fillText(item, menuX + (menuWidth / 2), boxY + 25);
    });
}

function drawWaveform() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!scopeState.isOn) {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    drawGrid();

    let currentVoltIndex;
    if (scopeState.activeChannel === 'CH1') {
        currentVoltIndex = scopeState.voltIndexCH1;
    } else {
        currentVoltIndex = scopeState.voltIndexCH2;
    }

    const currentVoltDiv = VOLT_STEPS[currentVoltIndex]; // ここで決定
    const currentTimeDiv = TIME_STEPS[scopeState.timeIndex];

    // 波形計算
    ctx.beginPath();
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;

    const centerY = canvas.height / 2;
    const pixelsPerGrid = 50; // 1グリッドあたりのピクセル数と仮定

    // 振幅計算: 3Vppの信号を入力したと仮定
    const signalAmplitudeV = 3.0; 
    const amplitudePx = (signalAmplitudeV / currentVoltDiv) * pixelsPerGrid;
    const frequency = 50; // 50Hzの信号と仮定

    for (let x = 0; x < canvas.width; x++) {
        const gridX = x / pixelsPerGrid;
        const time = gridX * currentTimeDiv; // 横軸の時間

        const y = centerY - Math.sin(2 * Math.PI * frequency * (time + scopeState.timeOffset)) * amplitudePx;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 数値情報（インジケーター）の描画
    ctx.fillStyle = "white";
    ctx.font = "bold 16px sans-serif";
    
    // 左下: 電圧
    ctx.textAlign = "left";
    let vText = currentVoltDiv >= 1 ? `${currentVoltDiv.toFixed(2)}V` : `${(currentVoltDiv*1000).toFixed(0)}mV`;
    
    // 文字色を変えると分かりやすい (CH1:黄色, CH2:水色)
    if (scopeState.activeChannel === 'CH1') {
        ctx.fillStyle = "yellow";
        ctx.fillText(`CH1 ${vText}`, 20, canvas.height - 20);
    } else {
        ctx.fillStyle = "cyan";
        ctx.fillText(`CH2 ${vText}`, 20, canvas.height - 20);
    }
    // 中央下: 時間
    ctx.textAlign = "center";
    let tText = currentTimeDiv >= 1 ? `${currentTimeDiv.toFixed(2)}s` : 
                currentTimeDiv >= 0.001 ? `${(currentTimeDiv*1000).toFixed(2)}ms` : `${(currentTimeDiv*1000000).toFixed(0)}us`;
    ctx.fillText(`M ${tText}`, canvas.width / 2, canvas.height - 20);

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
    container.addEventListener('click', function(e) {
        if (container.style.display === 'none') return;
        
        let target = e.target;
        if (!target.classList.contains('hotspot')) return;
        const title = target.title;

        if (title === '電源ボタン') {
            target.classList.toggle('active');
            scopeState.isOn = target.classList.contains('active');
            if (scopeState.isOn) {
                scopeState.isRunning = true;
                scopeState.currentMenu = 'CH1_MENU'; // 電源ONでメニュー表示
            } else {
                scopeState.currentMenu = null;
            }
        }
        else if (menuData[title] && scopeState.isOn) {
            scopeState.currentMenu = (scopeState.currentMenu === title) ? null : title;
        }
        else if (title === 'RunStop') {
            scopeState.isRunning = !scopeState.isRunning;
        }
        else if (title === 'CH1_MENU' || title === 'Ch1') { // Ch1端子クリックでも可とする場合
            scopeState.activeChannel = 'CH1';
            scopeState.currentMenu = 'CH1_MENU'; // ついでにメニューも開く
            console.log("操作対象: CH1");
        }
        else if (title === 'CH2_MENU' || title === 'Ch2') {
            scopeState.activeChannel = 'CH2';
            scopeState.currentMenu = 'CH2_MENU';
            console.log("操作対象: CH2");
        }


    });

    // --- マウスホイールイベント (ツマミ用) ---
    // ここがループの内側にあることが重要です！
    container.addEventListener('wheel', function(e) {
        if (!e.target.classList.contains('hotspot')) return;
        const title = e.target.title;

        // 電圧ツマミ
        if (title === 'KNOB_VOLT') {
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


// --- 6. マップ変換機能 ---
(function convertMapToHotspots() {
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

// アプリケーション開始
animationLoop();