
/**
 * 按照时间顺序，依次处理每个Granule
 */

let GranuleCount = 0;
let prevWindowType = WINDOW_NORMAL, currentWindowType;
let prevGranuleSubbands = new Array(), currentGranuleSubbands;
for(let i = 0; i < 32; i++) {
    prevGranuleSubbands[i] = new Array();
    for(let j = 0; j < 18; j++) {
        prevGranuleSubbands[i][j] = 0;
    }
}

for(let GranuleOffset = 0; GranuleOffset < PCMData.length; GranuleOffset += GRANULE_LENGTH) {
    // 分析子带滤波
    currentGranuleSubbands = AnalysisSubbandFilter(PCMData, GranuleOffset);

    // 心理声学模型（待实现）
    let isAttack = (Math.random() > 0.8) ? true : false;
    currentWindowType = SwitchWindowType(prevWindowType, isAttack);
    console.log(`[Granule_${GranuleCount}] 窗口类型：${currentWindowType}`);

    // 时频变换：可能是长块，可能是短块，由currentWindowType决定。
    let Spectrum = CalculateGranuleSpectrum(currentGranuleSubbands, prevGranuleSubbands, currentWindowType);

    // 量化（内层循环：码率控制循环）
    let quantStep;
    let huffman;
    let QuantizedSpectrum576;
    for(let qquant = 0; qquant < 100; qquant++) { // 100可以理解成超时阈值
        // 长块
        if(currentWindowType !== WINDOW_SHORT) {
            // 量化
            let LongBlockSpectrum = Spectrum[0];
            let QuantizedLongBlockSpectrum = new Array();
            let quantanf = SYSTEM_CONSTANT * Math.log(SFM(LongBlockSpectrum));
            quantStep = quantanf + qquant;
            for(let i = 0; i < LongBlockSpectrum.length; i++) {
                QuantizedLongBlockSpectrum[i] = Quantize(LongBlockSpectrum[i], quantStep);
            }
            QuantizedSpectrum576 = QuantizedLongBlockSpectrum;
            // console.log(`量化后的长块频谱：`);
            // console.log(QuantizedLongBlockSpectrum);
        }
        // 短块
        else {
            let QuantizedShortBlockSpectrum = new Array();
            // 对每个短块作量化
            for(let w = 0; w < 3; w++) {
                let SubblockSpectrum = Spectrum[w];
                let QuantizedSubblockSpectrum = new Array();
                let quantanf = SYSTEM_CONSTANT * Math.log(SFM(SubblockSpectrum));
                quantStep = quantanf + qquant;
                for(let i = 0; i < SubblockSpectrum.length; i++) {
                    QuantizedSubblockSpectrum[i] = Quantize(SubblockSpectrum[i], quantStep);
                }
                QuantizedShortBlockSpectrum[w] = QuantizedSubblockSpectrum;
            }
            // 将短块频谱重排成连续的576点频谱
            let ReorderedQuantizedShortBlockSpectrum = ReorderShortBlockSpectrum(QuantizedShortBlockSpectrum);
            QuantizedSpectrum576 = ReorderedQuantizedShortBlockSpectrum;
            // console.log(`量化后的短块频谱：`);
            // console.log(QuantizedShortBlockSpectrum);
        }

        // 哈夫曼编码
        huffman = HuffmanEncodeQuantizedSpectrum(QuantizedSpectrum576);

        // 检查编码结果
        if(huffman === null) {
            continue; // 重新量化
        }
        else {
            if(huffman.CodeString.length < 2000) {
                console.log(`[Granule_${GranuleCount}] 量化步数qquant：${qquant}`);
                console.log(`[Granule_${GranuleCount}] Huffman码长：${huffman.CodeString.length}`);
                break; // 满足条件退出
            }
        }
    }

    console.log(`[Granule_${GranuleCount}] 编码结果：`);
    console.log(huffman);

    // 计算量化误差
    if(currentWindowType !== WINDOW_SHORT) {
        let distortion = CalculateQuantDistortion(Spectrum[0], QuantizedSpectrum576, quantStep, LONG_BLOCK);
        console.log(`[Granule_${GranuleCount}] 长块量化误差：`);
        console.log(distortion);
    }
    // else {
    //     let distortion0 = CalculateQuantDistortion(Spectrum[0], QuantizedSpectrum576, quantStep, LONG_BLOCK);
    //     let distortion1 = CalculateQuantDistortion(Spectrum[1], QuantizedSpectrum576, quantStep, LONG_BLOCK);
    //     let distortion2 = CalculateQuantDistortion(Spectrum[2], QuantizedSpectrum576, quantStep, LONG_BLOCK);
    //     console.log(`长块量化误差：`);
    //     console.log(distortion);
    // }

    console.log(`=============================================================`);

    prevGranuleSubbands = currentGranuleSubbands;
    prevWindowType = currentWindowType;
    GranuleCount++;
}
