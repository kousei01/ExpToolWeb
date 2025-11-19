// =======================================================================
//  1. 初期設定：HTML要素の取得と描画コンテキストの準備
// =======================================================================

// 操作対象となるHTML要素をIDを使って取得します。
//const powerButton = document.querySelector('#power-button');

const canvas = document.querySelector('#oscilloscope-screen');

// canvas要素が見つからない場合は、エラーをコンソールに表示して処理を中断します。
if (!canvas) {
    console.error('エラー: #oscilloscope-screen というIDを持つcanvas要素が見つかりませんでした。');
}

// 2D描画を行うための「コンテキスト」を取得します。これが描画用のツールセットになります。
const ctx = canvas.getContext('2d');


// =======================================================================
//  2. 状態管理：オシロスコープの現在の設定値を保持するオブジェクト
// =======================================================================

const scopeState = {
    isOn: false,      // 電源がON(true)かOFF(false)か
    voltage: 5.0,     // 電圧スケール (V/div)。波形の振幅に影響します。
    timeScale: 0.1,   // 時間スケール (ms/div)。波形の周波数に影響します。
    timeOffset: 0     // 波形を時間軸方向にスクロールさせるための値。
};


// =======================================================================
//  3. 描画関数：実際にCanvasに描画を行う部分
// =======================================================================

/**
 * 背景にグリッド線を描画する関数
 */
