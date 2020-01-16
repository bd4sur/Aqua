
/**
 * @description 长窗 窗函数（Type = 0）
 * @reference C.1.5.3.3(p96)
 */
function WindowNormal(i) {
    return (i >= 0 && i < 36) ? Math.sin(Math.PI * (i + 0.5) / 36) :
           0;
}

/**
 * @description 起始窗 窗函数（Type = 1）
 * @reference C.1.5.3.3(p95)
 */
function WindowStart(i) {
    return (i >= 0  && i < 18) ? Math.sin(Math.PI * (i + 0.5) / 36) :
           (i >= 18 && i < 24) ? 1 :
           (i >= 24 && i < 30) ? Math.sin(Math.PI * (i + 0.5 - 18) / 12) :
           0;
}

/**
 * @description 短窗 窗函数（Type = 2）
 * @reference C.1.5.3.3(p96)
 */
function WindowShort(i) {
    return (i >= 0 && i < 12) ? Math.sin(Math.PI * (i + 0.5) / 12) :
           0;
}

/**
 * @description 结束窗 窗函数（Type = 3）
 * @reference C.1.5.3.3(p96)
 */
function WindowStop(i) {
    return (i >= 0  && i < 6 ) ? 0:
           (i >= 6  && i < 12) ? Math.sin(Math.PI * (i + 0.5 - 6) / 12) :
           (i >= 12 && i < 18) ? 1 :
           (i >= 18 && i < 36) ? Math.sin(Math.PI * (i + 0.5) / 36) :
           0;
}

/**
 * @description 改进的离散余弦变换（MDCT）
 * @reference C.1.5.3.3(p96)
 * @input  input - 36或者12点时域序列
 * @input  length - 输入时域序列长度：36为长窗口；12为短窗口
 * @output 18/6个频域点
 */
function MDCT(input, length) {
    let output = new Array();
    for(let i = 0; i < (length / 2); i++) {
        let sum = 0;
        for(let k = 0; k < length; k++) {
            let temp = Math.PI * (2 * k + 1 + length / 2) * (2 * i + 1) / (2 * length);
            sum += input[k] * Math.cos(temp);
        }
        output[i] = sum;
    }
    return output;
}

/**
 * @description 去混叠蝶形结运算（仅用于长块频谱）
 * @reference Fig.A.5(p96) Table.B.9(p65) C.1.5.3.3(p96-97) Fig.C.8(p97)
 * @input  longBlockSpectrum - 由MDCT输出的576点长块频谱（窗口类型：Normal、Start、Stop）
 * @output 经蝶形运算的576点长块频谱
 */
function ReduceAliasing(longBlockSpectrum) {
    let input = longBlockSpectrum;
    let output = new Array();
    // 首先以input初始化output
    for(let i = 0; i < GRANULE_LENGTH; i++) {
        output[i] = input[i];
    }
    // 每两个长块（18点子序列）之间执行蝶形结，共31个交叠间隙
    for(let i = 1; i < GRANULE_LENGTH / 18; i++) { // 1~31（从1开始）
        let indexA = 18 * i - 1;
        let indexB = 18 * i;
        // 每个交叠间隙执行8个蝶形结
        for(let butterfly = 0; butterfly < 8; butterfly++) {
            let inputA = input[indexA - butterfly];
            let inputB = input[indexB + butterfly];
            output[indexA - butterfly] =  inputA * ALIASING_CS[butterfly] + inputB * ALIASING_CA[butterfly];
            output[indexB + butterfly] = -inputA * ALIASING_CA[butterfly] + inputB * ALIASING_CS[butterfly];
        }
    }
    return output;
}


/**
 * @description 计算一个Granule的频谱输出，含MDCT和去混叠（仅长块）
 * @reference C.1.5.3.3(p96-97)
 * @input  currentGranuleSubbands - 当前Granule的分析子带滤波器输出：[SB0[18]..SB31[18]]
 * @input  prevGranuleSubbands - 时域的前一个Granule的分析子带滤波器输出：[SB0[18]..SB31[18]]
 * @input  windowType - PAM2提供的窗口类型：枚举值 WINDOW_NORMAL | WINDOW_START | WINDOW_SHORT | WINDOW_STOP
 * @output 频谱（数组），结果分为长块|短块两类。长块结果为[576点长块频谱]；短块结果为[192点短块频谱0, 192点短块频谱1, 192点短块频谱2]，三者按照时域时间顺序排列。
 */
function CalculateGranuleSpectrum(currentGranuleSubbands, prevGranuleSubbands, windowType) {
    if(windowType === WINDOW_NORMAL ||
       windowType === WINDOW_START  ||
       windowType === WINDOW_STOP )
    {
        // 对每个子带进行处理，最后将每个子带的结果拼接成1个576点的长块频谱
        let LongBlockSpectrum = new Array();
        for(let sbindex = 0; sbindex < 32; sbindex++) {
            let currentGranule = currentGranuleSubbands[sbindex];
            let prevGranule = prevGranuleSubbands[sbindex];
            // 加窗
            let windowedMdctInput = new Array();
            let windowFunction = (windowType === WINDOW_NORMAL) ? WindowNormal :
                                 (windowType === WINDOW_START)  ? WindowStart :
                                 (windowType === WINDOW_STOP)   ? WindowStop : undefined;
            for(let i = 0; i < 36; i++) {
                windowedMdctInput[i] = (i < 18) ? (prevGranule[i] * windowFunction(i)) :
                                                  (currentGranule[i-18] * windowFunction(i));
            }
            // MDCT
            let mdctOutput = MDCT(windowedMdctInput, 36);
            // 拼接到长块频谱上
            LongBlockSpectrum = LongBlockSpectrum.concat(mdctOutput);
        }
        // 对长块频谱作去混叠蝶形结运算
        let LongBlockSpectrumWithoutAliasing = ReduceAliasing(LongBlockSpectrum);
        return [LongBlockSpectrumWithoutAliasing];
    }
    else if(windowType === WINDOW_SHORT) {
        // 对每个子带进行处理，将每个子带的结果拼接成三个192点的短块频谱
        let ShortBlockSpectrums = new Array();
            ShortBlockSpectrums[0] = new Array();
            ShortBlockSpectrums[1] = new Array();
            ShortBlockSpectrums[2] = new Array();
        for(let sbindex = 0; sbindex < 32; sbindex++) {
            let currentGranule = currentGranuleSubbands[sbindex];
            let prevGranule = prevGranuleSubbands[sbindex];
            let frame = currentGranule.concat(prevGranule);
            // 处理三个按时间顺序排列的短块
            for(let shortBlockCount = 0; shortBlockCount < 3; shortBlockCount++) {
                // 截取短块（长度为12）
                let shortBlock = frame.slice((shortBlockCount + 1) * 6, (shortBlockCount + 1) * 6 + 12);
                // 加窗并MDCT
                let shortWindowedMdctInput = new Array();
                for(let i = 0; i < 12; i++) {
                    shortWindowedMdctInput[i] = shortBlock[i] * WindowShort(i);
                }
                let shortMdctOutput = MDCT(shortWindowedMdctInput, 12);
                // 拼接到第 shortBlockCount 个短块频谱上
                ShortBlockSpectrums[shortBlockCount] = ShortBlockSpectrums[shortBlockCount].concat(shortMdctOutput);
            }
        }
        return ShortBlockSpectrums;
    }
}



