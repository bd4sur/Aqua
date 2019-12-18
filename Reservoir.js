/**
 * @description 全局变量：比特池，单位为bit
 */
let RESERVOIR_MAX  = 0;
let RESERVOIR_SIZE = 0;

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
 * @description 编码一个Granule后，将剩余的比特捐献给比特池
 */
function ReservoirAdjust(part23Length, meanBitsPerGranule) {
    RESERVOIR_SIZE += (meanBitsPerGranule / CHANNELS) - part23Length;
}
