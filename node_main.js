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

// Aqua_Main(pcm_l, pcm_r, 2, 48000, 320000, onRunning, onFinished);





// Uint16（大端）序列 转换为 浮点数组
function Uint16_to_Floats(data) {
    function shortToFloat(byte_MSB, byte_LSB) { // big-endian
        return (((byte_MSB << 8) | byte_LSB) / 32768 - 1);
    }
    let samples = [];
    for(let i = 0; i < data.length; i += 2) {
        let byte_MSB = data[i];
        let byte_LSB = data[i+1];
        let fvalue = shortToFloat(byte_MSB, byte_LSB);
        samples.push(fvalue);
    }
    return samples;
}

// 浮点数组 转换为 Uint16（大端）序列（字节流）
function Floats_to_Uint16(samples) {
    function floatToShort(fvalue) { // big-endian
        let i16value = (((fvalue + 1) * 32768) | 0);
        return [((i16value >> 8) & 255), (i16value & 255)];
    }
    let bytes = [];
    for(let i = 0; i < samples.length; i++) {
        let fvalue = samples[i];
        let svalue = floatToShort(fvalue);
        bytes.push(svalue[0]); // MSB
        bytes.push(svalue[1]); // LSB
    }
    return bytes;
}








const net = require('net');

const PCM_PORT = 9000;
const MP3_PORT = 9001;

const GR_HOST = "192.168.10.150";
const AQUA_HOST = "192.168.10.20";

let client = null;

let isGrStarted = false;

// 建立TCP连接
function ClientInit(host, port) {
    client = net.connect(port, host, () => {
        console.log(`[Aqua-Client] Client connected`);
    });
    client.on("data", (data) => {
        console.log(`[Aqua-Client] Response from GR: ${data}`);
    });
    client.on("end", () => {
        console.log(`[Aqua-Client] Client end`);
    });
    client.on("error", (err) => {
        console.error(err);
    });
    client.on("close", () => {
        console.log("[Aqua-Client] Client closed");
        process.exit(0);
    });
}

let byteFIFO = [];

// 接收输入的PCM流
const server = net.createServer((socket) => {
    // socket.setEncoding("binary");
    socket.on("data", (buf) => {
        if(isGrStarted === false) {
            ClientInit(GR_HOST, MP3_PORT);
            isGrStarted = true;
        }
        console.log(`[Aqua-Server] Received PCM data from GR`);

        // 取出字节流，进入队列
        // let bytes = [...buf];
        for(const b of buf) {
            byteFIFO.push(b);
        }

        // 检查队列状态
        let byteFifoLength = byteFIFO.length;
        if((byteFifoLength > 1152 * 100) && (byteFifoLength % 2 === 0)) {
            // TODO 需要对齐uint16的边界（如何对齐？），若没有对齐，会导致PCM浮点采样完全混乱。
            // NOTE MTU的间断会导致PCM也间断，如何拼接起来，需要考虑。设计上层协议？
            let pcm = Uint16_to_Floats(byteFIFO);
            // 执行编码（左右声道相同）
            let mp3_bytestream = Aqua_Main_Sync(pcm, pcm, 2, 48000, 320000);
            console.log(`编码完成，字节长度：${mp3_bytestream.length}`);

            // 输出到文件以供调试
            let buffer = new Uint8Array(mp3_bytestream);
            fs.writeFileSync("E:/Desktop/test.mp3", buffer, {"flag": "w"});

            // 通过MP3_PORT返回数据
            client.write(Buffer.from("bytes"));
            byteFIFO = [];
        }
        else {
            console.log(`FIFO.length = ${byteFIFO.length} 未满，等待`);
        }
    });
    socket.on("end", () => {
        console.log("[Aqua-Server] Server end");
    });
    socket.on("error", (err) => {
        console.error(err);
    });
});

server.on("error", (err) => {
    console.error(err);
});

server.listen(PCM_PORT, AQUA_HOST, () => {
    console.log(`[Aqua-Server] Start listening ${AQUA_HOST}:${PCM_PORT}`);
});



