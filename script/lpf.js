// 实数序列转换为复数序列
function ToComplexArray(realArray) {
    let complexArray = new Array();
    for(let i = 0; i < realArray.length; i++) {
        complexArray.push(new Complex(realArray[i], 0));
    }
    return complexArray;
}

// 复数序列转换为实部序列
function ToRealArray(complexArray) {
    let realArray = new Array();
    for(let i = 0; i < complexArray.length; i++) {
        realArray.push(complexArray[i].rep);
    }
    return realArray;
}

// Hann窗
function Hann(x, Length) {
    return 0.5 * (1 - Math.cos(2 * Math.PI * x / (Length - 1)));
}

// 理想低通（加Hann窗）
function LPFSeq(length, cutoff) {
    let lpf = new Array();
    const h = (x) => {
        return (x === 0) ? cutoff : (Math.sin(x * Math.PI * cutoff) / (x * Math.PI));
    };
    for(let i = 0; i < length; i++) {
        let val = h(i - (length >> 1)) * Hann(i, length);
        lpf.push(new Complex(val, 0));
    }
    return lpf;
}

// 卷积
function Conv(a, b) {
    // 序列补零到2^n
    let aExpanded = new Array();
    let bExpanded = new Array();
    let normalLength = (LOG[a.length + b.length] === undefined) ?
        parseInt(Math.pow(2, parseInt(Math.log2(a.length + b.length) + 1))) :
        (a.length + b.length);
    for(let i = 0; i < normalLength; i++) {
        aExpanded.push(a[i] || new Complex(0,0));
        bExpanded.push(b[i] || new Complex(0,0));
    }

    let aSpect = FFT(aExpanded, normalLength);
    let bSpect = FFT(bExpanded, normalLength);

    let resultSpect = new Array();
    for(let i = 0; i < normalLength; i++) {
        resultSpect.push(aSpect[i].mul(bSpect[i]));
    }

    let result = IFFT(resultSpect, normalLength);

    return result;
}

// 重叠相加卷积
function LPF(inputChannel, windowSize, cutoff) {
    let lpfSeq = LPFSeq(windowSize, cutoff);

    let filteredChannel = new Float32Array(inputChannel.length);
    let prev;

    for(let i = 0; i < inputChannel.length - (windowSize<<1); i += windowSize) {
        let frame = ToComplexArray(inputChannel.slice(i, i+windowSize));
        // 卷积结果长度是帧的两倍，因此向前滑动一帧后，相邻的卷积结果会有一帧长度的重叠，需要将重叠部分加起来
        let filteredFrame = ToRealArray(Conv(frame, lpfSeq));
        if(i > 0) {
            for(let c = 0; c < windowSize; c++) {
                filteredFrame[c] += prev[c + windowSize];
            }
        }
        filteredChannel.set(filteredFrame, i);
        prev = filteredFrame;
    }

    return filteredChannel;
}
