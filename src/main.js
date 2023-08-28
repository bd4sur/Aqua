const fs = require("fs");
const net = require('net');
const os = require('os');


const ToString = (array) => {
    return String.fromCharCode.apply(this, array);
};

const ToUnsignedInt = (array) => {
    let num = 0;
    for(let i = 0; i < array.length; i++) {
        num |= array[i] << (i<<3);
    }
    return num;
};

function WAV_Decoder() {
    this.Channels = 2;
    this.SampleRate = 44100;
    this.BitsPerSample = 16;
    this.Length = 0;
    this.Data = null;

    this.BlockAlign = this.BitsPerSample * this.Channels >> 3;
}

WAV_Decoder.prototype = {
    Init: function(BUF) {
        let RiffID = ToString(BUF.slice(0x00, 0x04));
        let FileSize = ToUnsignedInt(BUF.slice(0x04, 0x08)) + 8;
        let WaveTag = ToString(BUF.slice(0x08, 0x0c));
        let FmtID = ToString(BUF.slice(0x0c, 0x10));
        let FmtSize = ToUnsignedInt(BUF.slice(0x10, 0x14));

        let Format = ToUnsignedInt(BUF.slice(0x14, 0x16));
        let Channels = ToUnsignedInt(BUF.slice(0x16, 0x18));
        let SampleRate = ToUnsignedInt(BUF.slice(0x18, 0x1c));
        let ByteRate = ToUnsignedInt(BUF.slice(0x1c, 0x20));
        let BlockAlign = ToUnsignedInt(BUF.slice(0x20, 0x22));
        let BitsPerSample = ToUnsignedInt(BUF.slice(0x22, 0x24));

        let DataID = ToString(BUF.slice(0x24, 0x28));
        let DataSize = ToUnsignedInt(BUF.slice(0x28, 0x2c));

        if(RiffID === "RIFF") {
            this.Channels = Channels;
            this.SampleRate = SampleRate;
            this.BitsPerSample = BitsPerSample;
            this.BlockAlign = BlockAlign;
            this.Length = DataSize / BlockAlign;
            this.Data = BUF.slice(0x2c);
        }
        else {
            console.error("非 RIFF WAV 文件");
        }
    },

    GetSample: function(offset) {
        function ToSignedInt(array) {
            let unsigned = ToUnsignedInt(array);
            return (unsigned >= 0x8000) ? (unsigned - 0x10000) : unsigned;
        }
        let byteOffset = 0x2c + offset * this.BlockAlign/*(BitsPerSample / 8) * Channels*/;
        let BytesPerSample = this.BitsPerSample >> 3;
        let left  = ToSignedInt(this.Data.slice(byteOffset, byteOffset + BytesPerSample));
        let right = ToSignedInt(this.Data.slice(byteOffset + BytesPerSample, byteOffset + BytesPerSample + BytesPerSample));
        return [left, right];
    },

    GetFrame: function(offset, frameLength) {
        let frame = new Array();
        frame[0] = new Array();
        frame[1] = new Array();
        for(let i = offset; i < offset + frameLength; i++) {
            frame[0].push(this.GetSample(i)[0]);
            frame[1].push(this.GetSample(i)[1]);
        }
        return frame;
    },

    // 将原始采样分帧（不重叠不间隔，不加窗），并计算每一帧的能量，得到能量序列
    GetEnergySeries: function(frameOffset, frameNumber, frameLength) {
        function calculateEnergy(arr) {
            let spect = FFT(arr.toComplexList(), frameLength);
            let sum = 0;
            for(let i = 0; i < spect.length; i++) {
                sum += (spect[i].absSqr() <= 0) ? 0 : (Math.pow(Math.log10(spect[i].absSqr()), 2));
            }
            return sum;
        }
        let maxFrameNumber = (this.Length / frameLength) >> 0;
        if(frameOffset >= maxFrameNumber || frameOffset + frameNumber > maxFrameNumber) {
            throw `帧超出原始数据范围`;
        }
        else {
            let energySeries = new Array();
            let offset = frameOffset * frameLength;
            if(offset % this.BlockAlign !== 0) throw `err`;
            let finish = (frameOffset + frameNumber) * frameLength;
            while(offset < finish) {
                let frame = this.GetFrame(offset, frameLength)[0];
                energySeries.push(calculateEnergy(frame));
                offset += frameLength;
            }
            return energySeries;
        }
    }
};

