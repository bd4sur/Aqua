
let PCM;
let AudioContext = new window.AudioContext();
let filteredLeft, filteredRight;

let rawAudioData;

let fileSelector = document.getElementById('fileSelector');
fileSelector.onchange = () => {
    let file = fileSelector.files[0];
    let Reader = new FileReader();
    Reader.onloadend = () => {
        rawAudioData = Reader.result;
    }
    Reader.readAsArrayBuffer(file);
};

function Render(rawAudioData, cutoffFreq) {
    AudioContext.decodeAudioData(rawAudioData, (audioBuffer) => {
        // 获取两个声道的原始数据
        let SampleRate = audioBuffer.sampleRate;
        let leftChannel  = audioBuffer.getChannelData(0);
        let rightChannel = audioBuffer.getChannelData(1);

        let AudioBufferSourceNode = AudioContext.createBufferSource();
        AudioBufferSourceNode.connect(AudioContext.destination);
        AudioBufferSourceNode.buffer = audioBuffer;
        AudioBufferSourceNode.start(0);

        MPEG(leftChannel);
/*
        let StartTime = AudioContext.currentTime;

        let timer = setInterval(() => {
            let offset = Math.round((AudioContext.currentTime - StartTime) * SampleRate);
            $("#timer").html(`${offset} / ${leftChannel.length} (${(offset / leftChannel.length * 100).toFixed(1)}%)`);
            $("#progressbar").css("width", `${(offset / leftChannel.length * 100).toFixed(2)}%`);

            // 滤波器组
            let subbands = AnalysisSubbandFilter(leftChannel, offset);

            // 绘制
            for(let i = 0; i < 32; i++) {
                DrawFrame(cvs[i], i, subbands[i]);
            }

            if(offset >= leftChannel.length) {
                AudioBufferSourceNode.stop();
                clearInterval(timer);
                $("#playLabel").html("播放");
                $("#ThrobberPlaying").hide();
                $("#play").attr("data-state", "stopped");
            }

        }, 10);
*/
    });
}

$("#play").click(() => {
    let cutoff = parseFloat($("#cutoff").val());

    let state = $("#play").attr("data-state");
    if(state === "stopped") {
        $("#playLabel").html("暂停");
        $("#ThrobberPlaying").show();
        Render(rawAudioData, cutoff);
        $("#play").attr("data-state", "playing");
    }
    else if(state === "playing") {
        AudioContext.suspend();
        $("#playLabel").html("继续播放");
        $("#ThrobberPlaying").hide();
        $("#play").attr("data-state", "pausing");
    }
    else if(state === "pausing") {
        AudioContext.resume();
        $("#playLabel").html("暂停");
        $("#ThrobberPlaying").show();
        $("#play").attr("data-state", "playing");
    }
});

MPEG(PCMData);

/**
 * 按照时间顺序，依次处理每个Granule
 */

