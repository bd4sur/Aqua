



/////////////////////////////////////////////////////////////////
//
//  全 局 缓 存 （ 含 心 理 声 学 模 型 缓 存 ）
//
/////////////////////////////////////////////////////////////////

let BUFFER = new Array();

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

/////////////////////////////////////////////////////////////////
//
//  编 码 器 入 口
//
/////////////////////////////////////////////////////////////////

function Aqua_MP3_Encoder(PCM_left, PCM_right, filename) {

    let STREAM = new Array(); // 字节流
    let frameCount = 0;

    let ENCODER_TIMER; // 帧时钟（使用setInterval实现帧循环，避免阻塞）

    // 心理声学模型初始化
    PAM2_Init();

    console.log(`采样率：${SAMPLE_RATE_VALUE[SAMPLE_RATE]}Hz`);
    let frameNumber = Math.ceil(PCM_left.length / 1152);
    console.log(`预计帧数：${frameNumber}`);

    let offset = 0;

    ENCODER_TIMER = setInterval(() => {
        // console.log(`正在处理第 ${frameCount} / ${frameNumber} 帧`);

        let startTime = Date.now();

        let mainDataBegin = RESERVOIR_SIZE;
        let frame = EncodeFrame([PCM_left, PCM_right], offset);

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

        let frameStream = FormatFrameBitStream(frame, isPadding, mainDataBegin);

        // 将当前帧的比特流追加到现有比特流后面
        for(let i = 0; i < frameStream.length; i++) {
            STREAM.push(frameStream[i]);
        }

        let endTime = Date.now();

        let duration = endTime - startTime;
        let speed = ((1152 / SAMPLE_RATE_VALUE[SAMPLE_RATE] * 1000) / duration).toFixed(1);

        $("#timer").html(`${(frameCount / frameNumber * 100).toFixed(1)}% (${frameCount}/${frameNumber})`);
        $("#speed").html(`${speed}x`);
        $("#progressbar").css("width", `${(frameCount / frameNumber * 100).toFixed(2)}%`);

        // 绘制576点频谱
        cv.Clear();
        cv.SetBackgroundColor("#fff");

        // 频谱
        // let spect = frame[0][0].spectrum;
        // let index = 0;
        // for(let x = 0; x < 576; x++) {
        //     cv.Line([x, 0], [x, spect[index]], "#0af");
        //     index++;
        // }

        // 波形
        let window = PCM_left.slice(offset, offset + 1152);
        let index = 0;
        for(let x = 1; x < 1152; x++) {
            cv.Line([x-1, window[index-1]], [x, window[index]], "#0af");
            index++;
        }

        LOG(`=============================================================`);
        frameCount++;
        offset += 1152;

        if(offset >= PCM_left.length) {
            clearInterval(ENCODER_TIMER);
            $("#timer").html(`${frameNumber} / ${frameNumber} (100%)`);
            $("#speed").html(`完成`);
            $("#progressbar").css("width", `100%`);
            
            // “完成”按钮动效，以及点击保存的事件绑定
            $("#play").animate({"width": "5px"}, 200, () => {
                $("#play").animate({"height": "35px", "width": "35px"}, 400, () => {
                    $("#play").addClass("Done");
                    $("#play").html(`
                    <div style="line-height: 35px; text-align: center; color: #fff;">
                        <img id="doneIcon" style="width: 0px; height: 35px;" src="data:image/svg+xml,%3Csvg t='1590509837474' class='icon' viewBox='0 0 1024 1024' version='1.1' xmlns='http://www.w3.org/2000/svg' p-id='4042' xmlns:xlink='http://www.w3.org/1999/xlink' width='200' height='200'%3E%3Cdefs%3E%3Cstyle type='text/css'%3E%3C/style%3E%3C/defs%3E%3Cpath d='M935.03 212.628c-28.659-28.662-75.123-28.662-103.78 0l-449.723 449.72L191.26 472.08c-28.66-28.655-75.124-28.655-103.784 0-28.656 28.662-28.656 75.124 0 103.786l242.16 242.156c28.657 28.654 75.123 28.654 103.781 0L935.03 316.404c28.66-28.66 28.66-75.122 0-103.776z' p-id='4043' fill='%23ffffff'%3E%3C/path%3E%3C/svg%3E">
                    </div>`);

                    $("#doneIcon").animate({"width": "25px"}, 200);

                    $("#play").click(() => {
                        // 保存到文件
                        let buffer = new Uint8Array(STREAM);
                        let file = new File([buffer], `test.mp3`, {type: `audio/mpeg`});
                        saveAs(file, `${filename}_Aqua.mp3`, true);
                    });
                });
            });

            // let buffer = new Uint8Array(STREAM);
            // let file = new File([buffer], `test.mp3`, {type: `audio/mpeg`});
            // saveAs(file, `${filename}_Aqua.mp3`, true);
        }
    }, 0);
}


function EncodeFrame(PCMs, offset) {
    // 帧间距（bits）
    let frameLength = Math.floor((BIT_RATE_VALUE[BIT_RATE] * 1152 / SAMPLE_RATE_VALUE[SAMPLE_RATE]) / 8) * 8; // 变为8的倍数
    LOG(`帧间距：${frameLength} bits`);

    // 每个Granule的平均长度（含所有声道，bits）
    let sideLength = (CHANNELS >= 2) ? 256 : 136;
    let meanBitsPerGranule = (frameLength - sideLength - 32) / 2; // Header 32bits, SideInfo 256bits(dual)/136bits(mono)
    LOG(`Granule平均长度：${meanBitsPerGranule} bits`);

    // 设置比特储备的最大容量
    SetReservoirMax(frameLength);

    LOG(`【Granule 0】`);
    let granule0 = EncodeGranule(PCMs, offset, meanBitsPerGranule);
    LOG(`【Granule 1】`);
    let granule1 = EncodeGranule(PCMs, offset + 576, meanBitsPerGranule);

    // 检查比特储备池的容量，使用多余的比特对granule作填充
    RegulateAndStuff([granule0, granule1]);

    return [granule0, granule1];
}

function EncodeGranule(PCMs, offset, meanBitsPerGranule) {
    let channels = new Array();
    for(let ch = 0; ch < CHANNELS; ch++) {
        LOG(`【Channel ${ch}】`);
        let channel = EncodeChannel(PCMs[ch], offset, meanBitsPerGranule / CHANNELS, BUFFER[ch]);
        channels.push(channel);
    }
    return channels;
}


function EncodeChannel(PCM, offset, meanBitsPerChannel, buffer) {

    //////////////////////////////////
    //  分 析 子 带 滤 波
    //////////////////////////////////


    let subbands = AnalysisSubbandFilter(PCM, offset);


    //////////////////////////////////
    //  心 理 声 学 模 型
    //////////////////////////////////


    let isAttack = (Math.random() > 0.9) ? true : false;
    let perceptualEntropy = 0;
    let blockType = SwitchWindowType(buffer.PREV_BLOCK_TYPE, isAttack);
    LOG(`窗口类型：${blockType}`);
    let xmin = new Array();
    for(let i = 0; i < 21; i++) { // 应当区分长短块
        xmin[i] = 1e-12;
    }


    //////////////////////////////////
    //  时 频 变 换
    //////////////////////////////////


    let Spectrum = GranuleMDCT(subbands, buffer.PREV_SUBBANDS, blockType); // TODO


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
