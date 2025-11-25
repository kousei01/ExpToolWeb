// =======================================================================
//  script.js 完全版
//  機能: 波形描画、モデル切り替え、ツールチップ表示、マップ自動変換
// =======================================================================

// --- 1. グローバル変数と初期設定 ---

// 現在のアクティブなモデルID（初期値: hantek）
let currentModelId = 'hantek';

// 現在操作対象のCanvasとツールチップ（初期値: Hantekのもの）
let canvas = document.querySelector('#canvas-hantek');
let ctx = canvas.getContext('2d');
let tooltip = document.querySelector('#tooltip-hantek');

// オシロスコープの状態管理
const scopeState = {
    isOn: false,      // 電源の状態 (true: ON, false: OFF)
    isRunning: true,  // 波形の動き (true: 動く, false: 止まる[STOP])
    voltage: 5.0,     // 電圧スケール
    timeScale: 0.1,   // 時間スケール
    timeOffset: 0     // 波形を動かすためのオフセット値
};

// --- 2. ボタンの説明文データ（辞書） ---
// Image Map Generatorの「Title」と一致させてください
const descriptions = {
    "電源ボタン": "電源をオン・オフします。",
    
    // --- 画面横 ---
    "F1": "画面メニューの選択ボタン。\n項目の選択や切り替えに使います。",
    "F2": "画面メニューの選択ボタン。\n項目の選択や切り替えに使います。",
    "F3": "画面メニューの選択ボタン。\n項目の選択や切り替えに使います。",
    "F4": "画面メニューの選択ボタン。\n項目の選択や切り替えに使います。",
    "F5": "画面メニューの選択ボタン。\n項目の選択や切り替えに使います。",
    
    // --- 右上エリア ---
    "AutoSet": "表示で困ったらこれを押します。\n波形が見やすくなるよう自動設定します。",
    "RunStop": "波形の動きを止めたり再開したりします。",
    "Single": "一度だけ波形を取り込んで止めます。",
    "SaveRecall": "設定や波形データの保存・呼び出しを行います。",
    "Measure": "周波数や電圧などの数値を自動計測して表示します。",
    "Acquire": "波形の取り込み方（平均化など）を設定します。",
    "Utility": "音や言語など、システム全体の設定を行います。",
    "Cursor": "画面に線（カーソル）を出して手動計測を行います。",
    "Display": "画面の明るさや表示方法を変更します。",
    // --- VERTICAL (縦軸) --
    "CH1_MENU": "CH1の表示ON/OFFや詳細設定を行います。",
    "CH2_MENU": "CH2の表示ON/OFFや詳細設定を行います。",
    "CH3_MENU": "CH3の表示ON/OFFや詳細設定を行います。",
    "CH4_MENU": "CH4の表示ON/OFFや詳細設定を行います。",


    // --- 入力端子 ---
    "Ch1": "CH1のプローブを接続する端子です。",
    "Ch2": "CH2のプローブを接続する端子です。",
};


// =======================================================================
//  3. モデル切り替え機能
// =======================================================================
function changeModel(modelName) {
    console.log('モデル切り替え:', modelName);
    currentModelId = modelName;

    // 1. 全てのモデルコンテナを非表示にする
    const allModels = document.querySelectorAll('.instrument-container');
    allModels.forEach(el => el.style.display = 'none');

    // 2. 選択されたモデルだけ表示する
    const activeContainer = document.getElementById('model-' + modelName);
    if (activeContainer) {
        activeContainer.style.display = 'block';
        
        // 3. 描画先(Canvas)とツールチップの変数を更新する
        canvas = document.getElementById('canvas-' + modelName);
        ctx = canvas.getContext('2d');
        tooltip = document.getElementById('tooltip-' + modelName);
    } else {
        console.error('指定されたモデルIDが見つかりません: model-' + modelName);
    }
}

// script.js

// --- ズーム管理用の変数 ---
let currentZoom = 100; // 初期値 100%

// ==========================================
// ズーム変更機能
// ==========================================
// script.js の changeZoom 関数を修正

