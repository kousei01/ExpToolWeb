const hotspot = document.querySelector('.hotspot');
const tooltip = document.querySelector('.tooltip');

// ホットスポットにマウスが乗ったときの処理
hotspot.addEventListener('mouseover', function() {
    tooltip.textContent = this.dataset.description; // 説明文を設定
    tooltip.style.display = 'block'; // ツールチップを表示
});

// マウスが動いたときにツールチップを追従させる処理
hotspot.addEventListener('mousemove', function(e) {
    tooltip.style.left = e.pageX + 10 + 'px';
    tooltip.style.top = e.pageY + 10 + 'px';
});

// ホットスポットからマウスが外れたときの処理
hotspot.addEventListener('mouseout', function() {
    tooltip.style.display = 'none'; // ツールチップを非表示
});