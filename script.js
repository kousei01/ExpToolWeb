// script.js

// --- 操作したいHTML要素を取得する ---
const powerButton = document.querySelector('#power-button');
//ボタン追加予定

// Canvas要素と、その描画コンテキストを取得
const canvas = document.querySelector('#oscilloscope-screen');
const ctx = canvas.getContext('2d'); // 2D描画用のツール一式を取得

// --- オシロスコープの状態を管理するオブジェクト ---
const scopeState = {
    isOn: false,      // 電源の状態
    voltage: 5.0,     // 電圧 (V/div)
    timeScale: 0.1,   // 時間軸 (ms/div)
    timeOffset: 0     // 波形を動かすための時間オフセット
};

// --- 電源ボタンがクリックされたときの処理を定義する ---
powerButton.addEventListener('click', function() {
    console.log('電源ボタンがクリックされました！');

    // まず、ボタンの見た目の状態を切り替える
    // これがON/OFF状態の「唯一の正しい情報源」となる
    powerButton.classList.toggle('active');

    // 次に、「ボタンが今、activeクラスを持っているか？」を基準に処理を分岐する
    if (powerButton.classList.contains('active')) {
        // 【状態がONの時の処理】
        // activeクラスを持っているなら、画像を表示する
        waveformImage.src = 'waveform.png'; // 画像パスを設定
        waveformImage.classList.add('visible');   // 表示クラスを追加

    } else {
        // 【状態がOFFの時の処理】
        // activeクラスを持っていないなら、画像を非表示にする
        waveformImage.classList.remove('visible'); // 表示クラスを削除
    }

    // scopeStateを元に波形を描画する関数
function drawWaveform() {
    // 1. 画面をクリアする
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. グリッド（背景の線）を描画する（任意）
    drawGrid();

    // 3. 電源がOFFなら、ここで処理を終了
    if (!scopeState.isOn) {
        return;
    }

    // 4. 波形を描画する
    ctx.beginPath(); // 新しい線を描き始める宣言
    ctx.strokeStyle = 'lime'; // 線の色
    ctx.lineWidth = 2; // 線の太さ

    const centerY = canvas.height / 2; // 画面の縦中央

    // 画面の左端から右端まで、1ピクセルずつ座標を計算して線を繋ぐ
    for (let x = 0; x < canvas.width; x++) {
        // x座標を時間に変換
        const time = x * (scopeState.timeScale / 50); // 50は調整用の係数

        // サイン波のy座標を計算
        // scopeState.voltageで振幅が、scopeState.timeOffsetで波の位置が変わる
        const amplitude = (canvas.height / 2) * (scopeState.voltage / 5); // 5Vを基準
        const y = centerY - Math.sin((time + scopeState.timeOffset) * 20) * amplitude;

        if (x === 0) {
            ctx.moveTo(x, y); // 最初の点にペンを移動
        } else {
            ctx.lineTo(x, y); // 次の点まで線を引く
        }
    }

    ctx.stroke(); // ここまで描いた線を実際に画面に表示
}

// グリッドを描画する補助関数
function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)'; // 薄い緑色
    ctx.lineWidth = 1;

    // 縦線
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    // 横線
    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// アニメーションのメインループ
function animationLoop() {
    // 波形を動かすために、時間オフセットを少しずつ増やす
    if (scopeState.isOn) {
        scopeState.timeOffset += 0.01;
    }

    // 描画関数を呼び出す
    drawWaveform();

    // 次の描画タイミングで、再びこの関数自身を呼び出す
    requestAnimationFrame(animationLoop);
}
// 最初の1回を呼び出して、アニメーションループを開始
animationLoop();

// 電源ボタンのイベントリスナー
powerButton.addEventListener('click', function() {
    powerButton.classList.toggle('active');

    // scopeStateの電源状態を切り替える
    scopeState.isOn = powerButton.classList.contains('active');
});

// 電圧変更ボタンのイベントリスナー
voltageUpButton.addEventListener('click', function() {
    scopeState.voltage += 0.5; // 電圧を上げる
});

voltageDownButton.addEventListener('click', function() {
    if (scopeState.voltage > 0.5) {
        scopeState.voltage -= 0.5; // 電圧を下げる
    }
});



});