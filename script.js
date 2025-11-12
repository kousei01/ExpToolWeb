// script.js

// --- 操作したいHTML要素を取得する ---
// 電源ボタンの要素
const powerButton = document.querySelector('#power-button');
// 波形画像の要素
const waveformImage = document.querySelector('#waveform-image');

// --- 電源ボタンがクリックされたときの処理を定義する ---
powerButton.addEventListener('click', function() {
    console.log('電源ボタンがクリックされました！'); // 動作確認用のログ

    // 波形画像のsrc属性に、表示したい画像のパスを設定する
    waveformImage.src = 'waveform.png';

    // （応用）もう一度押したら消す（トグル機能）
    if (waveformImage.src.includes('waveform.png')) {
        waveformImage.src = ''; // srcを空にして非表示に
    } else {
        waveformImage.src = 'waveform.png'; // srcに画像を設定して表示
    }
});