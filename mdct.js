/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 BD4SUR @ GitHub
//
//  =============================================================
//
//  mdct.js
//
//    改进的离散余弦变换。
//
/////////////////////////////////////////////////////////////////


/**
 * @description 长窗 窗函数（Type = 0）
 * @reference C.1.5.3.3(p96)
 */
// return (i >= 0 && i < 36) ? Math.sin(Math.PI * (i + 0.5) / 36) :
//        0;
const WindowNormal = [
    0.043619387365336, 0.13052619222005157, 0.21643961393810288, 0.3007057995042731, 0.3826834323650898, 0.46174861323503386,
    0.5372996083468239, 0.6087614290087205, 0.6755902076156602, 0.737277336810124, 0.7933533402912352, 0.8433914458128856,
    0.8870108331782217, 0.9238795325112867, 0.9537169507482269, 0.9762960071199334, 0.9914448613738104, 0.9990482215818578,
    0.9990482215818578, 0.9914448613738105, 0.9762960071199335, 0.9537169507482269, 0.9238795325112867, 0.8870108331782216,
    0.8433914458128858, 0.7933533402912352, 0.7372773368101241, 0.6755902076156604, 0.6087614290087209, 0.5372996083468241,
    0.4617486132350339, 0.3826834323650899, 0.30070579950427334, 0.21643961393810318, 0.13052619222005157, 0.04361938736533607];

/**
 * @description 起始窗 窗函数（Type = 1）
 * @reference C.1.5.3.3(p95)
 */
// return (i >= 0  && i < 18) ? Math.sin(Math.PI * (i + 0.5) / 36) :
//        (i >= 18 && i < 24) ? 1 :
//        (i >= 24 && i < 30) ? Math.sin(Math.PI * (i + 0.5 - 18) / 12) :
//        0;
const WindowStart = [
    0.043619387365336, 0.13052619222005157, 0.21643961393810288, 0.3007057995042731, 0.3826834323650898, 0.46174861323503386,
    0.5372996083468239, 0.6087614290087205, 0.6755902076156602, 0.737277336810124, 0.7933533402912352, 0.8433914458128856,
    0.8870108331782217, 0.9238795325112867, 0.9537169507482269, 0.9762960071199334, 0.9914448613738104, 0.9990482215818578,
    1, 1, 1, 1, 1, 1,
    0.9914448613738104, 0.9238795325112868, 0.7933533402912352, 0.6087614290087209, 0.3826834323650899, 0.130526192220052,
    0, 0, 0, 0, 0, 0];

/**
 * @description 短窗 窗函数（Type = 2）
 * @reference C.1.5.3.3(p96)
 */
// return (i >= 0 && i < 12) ? Math.sin(Math.PI * (i + 0.5) / 12) :
//        0;
const WindowShort = [
    0.13052619222005157, 0.3826834323650898, 0.6087614290087207, 0.7933533402912352, 0.9238795325112867, 0.9914448613738104,
    0.9914448613738104, 0.9238795325112868, 0.7933533402912352, 0.6087614290087209, 0.3826834323650899, 0.130526192220052,
    0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0];

/**
 * @description 结束窗 窗函数（Type = 3）
 * @reference C.1.5.3.3(p96)
 */
// return (i >= 0  && i < 6 ) ? 0:
//        (i >= 6  && i < 12) ? Math.sin(Math.PI * (i + 0.5 - 6) / 12) :
//        (i >= 12 && i < 18) ? 1 :
//        (i >= 18 && i < 36) ? Math.sin(Math.PI * (i + 0.5) / 36) :
//        0;
const WindowStop = [
    0, 0, 0, 0, 0, 0,
    0.13052619222005157, 0.3826834323650898, 0.6087614290087207, 0.7933533402912352, 0.9238795325112867, 0.9914448613738104,
    1, 1, 1, 1, 1, 1,
    0.9990482215818578, 0.9914448613738105, 0.9762960071199335, 0.9537169507482269, 0.9238795325112867, 0.8870108331782216,
    0.8433914458128858, 0.7933533402912352, 0.7372773368101241, 0.6755902076156604, 0.6087614290087209, 0.5372996083468241,
    0.4617486132350339, 0.3826834323650899, 0.30070579950427334, 0.21643961393810318, 0.13052619222005157, 0.04361938736533607];


/**
 * @description 改进的离散余弦变换（MDCT）
 * @reference C.1.5.3.3(p96)
 * @input  input - 36或者12点时域序列
 * @input  length - 输入时域序列长度：36为长窗口；12为短窗口
 * @output 18/6个频域点
 */
