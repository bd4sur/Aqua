/**
 * @description 全局变量：比特储备池，单位为bit
 */
let RESERVOIR_MAX  = 0;
let RESERVOIR_SIZE = 0;

/**
 * @description 设置最大比特储备容量（bits），同dist10的ResvFrameBegin
 */
function SetReservoirMax(frameLength) {
    // 根据当前帧长度修改比特储备池最大长度
    if(frameLength > 7680) { // NOTE 7680是320k/48kHz的帧比特数（320000*1152/48000=7680）
        RESERVOIR_MAX = 0;
    }
    else {
        RESERVOIR_MAX = 7680 - frameLength;
    }
    // 因为mainDataBegin为9bit，因此最多能表示511*8=4088bit的比特储备池
    if(RESERVOIR_MAX > 4088) {
        RESERVOIR_MAX = 4088;
    }
}

/**
 * @description 计算量化循环的每个Granule、每个声道的比特预算
 * ReservoirMaxBits
 */
function AllocateGranuleBudget(perceptualEntropy, meanBitsPerGranule) {
    let budget = meanBitsPerGranule / CHANNELS; // 每个声道的平均比特数

    // 如果比特储备为0，则直接以平均比特数为预算（需要限幅）
    if(RESERVOIR_SIZE === 0) {
        return (budget > 4095) ? 4095 : budget; // 因为part23Length最大值为4095
    }

    let moreBits = perceptualEntropy * 3.1 - meanBitsPerGranule / CHANNELS;
    let addBits = (moreBits > 100) ?
                    Math.min(moreBits, 0.6 * RESERVOIR_SIZE) : // NOTE 这里采用dist10的实现，似乎与11172有出入。11172是取大者，但dist10是取小者。
                    0;
    budget += addBits;
    let overBits = RESERVOIR_SIZE - 0.8 * RESERVOIR_MAX - addBits;
    budget += ((overBits > 0) ? overBits : 0);

    return (budget > 4095) ? 4095 : Math.round(budget); // 因为part23Length最大值为4095
}

/**
 * @description 编码一个Granule的一个声道后，将剩余的比特捐献给比特储备池
 */
function AdjustReservoirSize(part23Length, meanBitsPerGranule) {
    RESERVOIR_SIZE += (meanBitsPerGranule / CHANNELS) - part23Length;
}
