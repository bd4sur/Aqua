const fs = require("fs");

let pcm_l = [];
let pcm_r = [];

// 正弦单音信号
// NOTE TODO 2022-07-05 通过这个用例发现一个问题：quantanf应减去一个偏移值，dist10是70。减去偏移值，可以防止初始量化步长太大，使得小幅噪声样信号（频谱平坦度较大）出现较大的可闻量化失真。
//      但是减去偏移值会使得量化步长过于小，对于单音信号这样的频谱平坦度本就极小的信号来说，会导致编码结果发生极大失真（不是噪声），这是无法容忍的。
//      初步测试发现，将quantanf设为固定值-100，效果似乎不错。quantanf是个关键参数，有必要继续研究。

for(let i = 0; i < 1152 * 100; i++) {
    pcm_l[i] = Math.sin(i / 10);
    pcm_r[i] = Math.sin(i / 10);
}

const onRunning = (info) => {
    console.log(info.frameCount);
}
const onFinished = (info) => {
    let byteStream = info.byteStream;
    let buffer = new Uint8Array(byteStream);
    fs.writeFileSync("E:/Desktop/test.mp3", buffer, {"flag": "w"});
}

Aqua_Main(pcm_l, pcm_r, 2, 48000, 320000, onRunning, onFinished);
