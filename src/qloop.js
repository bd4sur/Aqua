/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 BD4SUR @ GitHub
//
//  =============================================================
//
//  qloop.js
//
//    量化和码率控制循环。包含量化、外层循环和内层循环。
//
/////////////////////////////////////////////////////////////////

/**
 * @description 频谱平坦度，用于计算量化步长初值 Ref: https://en.wikipedia.org/wiki/Spectral_flatness , doi:10.1109/lsp.2004.831663
 */
function SFM(xr576) {
    let temp1 = 0, temp2 = 0;
    let xrlen = 0;
    for(let i = 0; i < xr576.length; i++) {
        if(xr576[i] === 0) continue;
        let sqr = xr576[i] * xr576[i];
        temp1 += Math.log(sqr);
        temp2 += sqr;
        xrlen++;
    }
    if(temp2 === 0) return 1;
    temp1 /= xrlen;
    temp1 = Math.exp(temp1);
    temp2 /= xrlen;
    return (temp1 / temp2);
}

/**
 * @description 计算各个尺度因子频带的量化误差
 */
function QuantNoise(xr, ix, quantStep, blockType) {
    let xfsf = new Array();
    let SFB = ScaleFactorBands[SAMPLE_RATE][blockType];
    let power_of_root_2_4 = POWER_OF_ROOT_2_4[quantStep + 256];
    for(let sbindex = 0; sbindex < SFB.length; sbindex++) {
        let sum = 0;
        for(let i = SFB[sbindex][0]; i <= SFB[sbindex][1]; i++) {
            // NOTE 与标准原文的差异：给ix[i]加了绝对值
            let temp1 = (ix[i] === 0) ?
                        (xr[i] >= 0 ? xr[i] : -xr[i]) :
                        ((xr[i] >= 0 ? xr[i] : -xr[i]) - Math.pow((ix[i] >= 0 ? ix[i] : -ix[i]), 1.3333333333333) * power_of_root_2_4);
            sum += (temp1 * temp1);
        }
        xfsf[sbindex] = sum / (SFB[sbindex][1] - SFB[sbindex][0] + 1); // NOTE 此处dist10与IS有出入，以dist10为准。
    }
    return xfsf;
}

/**
 * @description 对576点序列执行量化
 * @note TODO 根据dist10，此处应该区分长短块，加上subblock_gain，目前暂不实现
 */
function Quantize(xr576, quantStep) {
    let ix576 = new Array();
    let inv_power_of_root_2_4 = INV_POWER_OF_ROOT_2_4[quantStep + 256];
    for(let i = 0; i < 576; i++) {
        let xr = xr576[i];
        if(xr > 0) {
            let a = fastPower0p75(xr * inv_power_of_root_2_4);
            let b = (a + 0.4054) << 0; // NOTE 2022-07-10 a faster Math.round(a - 0.0946)
            ix576[i] = b;
        }
        else if(xr < 0) {
            let a = fastPower0p75((-xr) * inv_power_of_root_2_4);
            let b = (a + 0.4054) << 0; // NOTE 2022-07-10 a faster Math.round(a - 0.0946)
            ix576[i] = -b;
        }
        else if(xr === 0) {
            ix576[i] = 0;
        }
    }
    return ix576;
}


/**
 * @description 短块频谱重排
 */
function MuxShortBlockSpectrum(qspects) {
    let qspect576 = new Array();
    let SFBands = ScaleFactorBands[SAMPLE_RATE][SHORT_BLOCK];
    for(let sfb = 0; sfb < SFBands.length; sfb++) {
        let sfbPartition = SFBands[sfb];
        // 因最后一个SFB并未延伸到频谱末端(191)，所以应将其延伸到频谱末端
        if(sfb === SFBands.length - 1) sfbPartition = [sfbPartition[0], 191];
        for(let w = 0; w < 3; w++) {
            for(let i = sfbPartition[0]; i <= sfbPartition[1]; i++) {
                qspect576.push(qspects[w][i]);
            }
        }
    }
    return qspect576;
}


/**
 * @description 576点短块频谱拆分成3个短块频谱
 */
