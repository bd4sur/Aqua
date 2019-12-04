///////////////////////////////
// 快速傅里叶变换
///////////////////////////////

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
                reversedIndexes[i] += (1 << (bitSize - 1 - c)); // POW2[bitSize - 1 - c];
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
        for(let group = 0; group < POW2[M-level-1]; group++) {
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
