

const NALU_MTU = 1000; // NAL层最小传输单元长度

let VIDEO_FRAMES = [];
let audio_frame_clock = 0;

let ws_opened = false;

let VIDEO_SLICE_FIFO = [];
let VIDEO_SLICE_COUNT = 0;

// TODO IP参数
let ws_ip_address = "192.168.10.248";
let socket = null;

function openWebsocket() {
    socket = new WebSocket(`ws://${ws_ip_address}:5000/`);
    socket.binaryType = "arraybuffer";
    socket.addEventListener('open', (event) => {
        $("#ws_status").html("WS已连接");
        $("#ws_status").css("background-color", "#1bb61b");
        $("#VideoSelector").show();
        ws_opened = true;
        socket.send('Hello Tx Server!');
    });
}


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




// 视频帧分片（简单拆分成n片，最后一片长度偏短，不填充）
function video_frame_slice(vframe, n) {
    let slice_length = Math.ceil(vframe.length / n);
    let slices = [];
    for(let i = 0; i < vframe.length; i += slice_length) {
        let s = vframe.slice(i, i + slice_length);
        slices.push(s);
    }
    return slices;
}






// 构建SCE帧
function sce_encode(type, timestamp, slice_index, payload) {
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
    // slice index 2B
    frame[8] = (slice_index >> 8) & 255;
    frame[9] = slice_index & 255;
    // payload
    frame = frame.concat(Array.from(payload));

    return frame;
}





// 构建CMS帧
function cms_encode(sce_frames) {
    let frame = [];

    // 首先计算所有sce帧的总长度
    let payload_length = 0;
    for(let i = 0; i < sce_frames.length; i++) {
        payload_length += sce_frames[i].length;
    }
    // frame length 2B
    let frame_length = payload_length + 4 + 4; // Header 4B + checksum 4B
    frame[0] = (frame_length >> 8) & 255;
    frame[1] = frame_length & 255;
    // payload length 2B
    frame[2] = (payload_length >> 8) & 255;
    frame[3] = payload_length & 255;
    // payload
    for(let i = 0; i < sce_frames.length; i++) {
        frame = frame.concat(sce_frames[i]);
    }

    // checksum
    let checksum = 0;
    for(let i = 0; i < frame.length; i++) {
        checksum += frame[i];
    }
    frame.push((checksum >> 24) & 255);
    frame.push((checksum >> 16) & 255);
    frame.push((checksum >> 8) & 255);
    frame.push(checksum & 255);

    return frame;
}