function MDCT(input, length) {
    let output = new Array();
    let MDCT_FACTOR = (length === 12) ? MDCT_FACTOR_12 : MDCT_FACTOR_36;
    for(let i = 0; i < (length / 2); i++) {
        let sum = 0;
        for(let k = 0; k < length; k++) {
            sum += input[k] * MDCT_FACTOR[i * length + k];
        }
        output[i] = sum / length * 4; // NOTE 20200525 保证长短块的频点尺度相同，否则会出现长短块电平不一致。乘以4的目的是将幅度调整到0.7~1附近（但仍需回放增益）
    }
    return output;
}


/**
 * @description 去混叠蝶形结的系数
 * @reference Table.B.9(p65)
 * 
 * NOTE ALIASING_CS 和 ALIASING_CA 的计算方法
 * for(let i = 0; i < 8; i++) {
 *     let ci = ALIASING_REDUCTION_COEFFICIENTS[i];
 *     ALIASING_CS[i] = 1 / Math.sqrt(1 + ci * ci);
 *     ALIASING_CA[i] = ci / Math.sqrt(1 + ci * ci);
 * }
 * 
 */
const ALIASING_REDUCTION_COEFFICIENTS = [-0.6, -0.535, -0.33, -0.185, -0.095, -0.041, -0.0142, -0.0037];
const ALIASING_CS = [0.8574929257125443, 0.8817419973177052, 0.9496286491027328, 0.9833145924917902, 0.9955178160675858, 0.9991605581781475, 0.9998991952444471, 0.9999931550702803];
const ALIASING_CA = [-0.5144957554275266, -0.47173196856497235, -0.31337745420390184, -0.18191319961098118, -0.09457419252642066, -0.04096558288530405, -0.01419856857247115, -0.0036999746737600373];


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
    for(let i = 0; i < 576; i++) {
        output[i] = input[i];
    }
    // 每两个长块（18点子序列）之间执行蝶形结，共31个交叠间隙
    for(let i = 1; i < 32; i++) { // 1~31（从1开始）
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
function GranuleMDCT(currentGranuleSubbands, prevGranuleSubbands, windowType) {
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
                windowedMdctInput[i] = (i < 18) ? (prevGranule[i] * windowFunction[i]) :
                                                  (currentGranule[i-18] * windowFunction[i]);
            }
            // MDCT
            let mdctOutput = MDCT(windowedMdctInput, 36);
            // 拼接到长块频谱上
            // LongBlockSpectrum = LongBlockSpectrum.concat(mdctOutput);
            // 以下4行是上一行的优化实现
            let mdctOutputLength = mdctOutput.length;
            for(let i = 0; i < mdctOutputLength; i++) {
                LongBlockSpectrum.push(mdctOutput[i]); // concat
            }
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
            // let frame = prevGranule.concat(currentGranule);
            // 以下9行是上一行的优化实现
            let frame = [];
            let prevGranuleLength = prevGranule.length;
            let currentGranuleLength = currentGranule.length;
            for(let i = 0; i < prevGranuleLength; i++) {
                frame.push(prevGranule[i]); // concat
            }
            for(let i = 0; i < currentGranuleLength; i++) {
                frame.push(currentGranule[i]); // concat
            }
            // 处理三个按时间顺序排列的短块
            for(let shortBlockCount = 0; shortBlockCount < 3; shortBlockCount++) {
                // 截取短块（长度为12）
                let shortBlock = frame.slice((shortBlockCount + 1) * 6, (shortBlockCount + 1) * 6 + 12);
                // 加窗并MDCT
                let shortWindowedMdctInput = new Array();
                for(let i = 0; i < 12; i++) {
                    shortWindowedMdctInput[i] = shortBlock[i] * WindowShort[i];
                }
                let shortMdctOutput = MDCT(shortWindowedMdctInput, 12);
                // 拼接到第 shortBlockCount 个短块频谱上
                // ShortBlockSpectrums[shortBlockCount] = ShortBlockSpectrums[shortBlockCount].concat(shortMdctOutput);
                // 以下6行是上一行的优化实现
                let shortMdctOutputLength = shortMdctOutput.length;
                let sbs = ShortBlockSpectrums[shortBlockCount];
                for(let i = 0; i < shortMdctOutputLength; i++) {
                    sbs.push(shortMdctOutput[i]);
                }
                ShortBlockSpectrums[shortBlockCount] = sbs; // concat
            }
        }
        return ShortBlockSpectrums;
    }
}