function DemuxShortBlockSpectrum(spect576) {
    let spect = new Array();
        spect[0] = new Array();
        spect[1] = new Array();
        spect[2] = new Array();
    let SFBands = ScaleFactorBands[SAMPLE_RATE][SHORT_BLOCK];
    let offset = 0;
    for(let sfb = 0; sfb < SFBands.length; sfb++) {
        let sfbPartition = SFBands[sfb];
        // 因最后一个SFB并未延伸到频谱末端(191)，所以应将其延伸到频谱末端
        if(sfb === SFBands.length - 1) sfbPartition = [sfbPartition[0], 191];
        for(let w = 0; w < 3; w++) {
            for(let i = sfbPartition[0]; i <= sfbPartition[1]; i++) {
                spect[w][i] = spect576[offset];
                offset++;
            }
        }
    }
    return spect;
}


/**
 * @description 计算尺度因子的scalefac_compress  TODO 不支持混合块模式
 * @reference 2.4.2.7(p25-26)
 * @input  Scalefactors - 一组长块尺度因子（21个），或者三组短块尺度因子（3×12个）
 * @input  blockType - 窗口类型（长块或短块）
 * @output scalefac_compress
 */
function ScalefactorCompress(Scalefactors, blockType) {
    let maxValue1 = -1;
    let maxValue2 = -1;
    if(blockType !== WINDOW_SHORT) {
        // 计算0~10和11~20两个SFB区间的最大值
        for(let i = 0; i <= 10; i++) {
            if(Scalefactors[i] > maxValue1) maxValue1 = Scalefactors[i];
        }
        for(let i = 11; i <= 20; i++) {
            if(Scalefactors[i] > maxValue2) maxValue2 = Scalefactors[i];
        }
    }
    else if(blockType === WINDOW_SHORT) {
        // 计算0~5和6~11两个SFB区间的最大值
        for(let i = 0; i <= 5; i++) {
            let sf = Math.max(Scalefactors[0][i], Scalefactors[1][i], Scalefactors[2][i]);
            if(sf > maxValue1) maxValue1 = sf;
        }
        for(let i = 6; i <= 11; i++) {
            let sf = Math.max(Scalefactors[0][i], Scalefactors[1][i], Scalefactors[2][i]);
            if(sf > maxValue2) maxValue2 = sf;
        }
    }
    // 计算各自的位数
    let slen1 = (maxValue1 === 0) ? 0 : (Math.floor(Math.log2(maxValue1)) + 1);
    let slen2 = (maxValue2 === 0) ? 0 : (Math.floor(Math.log2(maxValue2)) + 1);
    let sfcompress = SF_COMPRESS[slen1][slen2];

    return (!(sfcompress >= 0)) ? 15 : sfcompress;
}


/**
 * @description 计算part2（尺度因子）长度
 */
function Part2Length(scalefactorCompress, blockType) {
    let part2Length = 0;
    let slens = SF_COMPRESS_INDEX[scalefactorCompress];
    if(blockType !== WINDOW_SHORT) {
        part2Length = 11 * slens[0] + 10 * slens[1];
    }
    else if(blockType === WINDOW_SHORT) {
        part2Length = (6 * slens[0] + 6 * slens[1]) * 3;
    }
    return part2Length;
}


/**
 * @description 内层循环（码率控制循环）
 */
