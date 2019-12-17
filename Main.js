
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
        LOG(`[Granule_${GranuleCount}] 窗口类型：${currentWindowType}`);
        let xmin = new Array();
        for(let i = 0; i < 21; i++) { // 应当区分长短块
            xmin[i] = 1e-6;
        }

        // 时频变换：可能是长块，可能是短块，由currentWindowType决定。
        let Spectrum = CalculateGranuleSpectrum(currentGranuleSubbands, prevGranuleSubbands, currentWindowType);
        // LOG(`[Granule_${GranuleCount}] 频谱：`);
        // LOG(Spectrum);

        // 平均每个Granule的长度
        let MeanBitsPerGranule = Math.round(BIT_RATES[BIT_RATE] * 576 / SAMPLE_RATES[SAMPLE_RATE]);

        LOG(`[Granule_${GranuleCount}] 平均每个Granule的比特数 = ${MeanBitsPerGranule}`);
        LOG(`[Granule_${GranuleCount}] 外层循环开始`);
        let sf = OuterLoop(Spectrum, currentWindowType, MeanBitsPerGranule, xmin);
        LOG(`[Granule_${GranuleCount}] 外层循环结束：`);
        LOG(`    ★ 哈夫曼码长：${sf.QuantizationResult.huffman.CodeString.length}`);
        LOG(`    ★ GlobalGain：${sf.QuantizationResult.globalGain}`);
        LOG(`    ★ 量化步数：${sf.QuantizationResult.qquant}`);
        if(currentWindowType === WINDOW_SHORT) {
            LOG(`    ★ 尺度因子(短块0)：${sf.Scalefactors[0]}`);
            LOG(`    ★ 尺度因子(短块1)：${sf.Scalefactors[1]}`);
            LOG(`    ★ 尺度因子(短块2)：${sf.Scalefactors[2]}`);
        }
        else {
            LOG(`    ★ 尺度因子：${sf.Scalefactors}`);
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
        */

        LOG(`=============================================================`);

        prevGranuleSubbands = currentGranuleSubbands;
        prevWindowType = currentWindowType;
        GranuleCount++;
    }
}