function MPEG(PCMData) {

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
        let isAttack = (Math.random() > 0.5) ? true : false;
        currentWindowType = SwitchWindowType(prevWindowType, isAttack);
        console.log(`[Granule_${GranuleCount}] 窗口类型：${currentWindowType}`);

        // 时频变换：可能是长块，可能是短块，由currentWindowType决定。
        let Spectrum = CalculateGranuleSpectrum(currentGranuleSubbands, prevGranuleSubbands, currentWindowType);

        // 量化（内层循环：码率控制循环）
        console.log(`[Granule_${GranuleCount}] === 内层循环开始 ===`);
        let globalGain;
        let huffman;
        let QuantizedSpectrum576;
        for(let qquant = 0; qquant < 256; qquant++) { // global_gain为8bit
            let quantanf;
            // 长块
            if(currentWindowType !== WINDOW_SHORT) {
                // 量化
                let LongBlockSpectrum = Spectrum[0];
                let QuantizedLongBlockSpectrum = new Array();
                quantanf = 8 * Math.log(SFM(LongBlockSpectrum));
                for(let i = 0; i < LongBlockSpectrum.length; i++) {
                    let xr = LongBlockSpectrum[i];
                    QuantizedLongBlockSpectrum[i] = Math.sign(xr) * Quantize(xr, quantanf + qquant);
                }
                QuantizedSpectrum576 = QuantizedLongBlockSpectrum;

                globalGain = quantanf + qquant + 210;
            }
            // 短块
            else {
                let subblockGain = new Array()
                let QuantizedShortBlockSpectrum = new Array();
                // 对每个短块作量化
                for(let w = 0; w < 3; w++) {
                    let SubblockSpectrum = Spectrum[w];
                    let QuantizedSubblockSpectrum = new Array();
                    quantanf = 8 * Math.log(SFM(SubblockSpectrum));
                    for(let i = 0; i < SubblockSpectrum.length; i++) {
                        let xr = SubblockSpectrum[i];
                        QuantizedSubblockSpectrum[i] = Math.sign(xr) * Quantize(xr, quantanf + qquant);
                    }
                    QuantizedShortBlockSpectrum[w] = QuantizedSubblockSpectrum;

                    subblockGain[w] = quantanf + qquant + 210;
                }
                // 将短块频谱重排成连续的576点频谱
                let ReorderedQuantizedShortBlockSpectrum = ReorderShortBlockSpectrum(QuantizedShortBlockSpectrum);
                QuantizedSpectrum576 = ReorderedQuantizedShortBlockSpectrum;

                /**
                 * TODO 不清楚subblockGain是如何计算的，以及subblockGain与globalGain的关系。因此这里用三个子块的量化参数的最大值代替整个短块granule的globalGain。
                 * 至于globalGain与每个子块的实际量化参数之间的差异，由scalefactor来抵消掉。
                 */ 
                globalGain = Math.max(subblockGain[0], subblockGain[1], subblockGain[2]);
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
                    console.log(`[Granule_${GranuleCount}] globalGain：${globalGain}`);
                    console.log(`[Granule_${GranuleCount}] 编码结果：`);
                    console.log(huffman);
                    console.log(`[Granule_${GranuleCount}] === 内层循环结束 ===`);
                    break; // 满足条件退出
                }
            }
        }

        // 反量化
        /*
        function ReQuantize(ix, globalGain) {
            let xr = new Array();
            for(let i = 0; i < ix.length; i++) {
                xr[i] = Math.sign(ix[i]) * Math.pow(Math.abs(ix[i]), (4/3)) * Math.pow(ROOT_2_4, globalGain - 210);
            }
            return xr;
        }

        if(currentWindowType !== WINDOW_SHORT) {
            let ReQuantized = ReQuantize(QuantizedSpectrum576, globalGain);
            // console.log(`[Granule_${GranuleCount}] 反量化结果：`);
            // console.log(ReQuantized);

            let ratio = new Array();
            for(let i = 0; i < 576; i++) {
                ratio[i] = ReQuantized[i] / Spectrum[0][i];
            }
            console.log(`[Granule_${GranuleCount}] 反量化比值：`);
            console.log(ratio);
        }
        else {
            let ReQuantized = ReQuantize(QuantizedSpectrum576, globalGain);
            let reconstructedRequantized = ReconstructShortBlockSpectrum(ReQuantized);
            for(let w = 0; w < 3; w++) {
                let ratio = new Array();
                for(let i = 0; i < 192; i++) {
                    ratio[i] = reconstructedRequantized[w][i] / Spectrum[w][i];
                }
                console.log(`[Granule_${GranuleCount}] 块[${w}]反量化比值：`);
                console.log(ratio);
            }
        }
        */



        // 计算量化误差
        if(currentWindowType !== WINDOW_SHORT) {
            let distortion = CalculateQuantDistortion(Spectrum[0], QuantizedSpectrum576, globalGain - 210, LONG_BLOCK);
            console.log(`[Granule_${GranuleCount}] 长块量化误差：`);
            console.log(distortion);
        }
        else {
            let reconstructedQuantized = ReconstructShortBlockSpectrum(QuantizedSpectrum576);
            let distortion0 = CalculateQuantDistortion(Spectrum[0], reconstructedQuantized[0], globalGain - 210, SHORT_BLOCK);
            let distortion1 = CalculateQuantDistortion(Spectrum[1], reconstructedQuantized[1], globalGain - 210, SHORT_BLOCK);
            let distortion2 = CalculateQuantDistortion(Spectrum[2], reconstructedQuantized[2], globalGain - 210, SHORT_BLOCK);
            // console.log(`[Granule_${GranuleCount}] 短块量化误差：`);
            console.log(distortion0);
            console.log(distortion1);
            console.log(distortion2);
        }

        console.log(`=============================================================`);

        prevGranuleSubbands = currentGranuleSubbands;
        prevWindowType = currentWindowType;
        GranuleCount++;
    }
}