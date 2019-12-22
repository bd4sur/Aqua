/**
 * @description 全局变量：比特储备池，单位为bit
 */
let RESERVOIR_MAX  = 0;
let RESERVOIR_SIZE = 0;

/**
 * @description 每帧开始时调用，同dist10的ResvFrameBegin
 */
function ReservoirFrameBegin(meanBitsPerGranule, frameLength) {
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
 * @description 计算内层循环的每个Granule的比特数限制
 */
function ReservoirMaxBits(perceptualEntropy, meanBitsPerGranule) {
    let meanBits = meanBitsPerGranule / CHANNELS; // 每个声道的平均比特数
    let maxBits = (meanBits > 4095) ? 4095 : meanBits;

    if(RESERVOIR_MAX === 0) return maxBits;

    let moreBits = perceptualEntropy * 3.1 - meanBits;
    let addBits = 0;
    if(moreBits > 100) {
        addBits = (moreBits > 0.6 * RESERVOIR_SIZE) ? (0.6 * RESERVOIR_SIZE) : moreBits;
    }

    let overBits = RESERVOIR_SIZE - 0.8 * RESERVOIR_MAX - addBits;
    if(overBits > 0) {
        addBits += overBits;
    }

    maxBits += addBits;

    if(maxBits > 4095) maxBits = 4095;

    return maxBits;
}

/**
 * @description 编码一个Granule后，将剩余的比特捐献给比特储备池
 */
function ReservoirAdjust(part23Length, meanBitsPerGranule) {
    RESERVOIR_SIZE += (meanBitsPerGranule / CHANNELS) - part23Length;
}
