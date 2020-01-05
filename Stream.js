
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
    fixedData += (CHANNEL >= 2) ? "00" : "11"; // 仅支持stereo和mono
    fixedData += "00";                      // mode extension
    fixedData += "01";                      // no copyright = 0; original = 1
    fixedData += "00";                      // emphasis = 00 none

    // CRC (none)

    // SideInfo (136bits 17Bytes / 256bits 32Bytes)

    fixedData += BinaryString(mainDataBegin, 9);   // main_data_begin
    if(CHANNEL >= 2) {
        fixedData += "000"; // private_bits (3bits while stereo)
    }
    else {
        fixedData += "00000"; // private_bits (3bits while mono)
    }
    // scfsi
    for(let ch = 0; ch < CHANNEL; ch++) {
        fixedData += "0000"; // TODO 暂不实现scfsi，因此固定为0
    }

    for(let gr = 0; gr < 2; gr++) {
        let granule = frame[gr];
        for(let ch = 0; ch < CHANNEL; ch++) {
            let channel = granule[ch];
            LOG(channel);
            fixedData += BinaryString(channel.part23Length, 12);
            fixedData += BinaryString(channel.bigvalues, 9);
            fixedData += BinaryString(channel.globalGain, 8);
            fixedData += BinaryString(channel.scalefactorCompress, 4);

            let windowSwitchingFlag = ((channel.blockType === WINDOW_NORMAL) ? "0" : "1");
            fixedData += windowSwitchingFlag;

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
        for(let ch = 0; ch < CHANNEL; ch++) {
            let channel = granule[ch];

            let windowSwitchingFlag = ((channel.blockType === WINDOW_NORMAL) ? "0" : "1");

            if(windowSwitchingFlag === "1") {

            }
            else (windowSwitchingFlag === "0") {

            }

        }
    }


}