function showProgress(percentage) {
    process.stdout.write(`\r[`);
    for(let i = 0; i < Math.floor(percentage * 0.2); i++) {
        process.stdout.write(`>`);
    }
    for(let i = Math.floor(percentage * 0.2); i < 20; i++) {
        process.stdout.write(`.`);
    }
    process.stdout.write(`] ${percentage}%`);
}

function encode(wavfile) {
    let sampleCount = 0;
    let prev_pcm_l = []; // 上一帧PCM（重叠）
    let prev_pcm_r = []; // 上一帧PCM（重叠）
    let mp3ByteStream = new Array(); // 字节流

    for(let i = 0; i < 1152; i++) {
        prev_pcm_l.push(0);
        prev_pcm_r.push(0);
    }

    do {
        // 取出1帧（1152采样）进行编码
        let pcm_l = [];
        let pcm_r = [];
        for(let i = 0; i < 1152; i++) {
            let sample = wavfile.GetSample(sampleCount + i);
            pcm_l.push(sample[0] / 32768);
            pcm_r.push(sample[1] / 32768);
        }

        // 将当前帧与上一帧拼接起来，连续两帧PCM输入编码器，而编码器的offset设置为1152，即第二帧的开头
        // NOTE 之所以这样做，是因为分析子带滤波器的滑动窗口会滑到当前帧的前面去，所以一定要把前一帧也带上。
        let overlapped_pcm_l = prev_pcm_l.concat(pcm_l);
        let overlapped_pcm_r = prev_pcm_r.concat(pcm_r);
        // 编码一帧（offset设为第二帧开头，理由在上面）
        let mp3Frame = Aqua_EncodeFrame([overlapped_pcm_l, overlapped_pcm_r], 1152);
        // 追加到字节流
        let mp3FrameBytes = mp3Frame.stream;
        for(let i = 0; i < mp3FrameBytes.length; i++) {
            mp3ByteStream.push(mp3FrameBytes[i]);
        }

        showProgress(Math.round(sampleCount / wavfile.Length * 100));

        // 保存当前帧，以便与下一帧拼接起来
        prev_pcm_l = pcm_l;
        prev_pcm_r = pcm_r;

        sampleCount += 1152;
    }
    while(sampleCount < wavfile.Length);

    return mp3ByteStream;
}

function Main() {

    // 编码器初始化
    Aqua_Init(2, 48000, 320000);

    // 遍历wav目录下的wav文件
    let files = fs.readdirSync("./wav", {withFileTypes: true});
    for(let i = 0; i < files.length; i++) {
        let filename = files[i].name;
        if(/\.wav$/gi.test(filename) === false) continue;
        let wav_path = `./wav/${filename}`;
        filename = filename.replace(/\.wav$/gi, "");

        let mp3_path = `./mp3/${filename}.mp3`;
        console.log(`Encoding "${wav_path}" to "${mp3_path}"`);

        let wavfilebuffer = fs.readFileSync(wav_path);

        let wavfile = new WAV_Decoder();
        wavfile.Init(new Uint8Array(wavfilebuffer));

        let Duration = wavfile.Length / wavfile.SampleRate;
        let DurationMin = Math.floor(Duration / 60);
        let DurationSec = Math.floor(Duration - DurationMin * 60);
        let DurationMsec = Math.round((Duration - DurationMin * 60 - DurationSec) * 1000);

        console.log(`Input:  ${wavfile.Channels} Channels / ${wavfile.SampleRate} Hz / ${wavfile.BitsPerSample} bits / ${wavfile.Channels * wavfile.BitsPerSample * wavfile.SampleRate / 1000} kbps / ${DurationMin}:${DurationSec}.${DurationMsec} / ${wavfile.Length} samples / ${Math.ceil(wavfile.Length / 1152)} frames`);
        console.log(`Output: ${320}kbps CBR / ${wavfile.SampleRate} Hz`);
        Aqua_Reset(wavfile.Channels, wavfile.SampleRate, 320000);

        let mp3ByteStream = encode(wavfile);

        fs.writeFileSync(mp3_path, new Uint8Array(mp3ByteStream), {"flag": "w"});
        console.log(`\nDone.\n`);
    }
}

Main();
