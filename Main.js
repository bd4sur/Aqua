
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
        let xmin = new Array();
        for(let i = 0; i < 21; i++) { // 应当区分长短块
            xmin[i] = 1e-8;
        }

        // 时频变换：可能是长块，可能是短块，由currentWindowType决定。
        let Spectrum = CalculateGranuleSpectrum(currentGranuleSubbands, prevGranuleSubbands, currentWindowType);
        console.log(`[Granule_${GranuleCount}] 频谱：`);
        console.log(Spectrum);

        console.log(`[Granule_${GranuleCount}] 量化循环开始`);
        let sf = OuterLoop(Spectrum, currentWindowType, 3000, xmin);
        console.log(`[Granule_${GranuleCount}] 尺度因子结果：`);
        console.log(sf);


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
            let ReQuantized = ReQuantize(quantResult.quantizedSpectrum576, globalGain);
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
            let ReQuantized = ReQuantize(quantResult.quantizedSpectrum576, globalGain);
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

        console.log(`=============================================================`);

        prevGranuleSubbands = currentGranuleSubbands;
        prevWindowType = currentWindowType;
        GranuleCount++;
    }
}