function changeZoom(amount) {
    // 1. ズーム値を計算 (そのまま)
    currentZoom += amount;
    if (currentZoom < 20) currentZoom = 20;
    if (currentZoom > 200) currentZoom = 200;

    // 2. 画面のパーセント表示を更新 (そのまま)
    document.getElementById('zoom-display').innerText = currentZoom + '%';

    // 3. 全てのモデルコンテナに対して拡大縮小を適用
    const containers = document.querySelectorAll('.instrument-container');
    containers.forEach(container => {
        container.style.transform = `scale(${currentZoom / 100})`;
    });
}


// =======================================================================
//  4. 描画・アニメーションロジック
// =======================================================================

// 背景グリッドを描画する関数
function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)'; // 薄い緑色
    ctx.lineWidth = 1;
    const gridSpacing = 50;

    // 縦線
    for (let x = 0; x < canvas.width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    // 横線
    for (let y = 0; y < canvas.height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// 波形を描画する関数
function drawWaveform() {
    // 画面をクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 背景を描画
    drawGrid();

    // 電源がOFFなら波形は描かない
    if (!scopeState.isOn) {
        return;
    }

    // 波形の設定
    ctx.beginPath();
    ctx.strokeStyle = 'lime'; // 明るい緑
    ctx.lineWidth = 2;

    const centerY = canvas.height / 2;
    const amplitude = (canvas.height / 2) * (scopeState.voltage / 5.0);

    // 左から右へ波を描く
    for (let x = 0; x < canvas.width; x++) {
        // 時間軸の計算
        const time = (x / canvas.width) * (scopeState.timeScale * 10);
        
        // サイン波の計算 (timeOffsetで波を動かす)
        const y = centerY - Math.sin((time + scopeState.timeOffset) * 20) * amplitude;

        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

// アニメーションループ
function animationLoop() {
    // 電源ON かつ RUN状態のときだけ時間を進める
    if (scopeState.isOn && scopeState.isRunning) {
        // -= にすることで波形を左から右へ流す
        scopeState.timeOffset -= 0.005; 
    }

    // 描画実行
    if (canvas && ctx) {
        drawWaveform();
    }

    // 次のフレームを予約
    requestAnimationFrame(animationLoop);
}


// =======================================================================
//  5. イベントリスナー (全てのモデルに対して設定)
// =======================================================================

// ページ内のすべてのオシロスコープコンテナを取得
const containers = document.querySelectorAll('.instrument-container');

containers.forEach(container => {
    
    // --- クリックイベント (ボタン操作) ---
    container.addEventListener('click', function(e) {
        // 表示されていないモデルでのクリックは無視
        if (container.style.display === 'none') return;

        // ホットスポットがクリックされた場合
        if (e.target.classList.contains('hotspot')) {
            const title = e.target.title;

            // [A] 電源ボタンの処理
            if (title === '電源ボタン') {
                console.log('電源操作');
                const btn = e.target;
                btn.classList.toggle('active');
                
                // 電源状態を更新
                scopeState.isOn = btn.classList.contains('active');
                
                // 電源を入れたらRUN状態にする
                if (scopeState.isOn) {
                    scopeState.isRunning = true;
                }
            }
            // [B] RUN/STOPボタンの処理
            else if (title === 'RunStop') {
                console.log('RUN/STOP操作');
                scopeState.isRunning = !scopeState.isRunning;
                // 必要に応じてボタンの見た目を変えるなら toggle('active') など
            }
        }
    });

    // --- マウスオーバー (ツールチップ表示) ---
    container.addEventListener('mouseover', function(e) {
        if (e.target.classList.contains('hotspot')) {
            const title = e.target.title;
            // 辞書に説明文があれば表示
            if (descriptions[title] && tooltip) {
                tooltip.innerText = descriptions[title];
                tooltip.style.display = 'block';
            }
        }
    });

// --- マウス移動 (ツールチップ追従) ---
    container.addEventListener('mousemove', function(e) {
        if (tooltip && tooltip.style.display === 'block') {
            
            const x = e.pageX + 15; // マウスから右に15px
            const y = e.pageY + 15; // マウスから下に15px
            
            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        }
    });
    // --- マウスアウト (ツールチップ非表示) ---
    container.addEventListener('mouseout', function(e) {
        if (e.target.classList.contains('hotspot') && tooltip) {
            tooltip.style.display = 'none';
        }
    });
});


// =======================================================================
//  6. マップ変換機能 (エリア定義を透明なボタンdivに変換)
// =======================================================================
(function convertMapToHotspots() {
    console.log("--- マップ変換処理を開始します ---");

    // ページ内のすべての <map> タグを処理
    const maps = document.querySelectorAll('map');

    maps.forEach(map => {
        const mapName = map.name; // 例: map-hantek
        
        // マップ名から対応するコンテナIDを推測 (map-hantek -> model-hantek)
        const containerId = mapName.replace('map-', 'model-');
        const targetContainer = document.getElementById(containerId);

        if (!targetContainer) {
            console.warn(`マップ ${mapName} に対応するコンテナ ${containerId} が見つかりません。`);
            return;
        }

        const areas = map.querySelectorAll('area');

        areas.forEach((area, index) => {
            try {
                const shape = area.getAttribute('shape');
                const coordsStr = area.getAttribute('coords');
                
                if (!coordsStr) return;

                const coords = coordsStr.split(',').map(n => parseFloat(n));
                
                // タイトル取得
                const title = area.getAttribute('title') || area.getAttribute('alt') || `button-${index}`;

                // div要素作成
                const div = document.createElement('div');
                div.className = 'hotspot';
                div.title = title;
                
                // ID生成 (スペースをハイフンに)
                div.id = 'btn-' + title.replace(/\s+/g, '-');
                // ※電源ボタンのID強制変換は不要（クリックイベントでtitle判定しているため）

                // スタイル設定
                div.style.position = 'absolute';
                div.style.zIndex = '100'; // Canvasより手前に
                div.style.cursor = 'pointer';
                // 開発用：赤く表示 (完成したら transparent に変更してください)
                div.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';

                // --- 形状ごとの座標計算 ---
                // 四角形 (Rect)
                if (shape === 'rect' && coords.length >= 4) {
                    const [x1, y1, x2, y2] = coords;
                    div.style.left = Math.min(x1, x2) + 'px';
                    div.style.top = Math.min(y1, y2) + 'px';
                    div.style.width = Math.abs(x2 - x1) + 'px';
                    div.style.height = Math.abs(y2 - y1) + 'px';
                }
                // 円形 (Circle)
                else if (shape === 'circle' && coords.length >= 3) {
                    const [x, y, r] = coords;
                    div.style.left = (x - r) + 'px';
                    div.style.top = (y - r) + 'px';
                    div.style.width = (r * 2) + 'px';
                    div.style.height = (r * 2) + 'px';
                    div.style.borderRadius = '50%';
                }
                // 多角形 (Poly) - 必要時のための実装
                else if (shape === 'poly' && coords.length >= 2) {
                    // 簡易的なバウンディングボックス計算
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (let i = 0; i < coords.length; i += 2) {
                        const x = coords[i];
                        const y = coords[i+1];
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                    div.style.left = minX + 'px';
                    div.style.top = minY + 'px';
                    div.style.width = (maxX - minX) + 'px';
                    div.style.height = (maxY - minY) + 'px';
                }

                // コンテナに追加
                targetContainer.appendChild(div);

            } catch (e) {
                console.error("エリア変換エラー:", e);
            }
        });
    });
    console.log("--- マップ変換処理完了 ---");
})();


// ==========================================
// UI連動型のモデル切り替え関数
// ==========================================
function switchModelUI(modelName) {
    // 1. 本来のモデル切り替え処理を実行
    changeModel(modelName);

    // 2. ボタンの見た目を更新（青く光らせる）
    // 一旦両方の active クラスを外す
    document.getElementById('btn-model-hantek').classList.remove('active');
    document.getElementById('btn-model-agilent').classList.remove('active');

    // 選ばれた方だけに active クラスを付ける
    document.getElementById('btn-model-' + modelName).classList.add('active');
}



// =======================================================================
//  7. アプリケーション開始
// =======================================================================
// アニメーションループを開始
animationLoop();