/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyrignt (c) 2019-2020 Mikukonai @ GitHub
//
//  =============================================================
//
//  fft.js
//
//    快速傅里叶变换。供心理声学模型使用。
//
/////////////////////////////////////////////////////////////////

// 对数查找表
const LOG2 = {
    '1':0,      '2':1,      '4':2,      '8':3,      '16':4,      '32':5,      '64':6,      '128':7,      '256':8,
    '512':9,    '1024':10,  '2048':11,  '4096':12,  '8192':13,   '16384':14,  '32768':15,  '65536':16,
};

// 复数类
class Complex {
    constructor(rep, imp) {
        this.rep = rep;
        this.imp = imp;
    }
    add(c) {
        return new Complex(c.rep + this.rep, c.imp + this.imp);
    }
    sub(c) {
        return new Complex(this.rep - c.rep, this.imp - c.imp);
    }
    scale(r) {
        return new Complex(r * this.rep, r * this.imp);
    }
    mul(c) {
        let newrep = this.rep * c.rep - this.imp * c.imp;
        let newimp = this.rep * c.imp + this.imp * c.rep;
        return new Complex(newrep, newimp);
    }
    copyFrom(c) {
        this.rep = c.rep;
        this.imp = c.imp;
    }
    // 模的平方
    energy() {
        return (this.rep * this.rep + this.imp * this.imp);
    }
    // 模
    radius() {
        return Math.sqrt(this.rep * this.rep + this.imp * this.imp);
    }
    // 相位([0, 2*pi))
    phase() {
        let angle = Math.atan2(this.imp, this.rep);
        return (angle >= 0) ? angle : (2 * Math.PI + angle);
    }
    show() {
        LOG('Complex:[ ' + this.rep + ' , ' + this.imp + ' ]');
    }
}

// 实数数组 转 复数数组
function RealArrayToComplexArray(realArray) {
    let complexArray = new Array();
    for(let i = 0; i < realArray.length; i++) {
        complexArray.push(new Complex(realArray[i], 0));
    }
    return complexArray;
}

// 复数数组 转换成 两个 实数数组，分别是实部和虚部
function ComplexArrayToRealArrays(complexArray) {
    let repArray = new Array();
    let impArray = new Array();
    for(let i = 0; i < complexArray.length; i++) {
        repArray.push(complexArray[i].rep);
        impArray.push(complexArray[i].imp);
    }
    return [repArray, impArray];
}

// 复数数组 转换成 两个 实数数组，分别是模和相位
function ComplexArrayToPolarArrays(complexArray) {
    let radiusArray = new Array();
    let phaseArray = new Array();
    for(let i = 0; i < complexArray.length; i++) {
        radiusArray.push(complexArray[i].radius());
        phaseArray.push(complexArray[i].phase());
    }
    return [radiusArray, phaseArray];
}


// 计算旋转因子
function CalculateTwiddleFactor(fftSize, isIFFT) {
    let W = new Array(fftSize);
    let ReP = 0;
    let ImP = 0;
    // 只需要用到0~(fftSize-1)的旋转因子
    for(let i = 0; i < (fftSize>>1) ; i++) {
        ReP = Math.cos(2.0 * Math.PI * ( i / fftSize ) );
        if(isIFFT) {
            ImP = Math.sin(2.0 * Math.PI * ( i / fftSize ) );
        }
        else {
            ImP = -Math.sin(2.0 * Math.PI * ( i / fftSize ) );
        }
        W[i] = new Complex(ReP, ImP);
    }
    return W;
}

// 二进制反转（生成蝶形结输入侧的下标）
function BinaryReverse(fftSize) {
    let reversedIndexes = new Array();
    let temp = 0;
    let bitSize = LOG2[fftSize];
    for(let i = 0; i < fftSize; i++) {
        temp = i;
        reversedIndexes[i] = 0;
        for(let c = 0; c < bitSize; c++) {
            if(((temp >> c) & 1) !== 0) {
                reversedIndexes[i] += (1 << (bitSize - 1 - c));
            }
        }
    }
    return reversedIndexes;
}

// FFT 快速傅立叶变换
function BasicFFT(INPUT, fftSize, isIFFT) {
    // 初始化两个临时数组，用来交替存储各级蝶形运算的结果
    let buf = new Array();
    buf[0] = new Array();
    buf[1] = new Array();
    for(let i = 0; i < fftSize; i++) {
        buf[0][i] = new Complex(0,0);
        buf[1][i] = new Complex(0,0);
    }

    // 基-2 FFT，因此输入序列长度必须是2的幂
    if(!(fftSize in LOG2)) { throw '[FFT] 输入序列长度必须是2的幂'; }
    let M = LOG2[fftSize];

    // 二进制翻转得到输入序列下标
    let inputIndexes = BinaryReverse(fftSize);

    // 提前计算出旋转因子备用
    let W = CalculateTwiddleFactor(fftSize, isIFFT);

    // 基-2 FFT 蝶形结
    let level = 0;
    for(level = 0; level < (((M & 1) === 0) ? M : (M+1)); level++) {
        for(let group = 0; group < (1 << (M-level-1)); group++) {
            for(let i = 0; i < (1<<level); i++) {
                let indexBuf = i + (group << (level+1));
                let scaleFactor = (1 << (M-level-1));
                if(level === 0) {
                    (buf[0])[       indexBuf      ].copyFrom(
                        INPUT[inputIndexes[indexBuf]] .add( W[i * scaleFactor] .mul( INPUT[inputIndexes[indexBuf + (1<<level)]] )));
                    (buf[0])[indexBuf + (1<<level)].copyFrom(
                        INPUT[inputIndexes[indexBuf]] .sub( W[i * scaleFactor] .mul( INPUT[inputIndexes[indexBuf + (1<<level)]] )));
                }
                else {
                    (buf[level & 1])[       indexBuf      ].copyFrom(
                        (buf[(level+1) & 1])[indexBuf] .add( W[i * scaleFactor] .mul( (buf[(level+1) & 1])[indexBuf + (1<<level)] )));
                    (buf[level & 1])[indexBuf + (1<<level)].copyFrom(
                        (buf[(level+1) & 1])[indexBuf] .sub( W[i * scaleFactor] .mul( (buf[(level+1) & 1])[indexBuf + (1<<level)] )));
                }
            }
        }
    }
    let OUTPUT = ((M & 1) === 0) ? buf[(level+1) & 1] : buf[level & 1];
    return (isIFFT) ?
        OUTPUT.map((value)=>{ return value.scale(1 / fftSize);}) :
        OUTPUT;
}

// FFT入口（输入输出序列均为复数序列，长度必须是2的幂）
function FFT(INPUT, fftSize) {
    return BasicFFT(INPUT, fftSize, false);
}

// IFFT入口（输入输出序列均为复数序列，长度必须是2的幂）
function IFFT(INPUT, fftSize) {
    return BasicFFT(INPUT, fftSize, true);
}
