/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2024 BD4SUR @ GitHub
//
//  =============================================================
//
//  player.js
//
//    基于 github.com/soundbus-technologies/js-mp3 解码的播放器，用于实时监听编码效果。
//
/////////////////////////////////////////////////////////////////

const MP3_FRAME_BYTE_LENGTH = 960;
const MP3_FRAME_SAMPLE_LENGTH = 1152;
const MP3_SAMPLE_RATE = 48000;
const MP3_FRAME_DURATION = MP3_FRAME_SAMPLE_LENGTH / MP3_SAMPLE_RATE * 1000; // ms
const MP3_CHANNELS = 2;
const AUDIO_BUFFER_LENGTH = 2048;

let AUDIO_MP3_FRAME_FIFO = [];

let AUDIO_PCM_L_FIFO = [];
let AUDIO_PCM_R_FIFO = [];


function push_into_mp3_frame_fifo(frame) {
    AUDIO_MP3_FRAME_FIFO.push(frame);
    $("#mp3_fifo_length").html(`${AUDIO_MP3_FRAME_FIFO.length}`);
}


// 解码一组mp3帧，输入Array<Uint8Array>
function decode_mp3_frame(decoding_frames) {
    let bytestream = new Uint8Array(MP3_FRAME_BYTE_LENGTH * 3);
    for(let i = 0; i < 3; i++) {
        for(let j = 0; j < MP3_FRAME_BYTE_LENGTH; j++) {
            let index = i * MP3_FRAME_BYTE_LENGTH + j;
            bytestream[index] = decoding_frames[i][j];
        }
    }

    let decoder = Mp3.newDecoder(bytestream.buffer);
    let pcm_array_buffer = decoder.decode();
    let pcm_buffer = new Int16Array(pcm_array_buffer);

    let pcm_l = [];
    let pcm_r = [];
    for(let i = 0; i < pcm_buffer.length; i+=2) {
        pcm_l.push(pcm_buffer[i] / 32768);
        pcm_r.push(pcm_buffer[i+1] / 32768);
    }

    let channel_num = decoder.frame.header.numberOfChannels();
    let sampleRate = decoder.frame.samplingFrequency();

    return [pcm_l, pcm_r, channel_num, sampleRate];
}

function decode_mp3_to_pcm() {
    if(AUDIO_MP3_FRAME_FIFO.length < 2) {
        console.log("AUDIO_MP3_FRAME_FIFO empty!");
        return;
    }
    // 从 MP3 FIFO 取出3帧，用于解码。解码窗口每次取3个帧，但是窗口只移动1帧。
    let decoding_frames = AUDIO_MP3_FRAME_FIFO.slice(0, 3);
    AUDIO_MP3_FRAME_FIFO = AUDIO_MP3_FRAME_FIFO.slice(1);

    // 对解码窗口内各帧进行解码，但是只取出解码后的PCM的最后一帧
    let res = decode_mp3_frame(decoding_frames);
    let pcm_l = res[0].slice(MP3_FRAME_SAMPLE_LENGTH * 2);
    let pcm_r = res[1].slice(MP3_FRAME_SAMPLE_LENGTH * 2);

    // 将解码出的一帧压入 PCM FIFO
    for(let i = 0; i < pcm_l.length; i++) {
        AUDIO_PCM_L_FIFO.push(pcm_l[i]);
        AUDIO_PCM_R_FIFO.push(pcm_r[i]);
    }
}
