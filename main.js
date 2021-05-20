/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 BD4SUR @ GitHub
//
//  =============================================================
//
//  main.js
//
//    编码器主体流程。
//
/////////////////////////////////////////////////////////////////


/////////////////////////////////////////////////////////////////
//
//  编 码 器 入 口
//
/////////////////////////////////////////////////////////////////

function Aqua_Main(PCM_left, PCM_right, channels, sampleRate, bitRate, onRunning, onFinished) {

    // 编码器初始化
    Aqua_Init(channels, sampleRate, bitRate);

    let frameNumber = Math.ceil(PCM_left.length / 1152);
    console.log(`预计帧数：${frameNumber}`);

    let byteStream = new Array(); // 字节流

    let offset = 0;     // 采样计数
    let frameCount = 0; // 帧计数

    // 帧时钟（使用setInterval实现帧循环，避免阻塞）
    let ENCODER_TIMER = setInterval(() => {

        let startTime = Date.now(); // 计时开始

        // 编码从offset开始的一帧
        let frame = Aqua_EncodeFrame([PCM_left, PCM_right], offset);

        // 将当前帧的比特流拼接到现有比特流后面
        let frameStream = frame.stream;
        for(let i = 0; i < frameStream.length; i++) {
            byteStream.push(frameStream[i]);
        }

        let endTime = Date.now(); // 计时结束

        // 计算编码一帧所需时间
        let duration = endTime - startTime;
        let speed = ((1152 / SAMPLE_RATE_VALUE[SAMPLE_RATE] * 1000) / duration).toFixed(1);

        // 编码结果可视化（onRunning）
        onRunning({
            frameCount: frameCount,
            frameNumber: frameNumber,
            speed: speed,
            PCM: PCM_left,
            offset: offset
        });

        // 更新计数器
        frameCount++;
        offset += 1152;

        // 编码完成
        if(offset >= PCM_left.length) {
            clearInterval(ENCODER_TIMER);

            // 编码结束后保存文件的动作
            onFinished({
                frameNumber: frameNumber,
                byteStream: byteStream
            });

        }
    }, 0);
}


function Aqua_Init(channels, sampleRate, bitRate) {

    // 首先设置声道数、采样率和比特率

    switch(channels) {
        case 1: CHANNELS = 1; break;
        case 2: CHANNELS = 2; break;
        default:    console.error(`Aqua仅支持至多两个声道的立体声（不支持联合立体声）。`); return false;
    }

    switch(sampleRate) {
        case 44100: SAMPLE_RATE = SAMPLE_RATE_44100; break;
        case 48000: SAMPLE_RATE = SAMPLE_RATE_48000; break;
        case 32000: SAMPLE_RATE = SAMPLE_RATE_32000; break;
        default:    console.error(`Aqua不支持采样率 ${sampleRate}Hz。`); return false;
    }

    switch(bitRate) {
        case 320000: BIT_RATE = BIT_RATE_320K; break;
        case 224000: BIT_RATE = BIT_RATE_224K; break;
        case 128000: BIT_RATE = BIT_RATE_128K; break;
        case 64000:  BIT_RATE = BIT_RATE_64K; break;
        default:    console.warn(`Aqua不支持比特率 ${sampleRate}bps。默认设置为320kbps。`); BIT_RATE = BIT_RATE_320K; break;
    }

    // 心理声学模型初始化

    PAM2_Init();

    // 缓存初始化

    for(let ch = 0; ch < CHANNELS; ch++) {
        let zeros = new Array();
        for(let i = 0; i < 32; i++) {
            zeros[i] = new Array();
            for(let j = 0; j < 18; j++) {
                zeros[i][j] = 0;
            }
        }
        BUFFER[ch] = {
            "PREV_BLOCK_TYPE": WINDOW_NORMAL,
            "PREV_SUBBANDS": zeros
        };
    }

    // MDCT系数初始化

    for(i = 0; i < 18; i++) {
        for(let k = 0; k < 36; k++) {
            MDCT_FACTOR_36[i * 36 + k] = Math.cos(Math.PI * (2 * k + 1 + 18) * (2 * i + 1) / (2 * 36));
        }
    }
    for(i = 0; i < 6; i++) {
        for(let k = 0; k < 12; k++) {
            MDCT_FACTOR_12[i * 12 + k] = Math.cos(Math.PI * (2 * k + 1 + 6) * (2 * i + 1) / (2 * 12));
        }
    }

    // 量化公式使用的数表 初始化

    for(let i = 0; i < 512; i++) {
        POWER_OF_ROOT_2_4[i] = Math.pow(ROOT_2_4, (i - 256));
        INV_POWER_OF_ROOT_2_4[i] = 1.0 / POWER_OF_ROOT_2_4[i];
    }

    // 哈夫曼表初始化

    for(let i = 0; i < 32; i++) {
        HTABLES[i] = new Array();
        if(!HuffmanTableDuple[i]) continue;
        let htmap = HuffmanTableDuple[i].table;
        for(let key in htmap) {
            let x = parseInt(key.split(" ")[0]);
            let y = parseInt(key.split(" ")[1]);
            HTABLES[i][x * 16 + y] = htmap[key];
        }
        HuffmanTableDuple[i].table = HTABLES[i];
    }

    return true;

}

/////////////////////////////////////////////////////////////////
//
//  编 码 一 帧 （含 两 个 granule）
//
/////////////////////////////////////////////////////////////////