function InnerLoop(Spectrum, blockType, bitRateLimit) {

    let initLength = -1; // 用于减少迭代次数
    let spectrum576;

    // 根据长短块不同，构造576点频谱供量化
    if(blockType !== WINDOW_SHORT) {
        spectrum576 = Spectrum[0];
    }
    else {
        spectrum576 = MuxShortBlockSpectrum(Spectrum);
    }

    // 计算量化初值
    // NOTE 下一行中，dist10是减去70。试验结果显示，对于某些测试用例（如 Zwei!! OST 的《おやすみ》），减去70的确可以防止准静音帧出现可闻噪声。
    //      但是这里考虑到性能，采取了一个较小的值。如果以后测试出问题，将继续修改这个参数。
    //      简单解释：所谓准静音，指的是幅度非常小、频谱平坦度又较高的片段，例如乐曲开始前或结束后的静音。由于频谱平坦度较高，初始量化步长较大，再加上
    //               本身幅度较小，因而量化噪音很容易超出掩蔽阈值和/或听阈，导致产生可闻量化噪声。所以，解决的办法就是尽可能减小量化初值。
    // NOTE 2022-07-05 通过正弦单音测试信号重新注意到这个问题：由于正弦单音信号的SFM非常小，再减去偏移值会使得量化步长过小，导致编码结果发生无法容忍的失真（并非噪声）。
    //      初步测试发现，将quantanf设为固定值-100，效果似乎不错。quantanf是个关键参数，有必要继续研究。
    let quantanf = Math.round(8 * Math.log(SFM(spectrum576))) - 50;

    for(let qquant = 0; qquant < 256; qquant++) { // global_gain为8bit
        // 量化
        let quantizedSpectrum576 = Quantize(spectrum576, (quantanf + qquant));

        // 保存量化步长
        let globalGain = quantanf + qquant + 210; // NOTE 关于这个210的来历，见标准p35的2.4.3.4.7。

        // 哈夫曼编码
        let huffman = HuffmanEncode(quantizedSpectrum576, blockType);

        // 以下代码的目的是尽可能减少迭代次数 TODO 这里的可靠性还需要进一步验证
        if(huffman !== null) {
            if(initLength < 0) initLength = huffman.codeString.length;
            let gone = initLength - huffman.codeString.length;    // 已经缩减的比特数
            let togo = huffman.codeString.length - bitRateLimit;  // 距离目标比特数还剩多少
            // 以下的分界点和加速步长都可以调整
            if(gone < 2 * togo) {
                qquant += 4;
            }
            else if(gone < 4 * togo) {
                qquant += 2;
            }
        }

        // 满足条件退出
        if(huffman !== null && huffman.codeString.length < bitRateLimit) {
            if(huffman.codeString.length === 0) globalGain = 0; // 静音情况
            return {
                "huffman": huffman,
                "globalGain": Math.min(globalGain, 255),
                "subblockGain": [0, 0, 0],
                "qquant": qquant,
                "quantizedSpectrum576": quantizedSpectrum576
            };
        }
    }
    // 量化超时
    return null;
}

/**
 * @description 外层循环（噪声控制循环）
 */
