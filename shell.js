/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 BD4SUR @ GitHub
//
//  =============================================================
//
//  shell.js
//
//    Web页GUI。
//
/////////////////////////////////////////////////////////////////

let AudioContext = new window.AudioContext();

let isSpetrogramShow = false;

let VIDEO_FRAMES = [];
let audio_frame_clock = 0;

let ws_opened = false;

let NAL_PACKET_FIFO = [];

// TODO IP参数
let ws_ip_address = "localhost";
let socket = null;
socket = new WebSocket(`ws://${ws_ip_address}:5000/`);
socket.binaryType = "arraybuffer";
socket.addEventListener('open', (event) => {
    $("#ws_status").html("WebSocket Opened");
    ws_opened = true;
    // socket.send('Hello Server!');
});

let cv = SpectrogramInit("spectrogram");

function readerOnLoad(reader, filename) {
    return () => {
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

                        decode(reader.result, filename);

                        $("#play").attr("data-state", "playing");

                        // 定时发送NALU
                        setInterval(() => {
                            let nalu = NAL_PACKET_FIFO.shift();
                            socket.send(nalu); // 通过WebSocket逐个发送NAL报文
                            $("#ws_tx_status").html(`发送NALU，长度 ${nalu.byteLength} Bytes`);
                        }, 7);

                    });
                });
            }
        });
    };
}

$("#fileSelector").on("dragover", (event) => {
    event.preventDefault();
}).on("drop", (event) => {
    event.preventDefault();
    let filelist = event.originalEvent.dataTransfer.files;
    let file = filelist[0];
    let filename = file.name;
    $("#inputButtonLabel").html(filename);
    let Reader = new FileReader();
    Reader.onloadend = readerOnLoad(Reader, filename);
    Reader.readAsArrayBuffer(file);
});

