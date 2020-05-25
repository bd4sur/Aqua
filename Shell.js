
let cv = new Canvas("osc", [0,0], [1152, 200]); // 每个条带宽2px

cv.Init();
cv.SetBackgroundColor("#fff");

let AudioContext = new window.AudioContext();

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

function Render(rawAudioData) {
    AudioContext.decodeAudioData(rawAudioData, (audioBuffer) => {
        // 获取两个声道的原始数据
        let SampleRate = audioBuffer.sampleRate;
        let leftChannel  = audioBuffer.getChannelData(0);
        let rightChannel = audioBuffer.getChannelData(1);

        let AudioBufferSourceNode = AudioContext.createBufferSource();
        AudioBufferSourceNode.connect(AudioContext.destination);
        AudioBufferSourceNode.buffer = audioBuffer;
        AudioBufferSourceNode.start(0);

        // 采样率
        if(SampleRate === 44100) { SAMPLE_RATE = SAMPLE_RATE_44100; }
        else if(SampleRate === 48000) { SAMPLE_RATE = SAMPLE_RATE_48000; }
        else if(SampleRate === 32000) { SAMPLE_RATE = SAMPLE_RATE_32000; }
        else {
            console.warn(`MPEG-1 不支持采样率 ${SampleRate}Hz，默认采用 44100Hz`);
            SAMPLE_RATE = SAMPLE_RATE_44100;
        }

        // 编码器入口
        Aqua_MP3_Encoder(leftChannel, rightChannel);

    });
}

$("#play").click(() => {
    let state = $("#play").attr("data-state");
    if(state === "stopped") {
        $("#playLabel").html("暂停");
        Render(rawAudioData);
        $("#play").attr("data-state", "playing");
    }
});
