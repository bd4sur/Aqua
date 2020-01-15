
/**
 * @description 构建比特流
 */

function FormatFrameBitStream(frame, isPadding, mainDataBegin) {
    let fixedData = "";  // Header+CRC+SideIndo
    let mainData = "";   // Scalefactors+Huffman

    ////////////////////////////////////
    //  构 造 固 定 部 分
    ////////////////////////////////////

    // Header (32bits 4Bytes)

    fixedData += "111111111111";            // syncword = 1111 1111 1111
    fixedData += "1";                       // ID = 1, MP3
    fixedData += "01";                      // Layer 3 = 01
    fixedData += "1";                       // no CRC = 1
    fixedData += BIT_RATE_INDEX[BIT_RATE];  // Bitrate index
    fixedData += SAMPLE_RATE_INDEX[SAMPLE_RATE]; // Sample rate index
    fixedData += (isPadding) ? "1" : "0";   // padding bit
    fixedData += "0";                       // private bit
    fixedData += (CHANNELS >= 2) ? "00" : "11"; // 仅支持stereo和mono
    fixedData += "00";                      // mode extension
    fixedData += "01";                      // no copyright = 0; original = 1
    fixedData += "00";                      // emphasis = 00 none

    // CRC (none)

    // SideInfo (136bits 17Bytes / 256bits 32Bytes)

    fixedData += BinaryString(mainDataBegin, 9);   // main_data_begin
    if(CHANNELS >= 2) {
        fixedData += "000"; // private_bits (3bits while stereo)
    }
    else {
        fixedData += "00000"; // private_bits (3bits while mono)
    }
    // scfsi
    for(let ch = 0; ch < CHANNELS; ch++) {
        fixedData += "0000"; // TODO 暂不实现scfsi，因此固定为0
    }

    for(let gr = 0; gr < 2; gr++) {
        let granule = frame[gr];
        for(let ch = 0; ch < CHANNELS; ch++) {
            let channel = granule[ch];

            fixedData += BinaryString(channel.part23Length, 12);
            fixedData += BinaryString(channel.bigvalues, 9);
            fixedData += BinaryString(channel.globalGain, 8);
            fixedData += BinaryString(channel.scalefactorCompress, 4);

            let windowSwitchingFlag = ((channel.blockType === WINDOW_NORMAL) ? "0" : "1");
            fixedData += String(windowSwitchingFlag);

            if(windowSwitchingFlag === "1") {
                fixedData += BinaryString(channel.blockType, 2);
                fixedData += "0"; // mixed_block_flag
                for(let region = 0; region < 2; region++) {
                    fixedData += BinaryString(channel.tableSelect[region], 5);
                }
                for(let window = 0; window < 3; window++) {
                    fixedData += "000"; // TODO 暂未实现 subblock_gain，设置为0
                }
            }
            else if(windowSwitchingFlag === "0") {
                for(let region = 0; region < 3; region++) {
                    fixedData += BinaryString(channel.tableSelect[region], 5);
                }
                fixedData += BinaryString(channel.region0Count, 4);
                fixedData += BinaryString(channel.region1Count, 3);
            }

            fixedData += "0"; // TODO preflag未实现，固定为0
            fixedData += "0"; // TODO scalefactor_scale未实现，固定为0
            fixedData += (channel.count1TableSelect === 0) ? "0" : "1";
        }
    }

    ////////////////////////////////////
    //  构 造 主 要 部 分 (SF and Huffman)
    ////////////////////////////////////

    for(let gr = 0; gr < 2; gr++) {
        let granule = frame[gr];
        for(let ch = 0; ch < CHANNELS; ch++) {
            let channel = granule[ch];
            let channelMainData = new Array();

            // Part 2: Scalefactors

            let slen1 = SF_COMPRESS_INDEX[channel.scalefactorCompress][0];
            let slen2 = SF_COMPRESS_INDEX[channel.scalefactorCompress][1];

            let windowSwitchingFlag = ((channel.blockType === WINDOW_NORMAL) ? "0" : "1");

            if((windowSwitchingFlag === "1") && (channel.blockType === WINDOW_SHORT)) {
                for(let sfb = 0; sfb < 6; sfb++) {
                    for(let window = 0; window < 3; window++) {
                        channelMainData += BinaryString(channel.scalefactors[window][sfb], slen1);
                    }
                }
                for(let sfb = 6; sfb < 12; sfb++) {
                    for(let window = 0; window < 3; window++) {
                        channelMainData += BinaryString(channel.scalefactors[window][sfb], slen2);
                    }
                }
            }
            else {
                for(let sfb = 0; sfb < 11; sfb++) {
                    channelMainData += BinaryString(channel.scalefactors[sfb], slen1);
                }
                for(let sfb = 11; sfb < 21; sfb++) {
                    channelMainData += BinaryString(channel.scalefactors[sfb], slen2);
                }
            }

            // Part 3: Huffman

            channelMainData += channel.huffmanCodeBits;

            // 根据part23Length填充0

            for(let i = channelMainData.length; i < channel.part23Length; i++) {
                channelMainData += "0";
            }

            mainData = mainData.concat(channelMainData);
        }
    }

    ////////////////////////////////////
    //  装 配 字 节 流
    ////////////////////////////////////

    let bytes = new Array(); // 最终输出的字节流

    let fixedBytes = new Array();
    let mainBytes = new Array();

    for(let i = 0; i < fixedData.length; i += 8) {
        let eightBits = fixedData.slice(i, i+8);
        fixedBytes.push(BinaryStringToUint(eightBits));
    }

    for(let i = 0; i < mainData.length; i += 8) {
        let eightBits = mainData.slice(i, i+8);
        mainBytes.push(BinaryStringToUint(eightBits));
    }

    let mainCount = 0;

    // 先装配fixed部分之前的mainData，其长度为mainDataBegin
    for(let i = 0; i < mainDataBegin; i++) {
        bytes.push(mainBytes[mainCount]);
        mainCount++;
    }

    // 装配fixed部分（帧头和边信息）
    for(let i = 0; i < fixedBytes.length; i++) {
        bytes.push(fixedBytes[i]);
    }

    // 装配fixed部分之后的mainData
    while(mainCount < mainBytes.length) {
        bytes.push(mainBytes[mainCount]);
        mainCount++;
    }

    // 填充字节（槽）
    if(isPadding) {
        bytes.push(0x80);
    }

    return bytes;
}
