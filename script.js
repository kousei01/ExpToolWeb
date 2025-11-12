// script.js

// --- 操作したいHTML要素を取得する ---
const powerButton = document.querySelector('#power-button');
const waveformImage = document.querySelector('#waveform-image');

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
        
        // （任意ですが推奨）srcを空に戻しておくと、よりクリーンな状態になります
        // waveformImage.src = ''; 
    }
});