/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 BD4SUR @ GitHub
//
//  =============================================================
//
//  spectrogram.js
//
//    绘制声谱图。
//
/////////////////////////////////////////////////////////////////


///////////////////////////////////
//
//  常 量
//
///////////////////////////////////

const WINDOW_LENGTH = 1024;
const WINDOW_LENGTH_HALF = 512;

const SPECTROGRAM_BUFFER_LENGTH = 400;

///////////////////////////////////
//
//  全 局 变 量 及 其 初 始 化
//
///////////////////////////////////

let SPECTROGRAM_BUFFER = new Array();
let HANN_WINDOW = new Array();

let fft = new FFT(WINDOW_LENGTH);

function SpectrogramInit(canvasId) {

    // 初始化Canvas
    let cv = new Canvas(`${canvasId}`, [0, -1.2], [WINDOW_LENGTH, 1.2]); // oscillator
    cv.Resize([0, -1.2], [WINDOW_LENGTH, 1.2], WINDOW_LENGTH, 200); // oscillator

    // Hann窗

    HANN_WINDOW = new Array();
    for(let i = 0; i < WINDOW_LENGTH; i++) {
        HANN_WINDOW[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (WINDOW_LENGTH - 1)));
    }

    return cv;
}



///////////////////////////////////
//
//  工 具 函 数
//
///////////////////////////////////

// 推入队列
function PushIntoBuffer(element, buffer, bufferLength) {
    buffer.push(element);
    if(buffer.length > bufferLength) buffer.shift();
}

// 秒转为HH:MM:SS.sss格式
function SecondToHMS(secf) {
    let sec    = Math.floor(secf);
    let hour   = Math.floor(sec / 3600);
    let minute = Math.floor((sec - 3600 * hour) / 60);
    let isec   = sec - hour * 3600 - minute * 60;
    let msec   = Math.floor((secf - sec) * 1000);

    if(isec   < 10) { isec   = `0` + String(isec); }
    if(minute < 10) { minute = `0` + String(minute); }
    if(hour   < 10) { hour   = `0` + String(hour); }
    if(msec < 10) { msec = `00` + String(msec); }
    else if(msec < 100) { msec = `0` + String(msec); }
    
    return `${hour}:${minute}:${isec}.${msec}`;
}

///////////////////////////////////
//
//  信 号 处 理 相 关
//
///////////////////////////////////


// 实数数组 转 复数数组
function RealArrayToComplexArray(realArray) {
    let complexArray = new Array();
    for(let i = 0; i < realArray.length; i++) {
        complexArray.push(new Complex(realArray[i], 0));
    }
    return complexArray;
}

function CalculateSpectrum(offset, data) {
    // Hann
    let windowed = new Array();
    for(let i = 0; i < WINDOW_LENGTH; i++) {
        windowed[i] = HANN_WINDOW[i] * data[offset];
        offset++;
    }

    let windowed_i = new Array(WINDOW_LENGTH);
    windowed_i.fill(0, 0, WINDOW_LENGTH);
    let fftout = fft.fft([windowed, windowed_i]);

    let spectrum = new Array();
    for(let i = 0; i < WINDOW_LENGTH_HALF; i++) { // 仅前一半有意义
        let re = fftout[0][i];
        let im = fftout[1][i];
        spectrum[i] = 10 * Math.log10(re * re + im * im); // 取分贝数
    }

    return spectrum;
}


///////////////////////////////////
//
//  绘 图 相 关
//
///////////////////////////////////


// HSV转RGB（[0,1]）
function HSV_to_RGB(h, s, v) {
    let hi = Math.floor(h / 60);
    let f = h / 60 - hi;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch(hi) {
        case 0: return [v, t, p];
        case 1: return [q, v, p];
        case 2: return [p, v, t];
        case 3: return [p, q, v];
        case 4: return [t, p, v];
        case 5: return [v, p, q];
        default: return [0, 0, 0];
    }
}

// dB转颜色
function dB2Color(dB) {

    /*
    const MIN = -20;
    const MAX = 50;
    */

    const MIN = 0;
    const MAX = 255;

    let ratio = (dB - MIN) / (MAX - MIN);
    ratio = ratio * ratio; // 优化颜色分布
    let hue, v;
    const threshold = 0.14;
    if(ratio < threshold) {
        v = 1 - (threshold - ratio) / threshold;
        hue = (1 - threshold) * (1 - threshold) * 360;
    }
    else {
        v = 1;
        hue = (1-ratio) * (1-ratio) * 360;
    }
    let rgb = HSV_to_RGB(hue, 1, v);

    return [
        ((rgb[0] * 255) | 0),
        ((rgb[1] * 255) | 0),
        ((rgb[2] * 255) | 0)
    ];
}

// 绘制声谱图
function RenderSpectrogram(cv, spectrogramBuffer, windowLength) {
    let spectLength = spectrogramBuffer.length;
    let halfWindowLength = (windowLength >> 1);

    // 每个像素4个byte(R.G.B.Alpha)
    let frameBuffer = new Uint8ClampedArray(spectLength * halfWindowLength * 4);

    for(let t = 0; t < spectLength; t++) {
        let spect = spectrogramBuffer[t];
        // 展开循环（duff's device）
        for(let i = 0; i < halfWindowLength; ) {
            let byteIndex, color;
            // Y轴方向是反过来的，低频在下面。像素index以4为步进。
            byteIndex = (((halfWindowLength - 1 - i) * spectLength + t) << 2);
            color = dB2Color(spect[i]);
            frameBuffer[  byteIndex  ] = color[0]; frameBuffer[ byteIndex+1 ] = color[1];
            frameBuffer[ byteIndex+2 ] = color[2]; frameBuffer[ byteIndex+3 ] = 255;
            i++;
            // 以下完全一致
            byteIndex = (((halfWindowLength - 1 - i) * spectLength + t) << 2);
            color = dB2Color(spect[i]);
            frameBuffer[  byteIndex  ] = color[0]; frameBuffer[ byteIndex+1 ] = color[1];
            frameBuffer[ byteIndex+2 ] = color[2]; frameBuffer[ byteIndex+3 ] = 255;
            i++;

            byteIndex = (((halfWindowLength - 1 - i) * spectLength + t) << 2);
            color = dB2Color(spect[i]);
            frameBuffer[  byteIndex  ] = color[0]; frameBuffer[ byteIndex+1 ] = color[1];
            frameBuffer[ byteIndex+2 ] = color[2]; frameBuffer[ byteIndex+3 ] = 255;
            i++;

            byteIndex = (((halfWindowLength - 1 - i) * spectLength + t) << 2);
            color = dB2Color(spect[i]);
            frameBuffer[  byteIndex  ] = color[0]; frameBuffer[ byteIndex+1 ] = color[1];
            frameBuffer[ byteIndex+2 ] = color[2]; frameBuffer[ byteIndex+3 ] = 255;
            i++;
        }
    }

    let frame = new ImageData(frameBuffer, spectLength, halfWindowLength);
    cv.context.putImageData(frame, 0, 0);
}
