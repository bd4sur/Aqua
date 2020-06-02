/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 Mikukonai @ GitHub
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

const BLACK  = [0, 0, 0];
const PURPLE = [128, 0, 255];
const BLUE   = [0, 0, 255];
const CYAN   = [0, 255, 255];
const GREEN  = [0, 255, 0];
const YELLOW = [255, 255, 0];
const ORANGE = [255, 200, 0];
const RED    = [255, 0, 0];
const WHITE  = [255, 255, 255];

const MIN = -30;
const MAX = 50;
let SCALE = new Array();


let SPECTROGRAM_BUFFER = new Array();
let HANN_WINDOW = new Array();
let cv;

function SpectrogramInit(canvasId) {

    // 初始化Canvas

    $(`#${canvasId}`).attr("width",  `${SPECTROGRAM_BUFFER_LENGTH}px`);
    $(`#${canvasId}`).attr("height", `${WINDOW_LENGTH_HALF}px`);
    
    cv = new Canvas(`${canvasId}`, [0, 0], [WINDOW_LENGTH_HALF, WINDOW_LENGTH_HALF]); // 此处坐标尺度的设置没有用
    cv.Init();

    // Hann窗

    HANN_WINDOW = new Array();
    for(let i = 0; i < WINDOW_LENGTH; i++) {
        HANN_WINDOW[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (WINDOW_LENGTH - 1)));
    }

    // 颜色因子

    for(let i = 0; i < 9; i++) {
        SCALE[i] = ((MAX-MIN) / 2.828) * Math.sqrt(i) + MIN;
    }
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

    let fftout = FFT(RealArrayToComplexArray(windowed), WINDOW_LENGTH);

    let spectrum = new Array();
    for(let i = 0; i < WINDOW_LENGTH_HALF; i++) { // 仅前一半有意义
        spectrum[i] = 10 * Math.log10(fftout[i].energy()); // 取分贝数
    }

    return spectrum;
}


///////////////////////////////////
//
//  绘 图 相 关
//
///////////////////////////////////

// 颜色插值
function colorInterpolation(color1, color2, ratio) {
    let r1 = color1[0]; let r2 = color2[0];
    let g1 = color1[1]; let g2 = color2[1];
    let b1 = color1[2]; let b2 = color2[2];

    let r = (ratio * r2 + r1) / (1 + ratio);
    let g = (ratio * g2 + g1) / (1 + ratio);
    let b = (ratio * b2 + b1) / (1 + ratio);

    return [r, g, b];
}

// dB转颜色
function dB2Color(dB) {
    if(dB < SCALE[0]) { return BLACK; }
    else if(dB < SCALE[1]) { return colorInterpolation(BLACK,  PURPLE,  (dB-SCALE[0]) / (SCALE[1]-SCALE[0])); }
    else if(dB < SCALE[2]) { return colorInterpolation(PURPLE, BLUE,    (dB-SCALE[1]) / (SCALE[2]-SCALE[1])); }
    else if(dB < SCALE[3]) { return colorInterpolation(BLUE,   CYAN,    (dB-SCALE[2]) / (SCALE[3]-SCALE[2])); }
    else if(dB < SCALE[4]) { return colorInterpolation(CYAN,   GREEN,   (dB-SCALE[3]) / (SCALE[4]-SCALE[3])); }
    else if(dB < SCALE[5]) { return colorInterpolation(GREEN,  YELLOW,  (dB-SCALE[4]) / (SCALE[5]-SCALE[4])); }
    else if(dB < SCALE[6]) { return colorInterpolation(YELLOW, ORANGE,  (dB-SCALE[5]) / (SCALE[6]-SCALE[5])); }
    else if(dB < SCALE[7]) { return colorInterpolation(ORANGE, RED,     (dB-SCALE[6]) / (SCALE[7]-SCALE[6])); }
    else if(dB < SCALE[8]) { return colorInterpolation(RED,    WHITE,   (dB-SCALE[7]) / (SCALE[8]-SCALE[7])); }
    else return WHITE;

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
