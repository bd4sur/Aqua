
// 临时：解析视频裸帧字节流文件（后缀SV）
function parseVideoFile(bytestream) {

    let video_frames = [];

    // 首先寻找同步字符串“BD4SUR\u0000V”，确定码流中第一帧的开始位置
    const sync_word = [66, 68, 52, 83, 85, 82, 0, 86];
    let offset = 0;
    for(let i = 0; i < 1000; i++) {
        if( bytestream[ i ] === sync_word[0] && bytestream[i+1] === sync_word[1] &&
            bytestream[i+2] === sync_word[2] && bytestream[i+3] === sync_word[3] &&
            bytestream[i+4] === sync_word[4] && bytestream[i+5] === sync_word[5] &&
            bytestream[i+6] === sync_word[6] && bytestream[i+7] === sync_word[7] ) {
            offset = i;
            break;
        }
    }

    // 逐帧解析
    do {
        // 读取帧长度，将帧提取出来
        let frame_length_3 = bytestream[offset + 10];
        let frame_length_2 = bytestream[offset + 11];
        let frame_length_1 = bytestream[offset + 12];
        let frame_length_0 = bytestream[offset + 13];
        let frame_length = (frame_length_3 << 24) + (frame_length_2 << 16) + (frame_length_1 << 8) + (frame_length_0 & 255);

        let frame = bytestream.slice(offset, offset + frame_length);
        video_frames.push(frame);

        offset += frame_length;
    }
    while(offset < bytestream.length);

    return video_frames;
}





// 构建MCS帧
function mcs_encode(type, timestamp, payload) {
    let frame = [];
    // frame length 2B
    let frame_length = payload.length + 10;
    frame[0] = (frame_length >> 8) & 255;
    frame[1] = frame_length & 255;
    // type 2B
    frame[2] = (type >> 8) & 255;
    frame[3] = type & 255;
    // timestamp 4B
    frame[4] = (timestamp >> 24) & 255;
    frame[5] = (timestamp >> 16) & 255;
    frame[6] = (timestamp >> 8) & 255;
    frame[7] = timestamp & 255;
    // fragment offset 2B
    frame[8] = 0;
    frame[9] = 0;
    // payload
    frame = frame.concat(Array.from(payload));

    return frame;
}





// 构建MMS帧
function mms_encode(mcs_frames) {
    let frame = [];

    // 首先计算所有mcs帧的总长度
    let payload_length = 0;
    for(let i = 0; i < mcs_frames.length; i++) {
        payload_length += mcs_frames[i].length;
    }
    // frame length 2B
    let frame_length = payload_length + 4;
    frame[0] = (frame_length >> 8) & 255;
    frame[1] = frame_length & 255;
    // payload length 2B
    frame[2] = (payload_length >> 8) & 255;
    frame[3] = payload_length & 255;
    // payload
    for(let i = 0; i < mcs_frames.length; i++) {
        frame = frame.concat(mcs_frames[i]);
    }

    return frame;
}




// IPA层编码解码
// 将一个完整的MMS帧拆分成一组IPA报文，每个IPA报文的长度不超过mtu
function mms_frame_to_ipa_packets(mms_frame, mtu) {
    const ipa_sync_word = [66, 68, 52, 83, 85, 82, 0, 77]; // 同步字符串“BD4SUR\u0000M”
    let ipa_packets = [];

    let mms_frame_offset = 0;

    let ipa_payload_max_length = Math.ceil(mms_frame.length / Math.ceil(mms_frame.length / (mtu - 12)));

    let ipa_packet_index = 0;

    while(mms_frame_offset < mms_frame.length) {
        let ipa_packet = [];
        // ipa_sync_word (4B)
        ipa_packet[0] = ipa_sync_word[0]; ipa_packet[1] = ipa_sync_word[1];
        ipa_packet[2] = ipa_sync_word[2]; ipa_packet[3] = ipa_sync_word[3];
        ipa_packet[4] = ipa_sync_word[4]; ipa_packet[5] = ipa_sync_word[5];
        ipa_packet[6] = ipa_sync_word[6]; ipa_packet[7] = ipa_sync_word[7];
        // ipa_packet_index (2B)
        ipa_packet[8] = (((ipa_packet_index ^ 0) >> 8)  & 255);
        ipa_packet[9] = ((ipa_packet_index ^ 0) & 255);
        // ipa_payload 先截取payload，然后计算其实际长度
        let ipa_payload = mms_frame.slice(mms_frame_offset, mms_frame_offset + ipa_payload_max_length);
        // ipa_payload_length (2B)
        ipa_packet[10] = (((ipa_payload.length ^ 0) >> 8)  & 255);
        ipa_packet[11] = ((ipa_payload.length ^ 0) & 255);

        for(let i = 0; i < ipa_payload.length; i++) {
            ipa_packet.push(ipa_payload[i]);
        }

        ipa_packets.push(ipa_packet);

        ipa_packet_index++;
        mms_frame_offset += ipa_payload.length;
    }

    return ipa_packets;
}





// 音频帧率24fps，视频帧率10fps
// 音频编码到第n帧时，对应的视频帧的index为何
function video_frame_index(audio_frame_index) {
    return Math.floor((audio_frame_index+1) / 25) * 6 + Math.floor(((audio_frame_index+1) % 25) * 0.24);
}
// 音频第n帧，要不要取下一个视频帧
function need_next_video_frame(audio_frame_index) {
    if(audio_frame_index === 0) {
        return true;
    }
    else if(video_frame_index(audio_frame_index - 1) < video_frame_index(audio_frame_index)) {
        return true;
    }
    else {
        return false;
    }
}