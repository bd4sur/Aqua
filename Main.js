
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

    // 帧间距（bits）
    let frameLength = Math.round(BIT_RATES[BIT_RATE] * 1152 / SAMPLE_RATES[SAMPLE_RATE]);
    LOG(`帧间距：${frameLength} bits`);
    // 每个Granule的平均长度（含所有声道，bits）
    let meanBitsPerGranule = (frameLength - 256) / 2;
    LOG(`Granule平均长度：${meanBitsPerGranule} bits`);
    // 设置比特储备的最大容量
    SetReservoirMax(frameLength);
    LOG(`最大比特储备：${RESERVOIR_MAX} bits`);

    for(let GranuleOffset = 0; GranuleOffset < PCMData.length; GranuleOffset += GRANULE_LENGTH) {

        // 分析子带滤波
        currentGranuleSubbands = AnalysisSubbandFilter(PCMData, GranuleOffset);

        // 心理声学模型（待实现）
        let isAttack = (Math.random() > 0.5) ? true : false;
        let perceptualEntropy = 470;
        currentWindowType = SwitchWindowType(prevWindowType, isAttack);
        LOG(`[Granule_${GranuleCount}] 窗口类型：${currentWindowType}`);
        let xmin = new Array();
        for(let i = 0; i < 21; i++) { // 应当区分长短块
            xmin[i] = 1e-6;
        }

        // 时频变换：可能是长块，可能是短块，由currentWindowType决定。
        let Spectrum = CalculateGranuleSpectrum(currentGranuleSubbands, prevGranuleSubbands, currentWindowType);

        // TODO 判断是否是全0的频谱

        // 考虑比特池机制后计算得到的平均每Granule最大比特数
        let budget = AllocateGranuleBudget(perceptualEntropy, meanBitsPerGranule);

        LOG(`当前比特储备：${RESERVOIR_SIZE}`);

        LOG(`[Granule_${GranuleCount}] 当前Granule分配的比特预算（part2 & 3） = ${budget} bits`);
        let huffmanBudget = budget - ((currentWindowType !== WINDOW_SHORT) ? 74 : 126); // 假设尺度因子全满的情况下，扣除尺度因子所使用的比特，剩余的预算分配给part3（哈夫曼编码）
        LOG(`[Granule_${GranuleCount}] 当前Granule分配的比特预算（only part3）= ${huffmanBudget} bits`);
        // LOG(`[Granule_${GranuleCount}] 外层循环开始`);
        let outerLoopOutput = OuterLoop(Spectrum, currentWindowType, huffmanBudget, xmin);
        // LOG(`[Granule_${GranuleCount}] 外层循环结束：`);

        // 计算尺度因子长度
        let part2Length = 0;
        let scalefactorCompress = 15;
        if(currentWindowType !== WINDOW_SHORT) {
            scalefactorCompress = CalculateScalefactorCompress(outerLoopOutput.scalefactors, currentWindowType);
            let slens = SF_COMPRESS_INDEX[scalefactorCompress];
            part2Length = 11 * slens[0] + 10 * slens[1];
        }
        else if(currentWindowType === WINDOW_SHORT) {
            let scalefactorCompress_0 = CalculateScalefactorCompress(outerLoopOutput.scalefactors[0], currentWindowType);
            let scalefactorCompress_1 = CalculateScalefactorCompress(outerLoopOutput.scalefactors[1], currentWindowType);
            let scalefactorCompress_2 = CalculateScalefactorCompress(outerLoopOutput.scalefactors[2], currentWindowType);
            // TODO 不能简单地通过比较序号大小来选择长度最大的序号，此处待改进
            scalefactorCompress = Math.max(scalefactorCompress_0, scalefactorCompress_1, scalefactorCompress_2);
            let slens = SF_COMPRESS_INDEX[scalefactorCompress];
            part2Length = (6 * slens[0] + 6 * slens[1]) * 3;
        }

        ////////////////////////
        // 构建Granule
        ////////////////////////

        let granule = new Granule(currentWindowType);

        // Part 1
        granule.scfsi = [0,0,0,0];
        granule.part23Length = part2Length + outerLoopOutput.huffman.codeString.length;
        granule.bigvalues = outerLoopOutput.huffman.bigvalues;
        granule.globalGain = outerLoopOutput.globalGain;
        granule.scalefactorCompress = scalefactorCompress;

        if(granule.windowSwitchingFlag === 1) {
            granule.tableSelect = outerLoopOutput.huffman.bigvalueTableSelect;
            granule.subblockGain = outerLoopOutput.subblockGain;
        }
        else {
            granule.tableSelect = outerLoopOutput.huffman.bigvalueTableSelect;
            granule.region0Count = outerLoopOutput.huffman.region0Count;
            granule.region1Count = outerLoopOutput.huffman.region1Count;
        }
        granule.count1TableSelect = outerLoopOutput.huffman.smallvalueTableSelect;

        // Part 2
        granule.scalefactors = outerLoopOutput.scalefactors;

        // Part 3
        granule.huffman = outerLoopOutput.huffman.codeString;



        LOG(`    ★ Part23Length：${granule.part23Length}`);
        LOG(`    ★ GlobalGain：${granule.globalGain}`);
        LOG(`    ★ 量化步数：${outerLoopOutput.qquant}`);
        if(currentWindowType === WINDOW_SHORT) {
            LOG(`    ★ 尺度因子(短块0)：${granule.scalefactors[0]}`);
            LOG(`    ★ 尺度因子(短块1)：${granule.scalefactors[1]}`);
            LOG(`    ★ 尺度因子(短块2)：${granule.scalefactors[2]}`);
        }
        else {
            LOG(`    ★ 尺度因子：${granule.scalefactors}`);
        }
        LOG(granule);

        // 将预算内没用完的比特 回馈给比特储备池
        AdjustReservoirSize(granule.part23Length, meanBitsPerGranule);

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