function Aqua_EncodeFrame(PCMs, offset) {

    let mainDataBegin = RESERVOIR_SIZE;

    // 帧间距（bits）
    let frameLength = Math.floor((BIT_RATE_VALUE[BIT_RATE] * 1152 / SAMPLE_RATE_VALUE[SAMPLE_RATE]) / 8) * 8; // 变为8的倍数

    // 每个Granule的平均长度（含所有声道，bits）
    let sideLength = (CHANNELS >= 2) ? 256 : 136;
    let meanBitsPerGranule = (frameLength - sideLength - 32) / 2; // Header 32bits, SideInfo 256bits(dual)/136bits(mono)

    // 设置比特储备的最大容量
    SetReservoirMax();

    // 分别编码两个granules
    let granule0 = EncodeGranule(PCMs, offset, meanBitsPerGranule);
    let granule1 = EncodeGranule(PCMs, offset + 576, meanBitsPerGranule);

    // 检查比特储备池的容量，使用多余的比特对granule作填充
    RegulateAndStuff([granule0, granule1]);

    // p22 对于44100Hz情况，要计算isPadding
    let isPadding = false;
    let rest = 0;
    if(offset > 0) {
        let dif = (144 * BIT_RATE_VALUE[BIT_RATE] % SAMPLE_RATE_VALUE[SAMPLE_RATE]);
        rest -= dif;
        if(rest < 0) {
            isPadding = true;
            rest += SAMPLE_RATE_VALUE[SAMPLE_RATE];
        }
        else {
            isPadding = false;
        }
    }

    // 组装比特流
    let frameStream = FormatFrameBitStream([granule0, granule1], isPadding, mainDataBegin);

    return {
        granules: [granule0, granule1],
        stream: frameStream
    };
}

/////////////////////////////////////////////////////////////////
//
//  编 码 一 个 Granule （含 一 个 或 两 个 声 道）
//
/////////////////////////////////////////////////////////////////

function EncodeGranule(PCMs, offset, meanBitsPerGranule) {
    let channels = new Array();
    for(let ch = 0; ch < CHANNELS; ch++) {
        LOG(`【Channel ${ch}】`);
        let channel = EncodeChannel(PCMs[ch], offset, meanBitsPerGranule / CHANNELS, BUFFER[ch]);
        channels.push(channel);
    }
    return channels;
}

/////////////////////////////////////////////////////////////////
//
//  编 码 一 个 声 道 （主 要 流 程）
//
/////////////////////////////////////////////////////////////////

function EncodeChannel(PCM, offset, meanBitsPerChannel, buffer) {

    //////////////////////////////////
    //  分 析 子 带 滤 波
    //////////////////////////////////

    let subbands = AnalysisSubbandFilter(PCM, offset);

    //////////////////////////////////
    //  心 理 声 学 模 型 （尚未实现）
    //////////////////////////////////

    let perceptualEntropy = 0;
    let isAttack = (Math.random() > 0.9) ? true : false;
    let blockType = SwitchWindowType(buffer.PREV_BLOCK_TYPE, isAttack);
    let xmin = new Array();
    for(let i = 0; i < 21; i++) { // 应当区分长短块
        xmin[i] = Number.MAX_VALUE; // 暂时禁用心理声学模型
    }

    //////////////////////////////////
    //  时 频 变 换
    //////////////////////////////////

    let Spectrum = GranuleMDCT(subbands, buffer.PREV_SUBBANDS, blockType); // TODO

    //////////////////////////////////
    //  分 配 比 特 预 算
    //////////////////////////////////

    // LOG(`当前比特储备：${RESERVOIR_SIZE}`);
    let budget = AllocateBudget(perceptualEntropy, meanBitsPerChannel);
    // LOG(`当前Channel分配的比特预算（part2 & 3） = ${budget} bits`);
    let huffmanBudget = budget - ((blockType !== WINDOW_SHORT) ? 74 : 126); // 假设尺度因子全满的情况下，扣除尺度因子所使用的比特，剩余的预算分配给part3（哈夫曼编码）
    // LOG(`当前Channel分配的比特预算（only part3）= ${huffmanBudget} bits`);

    //////////////////////////////////
    //  量 化 循 环
    //////////////////////////////////

    let outerLoopOutput = OuterLoop(Spectrum, blockType, huffmanBudget, xmin);

    //////////////////////////////////
    //  构 造 编 码 结 果
    //////////////////////////////////

    let channel = {
        "part23Length": outerLoopOutput.part23Length,
        "bigvalues": outerLoopOutput.huffman.bigvalues,
        "globalGain": outerLoopOutput.globalGain,
        "scalefactorCompress": outerLoopOutput.scalefactorCompress,
        "windowSwitchingFlag": (blockType === WINDOW_NORMAL) ? "0" : "1",
        "blockType": blockType,

        "tableSelect": outerLoopOutput.huffman.bigvalueTableSelect,
        "subblockGain": outerLoopOutput.subblockGain,
        "region0Count": outerLoopOutput.huffman.region0Count,
        "region1Count": outerLoopOutput.huffman.region1Count,

        "count1TableSelect": outerLoopOutput.huffman.smallvalueTableSelect,
        // Part 2
        "scalefactors": outerLoopOutput.scalefactors,
        // Part 3
        "huffmanCodeBits": outerLoopOutput.huffman.codeString,

        "spectrum": outerLoopOutput.quantizedSpectrum576
    };

    //////////////////////////////////
    //  返 还 剩 余 比 特
    //////////////////////////////////

    ReturnUnusedBits(channel.part23Length, meanBitsPerChannel);

    //////////////////////////////////
    //  保 存 前 一 granule 结 果
    //////////////////////////////////

    buffer.PREV_SUBBANDS = subbands;
    buffer.PREV_BLOCK_TYPE = blockType;

    return channel;

}
