/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 BD4SUR @ GitHub
//
//  =============================================================
//
//  reservoir.js
//
//    比特储备机制。
//
/////////////////////////////////////////////////////////////////


// 设置最大比特储备容量（bits），同dist10的ResvFrameBegin
function SetReservoirMax() {
    // 根据当前帧长度修改比特储备池最大长度
    // if(frameLength > 7680) { // NOTE 7680是320k/48kHz的帧比特数（320000*1152/48000=7680）
    //     RESERVOIR_MAX = 0;
    // }
    // else {
    //     RESERVOIR_MAX = 7680 - frameLength;
    // }
    // 因为mainDataBegin为9bit，因此最多能表示511*8=4088bit的比特储备池
    if(RESERVOIR_MAX > 4088) {
        RESERVOIR_MAX = 4088;
    }
}

// 给每个Channel的分配比特预算
function AllocateBudget(perceptualEntropy, meanBitsPerChannel) {
    let budget = meanBitsPerChannel;

    // 如果比特储备为0，则直接以平均比特数为预算（需要限幅）
    if(RESERVOIR_SIZE === 0) {
        return (budget > 4095) ? 4095 : budget; // 因为part23Length最大值为4095
    }

    let moreBits = perceptualEntropy * 3.1 - meanBitsPerChannel;
    let addBits = (moreBits > 100) ?
                    Math.min(moreBits, 0.6 * RESERVOIR_SIZE) : // NOTE 这里采用dist10的实现，似乎与11172有出入。11172是取大者，但dist10是取小者。
                    0;
    budget += addBits;
    let overBits = RESERVOIR_SIZE - 0.8 * RESERVOIR_MAX - addBits;
    budget += ((overBits > 0) ? overBits : 0);

    return (budget > 4095) ? 4095 : Math.round(budget); // 因为part23Length最大值为4095
}

// 编码一个Channel后，将编码后剩余的比特返还给比特储备池
function ReturnUnusedBits(part23Length, meanBitsPerChannel) {
    RESERVOIR_SIZE += (meanBitsPerChannel - part23Length);
}

// 调整比特储备的容量，使其不超过最大容量，并为8的倍数（因为main_data_begin为8的倍数），并将多余的容量填充进main_data
function RegulateAndStuff(granules) {
    // Aqua_Log(`    ► 调整前的main_data_begin = ${RESERVOIR_SIZE / 8} bytes (${RESERVOIR_SIZE} bits)`);
    let stuffingBits = 0;

    // 若比特储备已经溢出，则将溢出部分从比特储备移除，填充进main_data
    if(RESERVOIR_SIZE > RESERVOIR_MAX) {
        stuffingBits += (RESERVOIR_SIZE - RESERVOIR_MAX);
        RESERVOIR_SIZE = RESERVOIR_MAX;
    }

    // 由于main_data_begin以字节为单位，且其值等于比特储备的大小，因此将比特储备调整为小于它自己的8的倍数。被调整掉的比特，填充进main_data
    let remainder = (RESERVOIR_SIZE & 7);
    RESERVOIR_SIZE -= remainder;
    stuffingBits += remainder;

    // Aqua_Log(`    ► 调整后的main_data_begin = ${RESERVOIR_SIZE / 8} bytes (${RESERVOIR_SIZE} bits)`);

    // 将多余的比特填充进main_data，方法是修改part23Length，由formatter执行实际的比特填充。
    // 策略是从第一个granule的第一个channel开始填充，如果充满（长度达到part23Length的上限4095），则继续填充下一channel、下一granule，直至填充完毕。
    let isFinished = false;
    for(let gr = 0; gr < 2; gr++) {
        for(let ch = 0; ch < CHANNELS; ch++) {
            if(granules[gr][ch].part23Length + stuffingBits > 4095) {
                stuffingBits -= (4095 - granules[gr][ch].part23Length);
                granules[gr][ch].part23Length = 4095;
                // Aqua_Log(`    ► Granule[${gr}][${ch}] 被填满至4095bits`);
            }
            else {
                // Aqua_Log(`    ► Granule[${gr}][${ch}] 被填充 ${stuffingBits} bits`);
                granules[gr][ch].part23Length += stuffingBits;
                isFinished = true;
                break;
            }
        }
        if(isFinished) break;
    }
}