// NAL层编码解码
// 将一个完整的CMS帧拆分成一组NAL报文，每个NAL报文的长度不超过mtu，不足mtu的补齐到mtu
function cms_frame_to_nal_packets(cms_frame, mtu) {
    const nal_sync_word = [66, 68, 52, 83, 85, 82, 0, 77]; // 同步字符串“BD4SUR\u0000M”
    let nal_packets = [];

    let cms_frame_offset = 0;

    let nal_payload_max_length = Math.ceil(cms_frame.length / Math.ceil(cms_frame.length / (mtu - 12)));

    let nal_packet_index = 0;

    while(cms_frame_offset < cms_frame.length) {
        let nal_packet = [];
        // nal_sync_word (4B)
        nal_packet[0] = nal_sync_word[0]; nal_packet[1] = nal_sync_word[1];
        nal_packet[2] = nal_sync_word[2]; nal_packet[3] = nal_sync_word[3];
        nal_packet[4] = nal_sync_word[4]; nal_packet[5] = nal_sync_word[5];
        nal_packet[6] = nal_sync_word[6]; nal_packet[7] = nal_sync_word[7];
        // nal_packet_index (2B)
        nal_packet[8] = (((nal_packet_index ^ 0) >> 8)  & 255);
        nal_packet[9] = ((nal_packet_index ^ 0) & 255);
        // nal_payload 先截取payload，然后计算其实际长度
        let nal_payload = cms_frame.slice(cms_frame_offset, cms_frame_offset + nal_payload_max_length);
        // nal_payload_length (2B)
        nal_packet[10] = (((nal_payload.length ^ 0) >> 8)  & 255);
        nal_packet[11] = ((nal_payload.length ^ 0) & 255);

        for(let i = 0; i < nal_payload.length; i++) {
            nal_packet.push(nal_payload[i]);
        }

        // 长度补齐到mtu
        for(let i = nal_packet.length; i < mtu; i++) {
            nal_packet.push(Math.ceil(Math.random() * 255));
        }

        nal_packets.push(nal_packet);

        nal_packet_index++;
        cms_frame_offset += nal_payload.length;
    }

    return nal_packets;
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
// 是否是音频关键帧
function is_special_critical_frame(audio_frame_index) {
    return (audio_frame_index % 25 === 24);
}


function transmit(frame, frameIndex) {
    if(ws_opened === false || socket.readyState !== WebSocket.OPEN) {
        return;
    }
    // 构建音频SCE帧
    let audio_sce_frame = sce_encode(1, frameIndex, 0xffff, frame);
    // 封装为CMS帧发射出去
    let audio_cms_frame = cms_encode([audio_sce_frame]);
    // NOTE 实验证明，将音频帧和视频分片分散到两个CMS帧中分别发送而不复用，也就是虚级化CMS层，有两个好处：一是降低CMS帧错误率，二是避免接收端饥饿
    // TODO 重复代码
    let nal_packets = cms_frame_to_nal_packets(audio_cms_frame, NALU_MTU);
    for(let i = 0; i < nal_packets.length; i++) {
        let nal_packet = new Uint8Array(nal_packets[i]);
        socket.send(nal_packet);
    }

    // 关键帧检查：首先检查当前时刻是否应该取出视频帧
    if(need_next_video_frame(frameIndex) === true) {
        // 判断当前时刻是否是特殊关键帧，如果是特殊关键帧，则切成5片；否则切成4片
        let video_slice_number = (is_special_critical_frame(frameIndex)) ? 5 : 4;
        // 从FIFO头部取出一个视频帧
        let video_frame = VIDEO_FRAMES.shift();
        // 如果没有取出视频帧，说明FIFO饥饿
        if(video_frame === undefined) {
            return;
        }
        // 如果取出了视频帧，则对其进行分片
        else {
            let slices = video_frame_slice(video_frame, video_slice_number);
            // 除第一个分片外，全部加入分片队列，供后续音频帧到来时复用
            for(let i = 1; i < video_slice_number; i++) {
                VIDEO_SLICE_FIFO.push(slices[i]);
            }
            // 将第一个分片与当前音频帧复用为CMS帧
            VIDEO_SLICE_COUNT = 0;
            let video_slice_sce_frame = sce_encode(2, frameIndex, VIDEO_SLICE_COUNT, slices[0]);
            let video_cms_frame = cms_encode([video_slice_sce_frame]);
            // 将CMS帧拆分成NAL报文
            let nal_packets = cms_frame_to_nal_packets(video_cms_frame, NALU_MTU);
            for(let i = 0; i < nal_packets.length; i++) {
                let nal_packet = new Uint8Array(nal_packets[i]);
                socket.send(nal_packet);
            }
        }

    }
    // 如果当前时刻不是关键帧
    else {
        // 从分片队列中取出一个分片。由于音视频帧率间的确定关系，TODO ？ 可以保证到下一个关键帧的时候，队列恰好被排空
        let s = VIDEO_SLICE_FIFO.shift();
        VIDEO_SLICE_COUNT++;
        // 一般是没有视频的情况
        if(s === undefined) {
            return;
        }
        else {
            // 将刚刚取出的分片与当前音频帧复用为CMS帧，并拆分成NALU
            let video_slice_sce_frame = sce_encode(2, frameIndex, VIDEO_SLICE_COUNT, s);
            let video_cms_frame = cms_encode([video_slice_sce_frame]);
            // 将CMS帧拆分成NAL报文
            let nal_packets = cms_frame_to_nal_packets(video_cms_frame, NALU_MTU);
            for(let i = 0; i < nal_packets.length; i++) {
                let nal_packet = new Uint8Array(nal_packets[i]);
                socket.send(nal_packet);
            }
        }
    }
}
