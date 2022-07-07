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
    Aqua_Log(info.frameCount);
}
const onFinished = (info) => {
    let byteStream = info.byteStream;
    let buffer = new Uint8Array(byteStream);
    fs.writeFileSync("E:/Desktop/test.mp3", buffer, {"flag": "w"});
}

// Aqua_Main(pcm_l, pcm_r, 2, 48000, 320000, onRunning, onFinished);

// 为了支援MP3字节流通过stdout输出，需要将console.log封装起来，按需屏蔽
function Aqua_Log(msg) {
    console.log(msg);
}


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

const GR_HOST = "192.168.10.227";
const AQUA_HOST = "192.168.10.20";

let client = null;

let isGrStarted = false;

// 建立TCP连接
function ClientInit(host, port) {
    client = net.connect(port, host, () => {
        Aqua_Log(`[Aqua-Client] Client connected`);
    });
    client.on("data", (data) => {
        Aqua_Log(`[Aqua-Client] Response from GR: ${data}`);
    });
    client.on("end", () => {
        Aqua_Log(`[Aqua-Client] Client end`);
    });
    client.on("error", (err) => {
        console.error(err);
    });
    client.on("close", () => {
        Aqua_Log("[Aqua-Client] Client closed");
        process.exit(0);
    });
}

let byteFIFO = [];

// 编码器初始化
Aqua_Init(2, 48000, 128000);
let byteStream = new Array(); // 字节流
let frameCount = 0;           // 帧计数

let prev_pcm_l = []; // 上一帧PCM（重叠）
let prev_pcm_r = []; // 上一帧PCM（重叠）

// 接收输入的PCM流
const server = net.createServer((socket) => {
    // socket.setEncoding("binary");
    socket.on("data", (buf) => {
        if(isGrStarted === false) {
            ClientInit(GR_HOST, MP3_PORT);
            isGrStarted = true;
        }
        Aqua_Log(`[Aqua-Server] Received PCM data from GR. Buffer=${buf.length}  byteFIFO=${byteFIFO.length}`);

        // 取出字节流，进入队列
        // let bytes = [...buf];
        for(const b of buf) {
            byteFIFO.push(b);
        }

        // 检查队列状态
        if(byteFIFO.length > 2304) { // 每个采样用一个Uint16（2Bytes）代替，每帧1152个采样，即2304个Bytes
            do {
                // 取出1帧（1152个采样，即2304个byte）进行编码
                let pcmFrameBytes = [];
                for(let i = 0; i < 2304; i++) {
                    pcmFrameBytes.push(byteFIFO.shift());
                }
                // 转换为1152个float
                let pcm_l = Uint16_to_Floats(pcmFrameBytes);
                let pcm_r = Uint16_to_Floats(pcmFrameBytes);
                // 将当前帧与上一帧拼接起来，连续两帧PCM输入编码器，而编码器的offset设置为1152，即第二帧的开头
                // NOTE 之所以这样做，是因为分析子带滤波器的滑动窗口会滑到当前帧的前面去，所以一定要把前一帧也带上。
                let overlapped_pcm_l = prev_pcm_l.concat(pcm_l);
                let overlapped_pcm_r = prev_pcm_r.concat(pcm_r);
                // 编码一帧（offset设为第二帧开头，理由在上面）
                let mp3Frame = Aqua_EncodeFrame([overlapped_pcm_l, overlapped_pcm_r], 1152);
                // 追加到字节流
                let mp3FrameBytes = mp3Frame.stream;
                for(let i = 0; i < mp3FrameBytes.length; i++) {
                    byteStream.push(mp3FrameBytes[i]);
                }
                // 通过MP3_PORT返回数据
                client.write(Uint8Array.from(mp3FrameBytes));
                // process.stdout.write(Uint8Array.from(mp3FrameBytes));
                // 保存当前帧，以便与下一帧拼接起来
                prev_pcm_l = pcm_l;
                prev_pcm_r = pcm_r;

                frameCount++;
                Aqua_Log(`[Aqua-Server] ${frameCount} frames encoded`);
            }
            while(byteFIFO.length > 2304);
        }
        else {
            Aqua_Log(`[Aqua-Server] waiting for FIFO fulfilled (${byteFIFO.length})`);
        }

        // 输出到文件以供调试
        // const mp3_filepath = `E:/Desktop/test.mp3`;
        // if(frameCount > 1000) {
        //     fs.writeFileSync(mp3_filepath, new Uint8Array(byteStream), {"flag": "w"});
        //     Aqua_Log(`[Aqua-Server] MP3 written to file "${mp3_filepath}"`);
        //     process.exit(0);
        // }

    });
    socket.on("end", () => {
        Aqua_Log("[Aqua-Server] Server end");
    });
    socket.on("error", (err) => {
        console.error(err);
    });
});

server.on("error", (err) => {
    console.error(err);
});

server.listen(PCM_PORT, AQUA_HOST, () => {
    Aqua_Log(`[Aqua-Server] Start listening ${AQUA_HOST}:${PCM_PORT}`);
});



