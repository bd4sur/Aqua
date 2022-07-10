const fs = require("fs");
const net = require('net');
const os = require('os');

const PCM_PORT = 9000;
const MP3_PORT = 9001;

let ips = JSON.stringify(os.networkInterfaces());
const AQUA_HOST = JSON.parse(`{${(ips.match(/\"address\"\:\"192\.168\.[0-9]+\.[0-9]+\"/gi))[0]}}`).address;
let GR_HOST = "192.168.10.227";

const streamSampleRate = 48000;
const streamBitRate = 128000;

process.argv.forEach((argItem, index) => {
    let args = argItem.split("=");
    let argname = args[0];
    let argvalue = args[1];
    if(argname.indexOf("gr-addr") >= 0) {
        GR_HOST = argvalue;
    }
});

console.log(`[Aqua Encoder] AQUA_HOST = ${AQUA_HOST}`);
console.log(`[Aqua Encoder] GR_HOST = ${GR_HOST}`);
console.log(`[Aqua Encoder] PCM Sample Rate = ${streamSampleRate}`);
console.log(`[Aqua Encoder] MP3 Bit Rate = ${streamBitRate}`);

let client = null;
let isGrStarted = false;
let byteFIFO = [];

let byteStream = new Array(); // 字节流
let frameCount = 0;           // 帧计数

let prev_pcm_l = []; // 上一帧PCM（重叠）
let prev_pcm_r = []; // 上一帧PCM（重叠）

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

// 建立TCP连接
function ClientInit(host, port) {
    client = net.connect(port, host, () => {
        Aqua_Log(`[Aqua-Client] Client connected`, true);
    });
    client.on("data", (data) => {
        Aqua_Log(`[Aqua-Client] Response from GR: ${data}`, true);
    });
    client.on("end", () => {
        Aqua_Log(`[Aqua-Client] Client end`, true);
    });
    client.on("error", (err) => {
        console.error(err);
    });
    client.on("close", () => {
        Aqua_Log("[Aqua-Client] Client closed", true);
        process.exit(0);
    });
}

// 编码器初始化
Aqua_Init(2, streamSampleRate, streamBitRate);

// 接收输入的PCM流
const server = net.createServer((socket) => {
    // socket.setEncoding("binary");
    socket.on("data", (buf) => {
        if(isGrStarted === false) {
            ClientInit(GR_HOST, MP3_PORT);
            isGrStarted = true;
        }
        Aqua_Log(`[Aqua-Server] Received PCM data from GR. Buffer=${buf.length}  byteFIFO=${byteFIFO.length}`, true);

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
                Aqua_Log(`[Aqua-Server] ${frameCount} frames encoded`, true);
            }
            while(byteFIFO.length > 2304);
        }
        else {
            Aqua_Log(`[Aqua-Server] waiting for FIFO fulfilled (${byteFIFO.length})`, true);
        }

        // 输出到文件以供调试
        // const mp3_filepath = `E:/Desktop/test.mp3`;
        // if(frameCount > 1000) {
        //     fs.writeFileSync(mp3_filepath, new Uint8Array(byteStream), {"flag": "w"});
        //     Aqua_Log(`[Aqua-Server] MP3 written to file "${mp3_filepath}"`, true);
        //     process.exit(0);
        // }

    });
    socket.on("end", () => {
        Aqua_Log("[Aqua-Server] Server end", true);
    });
    socket.on("error", (err) => {
        console.error(err);
    });
});

server.on("error", (err) => {
    console.error(err);
});

server.listen(PCM_PORT, AQUA_HOST, () => {
    Aqua_Log(`[Aqua-Server] Start listening ${AQUA_HOST}:${PCM_PORT}`, true);
});