function OuterLoop(
    Spectrum,      // NOTE 该值会被修改（每轮循环都会放大一个尺度因子，并重新量化、编码）
    windowType,
    bitRateLimit,
    xmin           // NOTE 该值不会被修改（函数内部会拷贝一份副本）
) {

    // 【量化·编码结果】
    let innerLoopOutput;

    // 【循环初始化】

    // 循环计数器（防止超时）
    let outerLoopCount = 0;

    // 长块SFB个数
    let LongBlockSFBNumber = ScaleFactorBands[SAMPLE_RATE][LONG_BLOCK].length;
    let ShortBlockSFBNumber = ScaleFactorBands[SAMPLE_RATE][SHORT_BLOCK].length;

    // 初始化尺度因子
    let LongBlockScalefactors = new Array();
    for(let i = 0; i < LongBlockSFBNumber; i++) { LongBlockScalefactors[i] = 0; }
    let ShortBlockScalefactors = new Array();
        ShortBlockScalefactors[0] = new Array();
        ShortBlockScalefactors[1] = new Array();
        ShortBlockScalefactors[2] = new Array();
    for(let i = 0; i < ShortBlockSFBNumber; i++) {
        ShortBlockScalefactors[0][i] = 0;
        ShortBlockScalefactors[1][i] = 0;
        ShortBlockScalefactors[2][i] = 0;
    }

    // 由于循环时xmin要被分别放大，因此需要将xmin拷贝，循环时修改的是其副本
    let xminForLong = new Array();
    let xminForShort = new Array();
        xminForShort[0] = new Array();
        xminForShort[1] = new Array();
        xminForShort[2] = new Array();
    for(let i = 0; i < xmin.length; i++) {
        xminForLong[i] = xmin[i];
        xminForShort[0][i] = xmin[i];
        xminForShort[1][i] = xmin[i];
        xminForShort[2][i] = xmin[i];
    }

    // 用于指示短块情况下每个子块是否已经处理完成
    let isFinished = new Array();
    isFinished[0] = false; isFinished[1] = false; isFinished[2] = false;

    while(outerLoopCount < 100) { // 超时控制
        // Aqua_Log(`  外层循环第 ${outerLoopCount} 次`);

        // 缩放系数

        let scalefactorScale = 0;
        let ifqstep = (scalefactorScale === 0) ? 1.4142135623730951 : 2;

        // 【内层循环：码率控制循环】

        innerLoopOutput = InnerLoop(Spectrum, windowType, bitRateLimit);
        // Aqua_Log(`    内层循环结束，量化步数：${innerLoopOutput.qquant}`);

        /////////////////////////////
        //  长 块
        /////////////////////////////
        if(windowType !== WINDOW_SHORT) {

            // 【计算量化噪声】

            let xfsf = QuantNoise(Spectrum[0], innerLoopOutput.quantizedSpectrum576, innerLoopOutput.globalGain - 210, LONG_BLOCK);

            // 【预加重】（暂缓实现）


            // 【对所有超限的SFB放大一步】 C.1.5.4.3.5

            let sfbsOverXmin = new Array(); // 记录超限的SFB的index，用于判断退出条件
            for(let sbindex = 0; sbindex < LongBlockSFBNumber; sbindex++) {
                if(xfsf[sbindex] > xminForLong[sbindex]) {
                    sfbsOverXmin.push(sbindex);
                    xminForLong[sbindex] *= (ifqstep * ifqstep);
                    LongBlockScalefactors[sbindex]++;
                    let sfbPartition = ScaleFactorBands[SAMPLE_RATE][LONG_BLOCK][sbindex];
                    for(let i = sfbPartition[0]; i <= sfbPartition[1]; i++) {
                        Spectrum[0][i] *= ifqstep;
                    }
                }
            }
            // Aqua_Log(`    已放大长块超限SFB：${sfbsOverXmin}`);

            // 【保存尺度因子】

            let result = {
                "blockType": windowType,
                "scalefactors": LongBlockScalefactors,
                "scalefactorScale": scalefactorScale,
                "scalefactorCompress": 15,
                "part23Length": 0,
                // 以下是内层循环的结果
                "huffman": innerLoopOutput.huffman,
                "globalGain": innerLoopOutput.globalGain,
                "subblockGain": innerLoopOutput.subblockGain,
                "qquant": innerLoopOutput.qquant,
                "quantizedSpectrum576": innerLoopOutput.quantizedSpectrum576
            };

            // 【检查退出条件】
            let isExit = false;

            // 1 所有的尺度因子频带都被放大过？如果是，则退出
            let isAllSfbAmplified = true;
            for(let sb = 0; sb < LongBlockSFBNumber; sb++) {
                if(LongBlockScalefactors[sb] === 0) { isAllSfbAmplified = false; break; }
            }
            if(isAllSfbAmplified === false) {
                // 2 尺度因子的值是否有超过其各自的动态范围？如果有超过，则退出
                let isScalefactorExceeded = false;
                for(let sb = 0; sb <= 10; sb++) {
                    if(LongBlockScalefactors[sb] >= 15) { isScalefactorExceeded = true; break; }
                }
                for(let sb = 11; sb <= 20; sb++) {
                    if(LongBlockScalefactors[sb] >= 7) { isScalefactorExceeded = true; break; }
                }
                if(isScalefactorExceeded === false) {
                    // 3 还有超限的尺度因子频带吗？如果没有，则退出
                    if(sfbsOverXmin.length <= 0) {
                        isExit = true;
                    }
                }
                else {
                    isExit = true;
                }
            }
            else {
                isExit = true;
            }
            //////// EXIT ////////
            if(isExit) {
                let scalefactorCompress = ScalefactorCompress(result.scalefactors, result.blockType);
                let part2Length = Part2Length(scalefactorCompress, result.blockType);
                result.scalefactorCompress = scalefactorCompress;
                result.part23Length = part2Length + result.huffman.codeString.length;
                return result;
            }
        }
        /////////////////////////////
        //  短 块
        /////////////////////////////
        else {
            // 首先将量化后的576点频谱分解为3个192点（量化后的）频谱
            let ShortBlockSpectrums = DemuxShortBlockSpectrum(innerLoopOutput.quantizedSpectrum576);

            // 分别处理每个子块的尺度因子
            for(let window = 0; window < 3; window++) {
                // 跳过已经完成的子块
                if(isFinished[window] === true) {
                    // Aqua_Log(`    短块[${window}]已处理完毕，跳过。`);
                    continue;
                }

                let quantizedShortSpectrum = ShortBlockSpectrums[window];

                // 【计算量化噪声】

                let xfsf = QuantNoise(Spectrum[window], quantizedShortSpectrum, innerLoopOutput.globalGain - 210, SHORT_BLOCK);

                // 【预加重】（暂缓实现）


                // 【对所有超限的SFB放大一步】 C.1.5.4.3.5

                let sfbsOverXmin = new Array(); // 记录超限的SFB的index，用于判断退出条件
                for(let sbindex = 0; sbindex < ShortBlockSFBNumber; sbindex++) {
                    if(xfsf[sbindex] > xminForShort[window][sbindex]) {
                        sfbsOverXmin.push(sbindex);
                        xminForShort[window][sbindex] *= (ifqstep * ifqstep);
                        ShortBlockScalefactors[window][sbindex]++;
                        let sfbPartition = ScaleFactorBands[SAMPLE_RATE][SHORT_BLOCK][sbindex];
                        for(let i = sfbPartition[0]; i <= sfbPartition[1]; i++) {
                            Spectrum[window][i] *= ifqstep;
                        }
                    }
                }
                // Aqua_Log(`    已放大短块[${window}]超限SFB：${sfbsOverXmin}`);

                // 【保存尺度因子】

                // （直接保存在ShortBlockScalefactors）

                // 【检查退出条件】

                // 1 所有的尺度因子频带都被放大过？如果是，则退出
                let isAllSfbAmplified = true;
                for(let sb = 0; sb < LongBlockSFBNumber; sb++) {
                    if(ShortBlockScalefactors[window][sb] === 0) { isAllSfbAmplified = false; break; }
                }
                if(isAllSfbAmplified === true) {
                    isFinished[window] = true;
                    continue;
                }

                // 2 尺度因子的值是否有超过其各自的动态范围？如果有超过，则退出
                let isScalefactorExceeded = false;
                for(let sb = 0; sb <= 5; sb++) {
                    if(ShortBlockScalefactors[window][sb] >= 15) { isScalefactorExceeded = true; break; }
                }
                for(let sb = 5; sb <= 11; sb++) {
                    if(ShortBlockScalefactors[window][sb] >= 7) { isScalefactorExceeded = true; break; }
                }
                if(isScalefactorExceeded === true) {
                    isFinished[window] = true;
                    continue;
                }

                // 3 还有超限的尺度因子频带吗？如果没有，则退出
                if(sfbsOverXmin.length <= 0) {
                    isFinished[window] = true;
                    continue;
                }
            } // 子块循环结束

            // 所有子块都处理完毕
            //////// EXIT ////////
            if(isFinished[0] === true && isFinished[1] === true && isFinished[2] === true) {
                let result = {
                    "blockType": windowType,
                    "scalefactors": ShortBlockScalefactors,
                    "scalefactorScale": scalefactorScale,
                    "scalefactorCompress": 15,
                    "part23Length": 0,
                    // 以下是内层循环的结果
                    "huffman": innerLoopOutput.huffman,
                    "globalGain": innerLoopOutput.globalGain,
                    "subblockGain": innerLoopOutput.subblockGain,
                    "qquant": innerLoopOutput.qquant,
                    "quantizedSpectrum576": innerLoopOutput.quantizedSpectrum576
                };
                // 计算尺度因子长度
                let scalefactorCompress = ScalefactorCompress(result.scalefactors, result.blockType);
                let part2Length = Part2Length(scalefactorCompress, result.blockType);
                result.scalefactorCompress = scalefactorCompress;
                result.part23Length = part2Length + result.huffman.codeString.length;
                return result;
            }

        } // 短块分支结束

        outerLoopCount++;

    } // 一个Granule的噪声控制循环结束
}