function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)'; // グリッド線の色（半透明の緑）
    ctx.lineWidth = 1; // グリッド線の太さ

    const gridSpacing = 50; // グリッド線の間隔 (ピクセル)

    // 垂直線を描画
    for (let x = 0; x < canvas.width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // 水平線を描画
    for (let y = 0; y < canvas.height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

/**
 * 現在のscopeStateに基づいて波形（サイン波）を描画する関数
 */
function drawWaveform() {
    // 1. 画面をクリア
    // 前回のフレームで描画した内容をすべて消去します。
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. 背景グリッドを描画
    drawGrid();

    // 3. 電源がOFFの場合は、ここで描画処理を終了します。
    if (!scopeState.isOn) {
        return;
    }

    // 4. 波形を描画する準備
    ctx.beginPath(); // これから新しい線を描き始めるという合図
    ctx.strokeStyle = 'lime'; // 波形の色（明るい緑）
    ctx.lineWidth = 2; // 波形の線の太さ

    const centerY = canvas.height / 2; // 画面の縦方向の中心Y座標
    const amplitude = (canvas.height / 2) * (scopeState.voltage / 5.0); // 振幅を計算

    // 5. 波形の座標を計算して線を結んでいく
    // canvasの左端(x=0)から右端まで、1ピクセルずつ点を計算します。
    for (let x = 0; x < canvas.width; x++) {
        // 現在のxピクセル位置を「時間」に変換します。timeScaleが影響します。
        const time = (x / canvas.width) * (scopeState.timeScale * 10);

        // サイン波のY座標を計算します。
        // Math.sin()を使って周期的な値を生成し、振幅(amplitude)を掛け合わせます。
        // timeOffsetを加えることで、時間経過と共に波が動きます。
        const y = centerY - Math.sin((time + scopeState.timeOffset) * 20) * amplitude;

        // 最初の点の場合はペンを移動させ、それ以降は線を引いていきます。
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    // 6. 描画の確定
    // ここまでlineToで繋いできた線情報を、実際に画面に描画します。
    ctx.stroke();
}


// =======================================================================
//  4. アニメーション：描画を繰り返し行うためのループ
// =======================================================================

/**
 * アニメーションのメインループ関数
 * この関数が約1/60秒ごとに繰り返し実行されることで、アニメーションが実現されます。
 */
function animationLoop() {
    // 電源がONの場合のみ、波形を動かすためにtimeOffsetの値を少しずつ増やす
    if (scopeState.isOn) {
        scopeState.timeOffset -= 0.003;
    }

    // 現在の状態に基づいて描画を行う
    drawWaveform();

    // ブラウザの次の描画タイミングで、このanimationLoop関数自身を再度呼び出すように予約します。
    // これにより、滑らかなアニメーションが実現されます。
    requestAnimationFrame(animationLoop);
}


// =======================================================================
//  5. イベントリスナー：ユーザーの操作を検知する部分
// =======================================================================

// 電源ボタンがクリックされたときに実行される処理
// 親要素（コンテナ）にイベントを設定します
const container = document.querySelector('.instrument-container');

container.addEventListener('click', function(e) {
    // クリックされた要素(e.target)のIDが 'power-button' かどうかを確認
    if (e.target.id === 'power-button') {
        console.log('電源ボタンがクリックされました！');

        // ここから下は以前の処理と同じです
        const powerButton = e.target; // targetが電源ボタンそのものです
        powerButton.classList.toggle('active');
        scopeState.isOn = powerButton.classList.contains('active');
        
        // もしクリック時に処理を追加したい場合はここに書く
        // animationLoopは常に回っているので、stateを変えるだけでOK
    }
});

// 他のボタン（例：電圧スケール変更ボタン）も、ここに追加していきます。
// const voltageUpButton = document.querySelector('#voltage-up-button');
// voltageUpButton.addEventListener('click', function() {
//     scopeState.voltage += 0.5;
// });


// =======================================================================
//  6. アプリケーションの開始
// =======================================================================

// ページが読み込まれたら、アニメーションループを開始します。
animationLoop();

// ==================================================
// 【デバッグ版】マップ変換機能
// ==================================================
(function convertMapToHotspots() {

    // 1. 要素の取得チェック
    const map = document.querySelector('map[name="image-map"]');
    const container = document.querySelector('.instrument-container');

    // 2. エリアごとの処理
    const areas = map.querySelectorAll('area');

    areas.forEach((area, index) => {
        try {
            const shape = area.getAttribute('shape');
            const coordsStr = area.getAttribute('coords');
            
            if (!coordsStr) {
                console.warn(`警告: ${index}番目のエリアにcoords属性がありません。スキップします。`);
                return;
            }

            const coords = coordsStr.split(',').map(n => parseFloat(n)); // NumberではなくparseFloatでより確実に
            
            // title属性がなければalt属性、それもなければ自動名を使う
            const title = area.getAttribute('title') || area.getAttribute('alt') || `button-${index}`;

            const div = document.createElement('div');
            div.className = 'hotspot';
            div.title = title;
            
            // ID生成（スペースを除去）
            const safeTitle = title.replace(/\s+/g, '-');
            div.id = 'btn-' + safeTitle;

            // スタイル設定
            div.style.position = 'absolute';
            div.style.zIndex = '100'; // 念のため大きめに
            div.style.cursor = 'pointer';
            div.style.backgroundColor = 'rgba(255, 0, 0, 0.5)'; // 赤く表示して確認

            // 座標計算
            if (shape === 'rect' && coords.length >= 4) {
                const [x1, y1, x2, y2] = coords;
                
                // ★修正ポイント：Math.minとMath.absを使って、どっち向きにドラッグしても正しく計算する
                div.style.left = Math.min(x1, x2) + 'px';
                div.style.top = Math.min(y1, y2) + 'px';
                div.style.width = Math.abs(x2 - x1) + 'px';
                div.style.height = Math.abs(y2 - y1) + 'px';

            } else if (shape === 'circle' && coords.length >= 3) {
                const [x, y, r] = coords;
                div.style.left = (x - r) + 'px';
                div.style.top = (y - r) + 'px';
                div.style.width = (r * 2) + 'px';
                div.style.height = (r * 2) + 'px';
                div.style.borderRadius = '50%';           
            } else {
                console.warn(`警告: 形状(${shape})または座標データ(${coords})が不正です。`);
                return;
            }

            // コンテナに追加
            container.appendChild(div);
            console.log(`生成成功: ${div.id} (Top:${div.style.top}, Left:${div.style.left})`);

            // 電源ボタンの連携用ID書き換え
            if (title.includes('電源') || title.includes('Power')) {
                div.id = 'power-button';
                console.log("→ IDを 'power-button' に上書きしました。");
            }

        } catch (e) {
            console.error("処理中にエラーが発生しました:", e);
        }
    });

    console.log("--- 変換処理完了 ---");
})();