$("#fileSelector").change(() => {
    // 获取文件名
    let fakepath = $("#fileSelector").val().split(/\\|\//gi);
    let filename = fakepath[fakepath.length - 1];
    $("#inputButtonLabel").html(filename);
    // 读取文件
    let file = fileSelector.files[0];
    let Reader = new FileReader();
    Reader.onloadend = readerOnLoad(Reader, filename);
    Reader.readAsArrayBuffer(file);
});

// 2023年6月：增加视频编码
// 首先解析SV视频文件，得到所有的视频帧。SV文件由另外的工具预先生成，未来要考虑整合到这里。
$("#videoFileSelector").change(() => {
    // 获取文件名
    let fakepath = $("#videoFileSelector").val().split(/\\|\//gi);
    let filename = fakepath[fakepath.length - 1];
    $("#inputButtonLabel").html(filename);
    // 读取文件
    let file = videoFileSelector.files[0];
    let Reader = new FileReader();
    Reader.onloadend = () => {
        let bytestream = new Uint8Array(Reader.result);
        VIDEO_FRAMES = parseVideoFile(bytestream);
        console.log(VIDEO_FRAMES);
    };
    Reader.readAsArrayBuffer(file);
});


function decode(rawAudioData, filename) {
    $("#timer").html(`浏览器解码中……`);

    AudioContext.decodeAudioData(rawAudioData, (audioBuffer) => {
        // 获取两个声道的原始数据
        let sampleRate = audioBuffer.sampleRate;
        let length = audioBuffer.length;
        let leftChannel  = audioBuffer.getChannelData(0);
        let rightChannel = audioBuffer.getChannelData(1);

        // 播放
        let bufferSourceNode = AudioContext.createBufferSource();
        bufferSourceNode.connect(AudioContext.destination);
        bufferSourceNode.buffer = audioBuffer;
        bufferSourceNode.start(0);

        const analyser = AudioContext.createAnalyser();
        analyser.fftSize = WINDOW_LENGTH;
        analyser.smoothingTimeConstant = 0.1;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        bufferSourceNode.connect(analyser);

        /////////////////////////////////////////////
        //  绘制声谱图（会严重拖慢运行速度）或波形图
        /////////////////////////////////////////////

        $(".InputButtonLabel").css("color", "#fff");
        $(".InputButton").css("border", "none");
        $(".InputButtonLabel").animate({"line-height": "30px"}, 500);

        let START_TIME = AudioContext.currentTime;
        // let prevFrameAlignedOffset = 0;

        // 显示示波器或者声谱图（不参与编码）
        function play() {
        // let timer = setInterval(() => {
            let currentTime = AudioContext.currentTime;
            let offset = Math.round((currentTime - START_TIME) * sampleRate);

            // 控制是否绘制声谱图
            // 1 示波器
            if(!isSpetrogramShow) {
                // cv.Clear();
                cv.SetBackgroundColor("#000");
                cv.Line([cv.Xmin, 0], [cv.Xmax, 0], "#666");
                let window = leftChannel.slice(offset, offset + WINDOW_LENGTH);
                let index = 0;
                for(let x = 1; x < WINDOW_LENGTH; x++) {
                    cv.Line([x-1, window[index-1]], [x, window[index]], "#0f0");
                    index++;
                }
            }
            // 2 声谱图（改为使用 Web Audio API 获取频谱）
            else {
                analyser.getByteFrequencyData(dataArray);
                let spectrum = Array.from(dataArray);
                PushIntoBuffer(spectrum, SPECTROGRAM_BUFFER, SPECTROGRAM_BUFFER_LENGTH);
                /*//////////////////////////////////////////////////////////////////////////////////
                // 计算帧边缘的offset
                let frameAlignedOffset = Math.floor(offset / WINDOW_LENGTH) * WINDOW_LENGTH;
                if(prevFrameAlignedOffset === frameAlignedOffset) {
                    return;
                }
                prevFrameAlignedOffset = frameAlignedOffset;

                // 计算频谱并推入缓冲区
                let spectrum = CalculateSpectrum(frameAlignedOffset, leftChannel);
                PushIntoBuffer(spectrum, SPECTROGRAM_BUFFER, SPECTROGRAM_BUFFER_LENGTH);
                //////////////////////////////////////////////////////////////////////////////////*/
                // 绘制声谱图
                RenderSpectrogram(cv, SPECTROGRAM_BUFFER, WINDOW_LENGTH);
            }

            // 播放完毕自动停止
            if(offset >= length) {
                bufferSourceNode.stop();
                // clearInterval(timer);
            }
            else {
                requestAnimationFrame(play);
            }
        }
        // }, 0);
        requestAnimationFrame(play);

        const onRunning = (info) => {

            let frameCount = info.frameCount;
            let frameNumber = info.frameNumber;
            let speed = info.speed;

            if(ws_opened === true) {
                // 构建音频MCS帧
                let mcs_frame_audio = mcs_encode(1, frameCount, info.frame);
                // 组装CMS帧
                let mms_frame = null;
                if(need_next_video_frame(frameCount) === true) { // 取视频帧
                    // 构建视频MCS帧
                    let video_frame = VIDEO_FRAMES.shift(); // 从FIFO头部取出一个视频帧
                    if(video_frame === undefined) {
                        mms_frame = mms_encode([mcs_frame_audio]);
                    }
                    else {
                        let mcs_frame_video = mcs_encode(2, frameCount, video_frame);
                        mms_frame = mms_encode([mcs_frame_audio, mcs_frame_video]);
                    }
                }
                else {
                    mms_frame = mms_encode([mcs_frame_audio]);
                }
                // 将CMS帧拆分成NAL报文，加入NAL_PACKET_FIFO
                let nal_packets = mms_frame_to_nal_packets(mms_frame, 1000);
                if(socket.readyState === WebSocket.OPEN) {
                    for(let i = 0; i < nal_packets.length; i++) {
                        let nal_packet = new Uint8Array(nal_packets[i]);
                        NAL_PACKET_FIFO.push(nal_packet);
                    }
                }
            }

            $("#timer").html(`${(frameCount / frameNumber * 100).toFixed(1)}% (${frameCount}/${frameNumber})`);
            $("#speed").html(`${speed}x`);
            $("#progressbar").css("width", `${(frameCount / frameNumber * 100).toFixed(2)}%`);

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

                        // 去掉扩展名
                        filename = filename.replace(/\..+$/gi, "");

                        // 组装日期字符串
                        let date = new Date();
                        let year = date.getFullYear();
                        let month = date.getMonth() + 1; month = (month < 10) ? `0${month}` : String(month);
                        let day = date.getDate(); day = (day < 10) ? `0${day}` : String(day);
                        let hour = date.getHours(); hour = (hour < 10) ? `0${hour}` : String(hour);
                        let minute = date.getMinutes(); minute = (minute < 10) ? `0${minute}` : String(minute);
                        let second = date.getSeconds(); second = (second < 10) ? `0${second}` : String(second);

                        saveAs(file, `${filename}_Aqua_${year}${month}${day}_${hour}${minute}${second}.mp3`, true);
                    });
                });
            });
        };

        // 编码器入口
        Aqua_Main(leftChannel, rightChannel, 2, sampleRate, 320000, onRunning, onFinished);

    });
}

$("#canvasSwitch").click(() => {
    let slider = $("#canvasSwitch").children(".SwitchSlider");
    let state = $("#canvasSwitch").attr("data-state");
    if(state === "1") {
        $("#canvasSwitch").css("border", "0.5px solid #bbb");
        $("#canvasSwitch").css("background-color", "#ccc");
        slider.animate({"left": "0px"}, 100);

        isSpetrogramShow = false;
        cv.Resize([0, -1.2], [WINDOW_LENGTH, 1.2], WINDOW_LENGTH, 200); // oscillator
        // $("#spectrogram").fadeOut();

        $("#canvasSwitch").attr("data-state", "0");
    }
    else if(state === "0") {
        $("#canvasSwitch").css("border", "0.5px solid #6cf");
        $("#canvasSwitch").css("background-color", "#6cf");
        slider.animate({"left": "16px"}, 100);

        isSpetrogramShow = true;
        cv.Resize([0, 0], [WINDOW_LENGTH_HALF, WINDOW_LENGTH_HALF], SPECTROGRAM_BUFFER_LENGTH, WINDOW_LENGTH_HALF); // oscillator
        // $("#spectrogram").fadeIn();

        $("#canvasSwitch").attr("data-state", "1");
    }
});
