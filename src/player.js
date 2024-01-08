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
const AUDIO_BUFFER_LENGTH = 4096;

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
