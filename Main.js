
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

/**
 * 编码器的全局缓存（可优化）
 */

let PREV_BLOCK_TYPE = WINDOW_NORMAL;
let PREV_SUBBANDS = new Array();
for(let i = 0; i < 32; i++) {
    PREV_SUBBANDS[i] = new Array();
    for(let j = 0; j < 18; j++) {
        PREV_SUBBANDS[i][j] = 0;
    }
}

function MPEG(PCMData) {

    for(let offset = 0; offset < PCMData.length; offset += FRAME_LENGTH) {

        EncodeFrame([PCMData, PCMData], offset);

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

    }
}

MPEG(PCMData);

function EncodeFrame(PCMs, offset) {
    // 帧间距（bits）
    let frameLength = Math.round(BIT_RATES[BIT_RATE] * 1152 / SAMPLE_RATES[SAMPLE_RATE]);
    LOG(`帧间距：${frameLength} bits`);
    // 每个Granule的平均长度（含所有声道，bits）
    let meanBitsPerGranule = (frameLength - 256) / 2;
    LOG(`Granule平均长度：${meanBitsPerGranule} bits`);
    // 每个Channel的平均长度（bits）
    let meanBitsPerChannel = meanBitsPerGranule / CHANNELS;
    LOG(`Channel平均长度：${meanBitsPerChannel} bits`);

    // 设置比特储备的最大容量
    SetReservoirMax(frameLength);
    LOG(`最大比特储备：${RESERVOIR_MAX} bits`);

    LOG(`【Granule 0】`);
    let granule0 = EncodeGranule(PCMs, offset, meanBitsPerGranule);
    LOG(`【Granule 1】`);
    let granule1 = EncodeGranule(PCMs, offset + GRANULE_LENGTH, meanBitsPerGranule);

    // TODO 这里需要检查比特储备池的容量，适时对granule作填充，待实现

    return [granule0, granule1];
}

function EncodeGranule(PCMs, offset, meanBitsPerGranule) {
    let channel0 = EncodeChannel(PCMs[0], offset, meanBitsPerGranule / CHANNELS);
    let channel1 = EncodeChannel(PCMs[1], offset, meanBitsPerGranule / CHANNELS);
    return [channel0, channel1];
}


function EncodeChannel(PCM, offset, meanBitsPerChannel) {

    //////////////////////////////////
    //  分 析 子 带 滤 波
    //////////////////////////////////

    let subbands = AnalysisSubbandFilter(PCM, offset);
    PREV_SUBBANDS = subbands; // TODO

    //////////////////////////////////
    //  心 理 声 学 模 型（ 待 实 现 ）
    //////////////////////////////////

    let isAttack = (Math.random() > 0.5) ? true : false;
    let perceptualEntropy = 470;
    let blockType = SwitchWindowType(PREV_BLOCK_TYPE, isAttack);
    LOG(`窗口类型：${blockType}`);
    let xmin = new Array();
    for(let i = 0; i < 21; i++) { // 应当区分长短块
        xmin[i] = 1e-4;
    }
    PREV_BLOCK_TYPE = blockType;

    //////////////////////////////////
    //  时 频 变 换
    //////////////////////////////////

    let Spectrum = CalculateGranuleSpectrum(subbands, PREV_SUBBANDS, blockType); // TODO

    // TODO 判断是否是全0的频谱

    //////////////////////////////////
    //  分 配 比 特 预 算
    //////////////////////////////////

    LOG(`当前比特储备：${RESERVOIR_SIZE}`);
    let budget = AllocateBudget(perceptualEntropy, meanBitsPerChannel);
    LOG(`当前Channel分配的比特预算（part2 & 3） = ${budget} bits`);
    let huffmanBudget = budget - ((blockType !== WINDOW_SHORT) ? 74 : 126); // 假设尺度因子全满的情况下，扣除尺度因子所使用的比特，剩余的预算分配给part3（哈夫曼编码）
    LOG(`当前Channel分配的比特预算（only part3）= ${huffmanBudget} bits`);

    //////////////////////////////////
    //  量 化 循 环
    //////////////////////////////////

    let outerLoopOutput = OuterLoop(Spectrum, blockType, huffmanBudget, xmin);

    //////////////////////////////////
    //  计 算 尺 度 因 子 长 度
    //////////////////////////////////

    let part2Length = 0;
    let scalefactorCompress = 15;
    if(blockType !== WINDOW_SHORT) {
        scalefactorCompress = CalculateScalefactorCompress(outerLoopOutput.scalefactors, blockType);
        let slens = SF_COMPRESS_INDEX[scalefactorCompress];
        part2Length = 11 * slens[0] + 10 * slens[1];
    }
    else if(blockType === WINDOW_SHORT) {
        let scalefactorCompress_0 = CalculateScalefactorCompress(outerLoopOutput.scalefactors[0], blockType);
        let scalefactorCompress_1 = CalculateScalefactorCompress(outerLoopOutput.scalefactors[1], blockType);
        let scalefactorCompress_2 = CalculateScalefactorCompress(outerLoopOutput.scalefactors[2], blockType);
        // TODO 不能简单地通过比较序号大小来选择长度最大的序号，此处待改进
        scalefactorCompress = Math.max(scalefactorCompress_0, scalefactorCompress_1, scalefactorCompress_2);
        let slens = SF_COMPRESS_INDEX[scalefactorCompress];
        part2Length = (6 * slens[0] + 6 * slens[1]) * 3;
    }

    //////////////////////////////////
    //  构 造 编 码 结 果
    //////////////////////////////////

    let channel = {
        "part23Length": part2Length + outerLoopOutput.huffman.codeString.length,
        "bigvalues": outerLoopOutput.huffman.bigvalues,
        "globalGain": outerLoopOutput.globalGain,
        "scalefactorCompress": scalefactorCompress,
        "windowSwitchingFlag": (blockType === WINDOW_NORMAL) ? 0 : 1,
        "blockType": blockType,

        "tableSelect": outerLoopOutput.huffman.bigvalueTableSelect,
        "subblockGain": outerLoopOutput.subblockGain,
        "region0Count": outerLoopOutput.huffman.region0Count,
        "region1Count": outerLoopOutput.huffman.region1Count,

        "count1TableSelect": outerLoopOutput.huffman.smallvalueTableSelect,
        // Part 2
        "scalefactors": outerLoopOutput.scalefactors,
        // Part 3
        "huffmanCodeBits": outerLoopOutput.huffman.codeString
    };


    LOG(`    ★ Part23Length：${channel.part23Length}`);
    LOG(`    ★ GlobalGain：${channel.globalGain}`);
    LOG(`    ★ 量化步数：${outerLoopOutput.qquant}`);
    if(channel.blockType === WINDOW_SHORT) {
        LOG(`    ★ 尺度因子(短块0)：${channel.scalefactors[0]}`);
        LOG(`    ★ 尺度因子(短块1)：${channel.scalefactors[1]}`);
        LOG(`    ★ 尺度因子(短块2)：${channel.scalefactors[2]}`);
    }
    else {
        LOG(`    ★ 尺度因子：${channel.scalefactors}`);
    }
    LOG(channel);

    // 将预算内没用完的比特 回馈给比特储备池
    AdjustReservoirSize(channel.part23Length, meanBitsPerChannel);

    return channel;
}
