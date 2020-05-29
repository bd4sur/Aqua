/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyrignt (c) 2019-2020 Mikukonai @ GitHub
//
//  =============================================================
//
//  shell.js
//
//    Web页GUI。
//
/////////////////////////////////////////////////////////////////

let cv = new Canvas("osc", [0,-1.1], [1152, 1.1]);

cv.Init();
cv.SetBackgroundColor("#fff");

let AudioContext = new window.AudioContext();

$("#fileSelector").change(() => {

    // 获取文件名
    let fakepath = $("#fileSelector").val().split(/\\|\//gi);
    let filename = fakepath[fakepath.length - 1];
    $("#inputButtonLabel").html(filename);

    // 读取文件
    let file = fileSelector.files[0];
    let Reader = new FileReader();
    Reader.onloadend = () => {
        $("#play").removeAttr("disabled");
        $("#play").unbind("click"); // 删除旧的事件处理函数，以应对重复选择文件的情况
        $("#play").click(() => {
            if(filename.length <= 0) {
                alert("请选择文件");
                return;
            }
            let state = $("#play").attr("data-state");
            if(state === "stopped") {
                $("#play").animate({"width": "100%"}, 200, () => {
                    $("#playButtonLabel").remove();
                    $("#play").animate({"height": "5px"}, 300, () => {

                        $("#play").removeClass("PlayButton");
                        $("#play").addClass("ProcessbarContainer");

                        decode(Reader.result, filename);

                        $("#play").attr("data-state", "playing");

                    });
                });
            }
        });
    }
    Reader.readAsArrayBuffer(file);
});


function decode(rawAudioData, filename) {
    $("#timer").html(`浏览器解码中……`);

    AudioContext.decodeAudioData(rawAudioData, (audioBuffer) => {
        // 获取两个声道的原始数据
        let sampleRate = audioBuffer.sampleRate;
        let leftChannel  = audioBuffer.getChannelData(0);
        let rightChannel = audioBuffer.getChannelData(1);

        // 播放
        let bufferSourceNode = AudioContext.createBufferSource();
        bufferSourceNode.connect(AudioContext.destination);
        bufferSourceNode.buffer = audioBuffer;
        bufferSourceNode.start(0);

        const onRunning = (info) => {
            let frameCount = info.frameCount;
            let frameNumber = info.frameNumber;
            let speed = info.speed;
            let offset = info.offset;
            let PCM = info.PCM;
            // let spect = info.spect;

            $("#timer").html(`${(frameCount / frameNumber * 100).toFixed(1)}% (${frameCount}/${frameNumber})`);
            $("#speed").html(`${speed}x`);
            $("#progressbar").css("width", `${(frameCount / frameNumber * 100).toFixed(2)}%`);

            // 绘制576点频谱
            cv.Clear();
            cv.SetBackgroundColor("#fff");

            // 频谱
            // let spect = frame[0][0].granules.spectrum;
            // let index = 0;
            // for(let x = 0; x < 576; x++) {
            //     cv.Line([x, 0], [x, spect[index]], "#0af");
            //     index++;
            // }

            // 波形
            let window = PCM.slice(offset, offset + 1152);
            let index = 0;
            for(let x = 1; x < 1152; x++) {
                cv.Line([x-1, window[index-1]], [x, window[index]], "#0af");
                index++;
            }
        };

        const onFinished = (info) => {
            let frameNumber = info.frameNumber;
            let byteStream = info.byteStream;

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
                        let buffer = new Uint8Array(byteStream);
                        let file = new File([buffer], `test.mp3`, {type: `audio/mpeg`});
                        saveAs(file, `${filename}_Aqua.mp3`, true);
                    });
                });
            });
        };

        // 编码器入口
        Aqua_Main(leftChannel, rightChannel, 2, sampleRate, 320000, onRunning, onFinished);

    });
}
