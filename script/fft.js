// 信号处理相关
// 2019.08.02 使用TS重写
/**
 * 复数类
 */
var Complex = /** @class */ (function () {
    function Complex(rep, imp) {
        this.rep = 0;
        this.imp = 0;
        this.rep = rep;
        this.imp = imp;
    }
    Complex.prototype.add = function (c) {
        return new Complex(c.rep + this.rep, c.imp + this.imp);
    };
    Complex.prototype.sub = function (c) {
        return new Complex(this.rep - c.rep, this.imp - c.imp);
    };
    Complex.prototype.scale = function (r) {
        return new Complex(r * this.rep, r * this.imp);
    };
    Complex.prototype.mul = function (c) {
        var newrep = this.rep * c.rep - this.imp * c.imp;
        var newimp = this.rep * c.imp + this.imp * c.rep;
        return new Complex(newrep, newimp);
    };
    Complex.prototype.copyFrom = function (c) {
        this.rep = c.rep;
        this.imp = c.imp;
    };
    Complex.prototype.show = function () {
        console.log('Complex:[ ' + this.rep + ' , ' + this.imp + ' ]');
    };
    Complex.prototype.absSqr = function() {
        return (this.rep * this.rep + this.imp * this.imp);
    };
    return Complex;
}());

// 将实数序列转换为复数序列
Array.prototype.toComplexList = function() {
    let list = this;
    let clist = new Array();
    let normLen = (LOG[list.length] === undefined) ? parseInt(Math.pow(2, parseInt(Math.log2(list.length) + 1))) : list.length;
    for(let i = 0; i < normLen; i++) {
        if(list[i] !== undefined) {
            clist.push(new Complex(list[i], 0));
        }
        else {
            clist.push(new Complex(0, 0));
        }
    }
    return clist;
};

// 指数查找表
var POW = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
// 对数查找表
var LOG = {
    '1': 0, '2': 1, '4': 2, '8': 3, '16': 4, '32': 5, '64': 6, '128': 7, '256': 8,
    '512': 9, '1024': 10, '2048': 11, '4096': 12, '8192': 13, '16384': 14, '32768': 15, '65536': 16
};
// FFT 快速傅立叶变换
function BasicFFT(IN, size, isIFFT) {
    // 计算旋转因子
    function calculateTwiddleFactor(fftSize, isIFFT) {
        var W = new Array(fftSize);
        var ReP = 0;
        var ImP = 0;
        // 只需要用到0~(fftSize-1)的旋转因子
        for (var i = 0; i < (fftSize >> 1); i++) {
            // W[i] = exp(-2*pi*j*(i/N))
            ReP = Math.cos(2.0 * Math.PI * (i / fftSize));
            if (isIFFT) {
                ImP = Math.sin(2.0 * Math.PI * (i / fftSize));
            }
            else {
                ImP = -Math.sin(2.0 * Math.PI * (i / fftSize));
            }
            W[i] = new Complex(ReP, ImP);
        }
        return W;
    }
    // 生成码位倒置序列
    function bitReverse(fftSize) {
        var brevIndex = new Array();
        var temp = 0;
        var bitSize = LOG[fftSize];
        for (var i = 0; i < fftSize; i++) {
            temp = i;
            brevIndex[i] = 0;
            for (var c = 0; c < bitSize; c++) {
                if (((temp >> c) & 1) !== 0) {
                    brevIndex[i] += (1 << (bitSize - 1 - c)); // POW[bitSize - 1 - c];
                }
            }
        }
        return brevIndex;
    }
    // 两个数组，用来交替存储各级蝶形运算的结果
    var buf = new Array();
    buf[0] = new Array();
    buf[1] = new Array();
    for (var i = 0; i < size; i++) {
        buf[0][i] = new Complex(0, 0);
        buf[1][i] = new Complex(0, 0);
    }
    var M = LOG[size];
    if (!(size in LOG)) {
        throw '[FFT] 输入序列长度必须是2的幂';
    }
    // 码位倒置后的输入序列下标
    var indexIn = bitReverse(size);
    // 旋转因子备用
    var W = calculateTwiddleFactor(size, isIFFT);
    var level = 0;
    for (level = 0; level < (((M & 1) === 0) ? M : (M + 1)); level++) {
        for (var group = 0; group < POW[M - level - 1]; group++) {
            for (var i = 0; i < (1 << level) /*POW[level]*/; i++) {
                var indexBuf = i + (group << (level + 1));
                var scalingFactor = (1 << (M - level - 1)); // POW[M-level-1];
                if (level === 0) {
                    (buf[0])[indexBuf].copyFrom(IN[indexIn[indexBuf]].add(W[i * scalingFactor].mul(IN[indexIn[indexBuf + (1 << level) /*POW[level]*/]])));
                    (buf[0])[indexBuf + (1 << level) /*POW[level]*/].copyFrom(IN[indexIn[indexBuf]].sub(W[i * scalingFactor].mul(IN[indexIn[indexBuf + (1 << level) /*POW[level]*/]])));
                }
                else {
                    (buf[level & 1])[indexBuf].copyFrom((buf[(level + 1) & 1])[indexBuf].add(W[i * scalingFactor].mul((buf[(level + 1) & 1])[indexBuf + (1 << level) /*POW[level]*/])));
                    (buf[level & 1])[indexBuf + (1 << level) /*POW[level]*/].copyFrom((buf[(level + 1) & 1])[indexBuf].sub(W[i * scalingFactor].mul((buf[(level + 1) & 1])[indexBuf + (1 << level) /*POW[level]*/])));
                }
            }
        }
    }
    var result = null;
    if ((M & 1) === 0) {
        result = buf[(level + 1) & 1];
    }
    else {
        result = buf[level & 1];
    }
    if (isIFFT) {
        return result.map(function (value) { return value.scale(1 / size); });
    }
    else {
        return result;
    }
}
function FFT(IN, size) {
    return BasicFFT(IN, size, false);
}
function IFFT(IN, size) {
    return BasicFFT(IN, size, true);
}

