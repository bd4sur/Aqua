/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyrignt (c) 2019-2020 Mikukonai @ GitHub
//
//  =============================================================
//
//  common.js
//
//    全局参数、常量、工具函数定义。
//
/////////////////////////////////////////////////////////////////


/////////////////////////////////////////////////////////////////
//
//  编 码 器 全 局 常 量 和 全 局 缓 存 （需要放在模块依赖链条的最前面）
//
/////////////////////////////////////////////////////////////////

// 采样率（枚举）
const SAMPLE_RATE_32000 = 0;
const SAMPLE_RATE_44100 = 1;
const SAMPLE_RATE_48000 = 2;

// 采样率数值及其编码
const SAMPLE_RATE_VALUE   = [32000, 44100, 48000];
const SAMPLE_RATE_BINCODE = ["10", "00", "01"];

// 比特率（枚举）
const BIT_RATE_64K  = 0;
const BIT_RATE_128K = 1;
const BIT_RATE_224K = 2;
const BIT_RATE_320K = 3;

// 比特率数值及其编码
const BIT_RATE_VALUE   = [64000, 128000, 224000, 320000];
const BIT_RATE_BINCODE = ["0101", "1001", "1100", "1110"];

// 块类型枚举，用于表格索引
const LONG_BLOCK  = 0;
const SHORT_BLOCK = 1;
const WINDOW_NORMAL = 0;
const WINDOW_START  = 1;
const WINDOW_SHORT  = 2;
const WINDOW_STOP   = 3;

// MDCT系数表
let MDCT_FACTOR_36 = new Array();
let MDCT_FACTOR_12 = new Array();

// 量化计算 数值表
const ROOT_2_4 = 1.189207115002721;
let INV_POWER_OF_ROOT_2_4 = new Array();
let POWER_OF_ROOT_2_4 = new Array();

// 帧间共享缓存（用于子带滤波、心理声学模型）
let BUFFER = new Array();

// 比特储备池，单位为bit
let RESERVOIR_MAX  = 0;
let RESERVOIR_SIZE = 0;

// 哈夫曼表（以数组结构存储）
let HTABLES = new Array();

// 尺度因子频带划分表 @reference Table.B.8(p62)

const ScaleFactorBands = [
    // 32kHz
    [
        // Long Blocks
        [
            [0, 3],     [4, 7],     [8, 11],    [12, 15],   [16, 19], [20, 23],
            [24, 29],   [30, 35],   [36, 43],   [44, 53],   [54, 65],
            [66, 81],   [82, 101],  [102, 125], [126, 155], [156, 193],
            [194, 239], [240, 295], [296, 363], [364, 447], [448, 549]
        ],
        // Short Blocks
        [
            [0, 3],   [4, 7],   [8, 11],  [12, 15],  [16, 21],   [22, 29],
            [30, 41], [42, 57], [58, 77], [78, 103], [104, 137], [138, 179]
        ]
    ],
    // 44.1kHz
    [
        // Long Blocks
        [
            [0, 3],     [4, 7],     [8, 11],    [12, 15],   [16, 19], [20, 23],
            [24, 29],   [30, 35],   [36, 43],   [44, 51],   [52, 61],
            [62, 73],   [74, 89],   [90, 109],  [110, 133], [134, 161],
            [162, 195], [196, 237], [238, 287], [288, 341], [342, 417]
        ],
        // Short Blocks
        [
            [0, 3],   [4, 7],   [8, 11],  [12, 15], [16, 21],  [22, 29],
            [30, 39], [40, 51], [52, 65], [66, 83], [84, 105], [106, 135]
        ]
    ],
    // 48kHz
    [
        // Long Blocks
        [
            [0, 3],     [4, 7],     [8, 11],    [12, 15],   [16, 19], [20, 23],
            [24, 29],   [30, 35],   [36, 41],   [42, 49],   [50, 59],
            [60, 71],   [72, 87],   [88, 105],  [106, 127], [128, 155],
            [156, 189], [190, 229], [230, 275], [276, 329], [330, 383]
        ],
        // Short Blocks
        [
            [0, 3],   [4, 7],   [8, 11],  [12, 15], [16, 21], [22, 27],
            [28, 37], [38, 49], [50, 63], [64, 79], [80, 99], [100, 125]
        ]
    ]
];


// 尺度因子长度编码 @reference 2.4.2.7(p26)

const SF_COMPRESS_INDEX = [
    [0, 0],[0, 1],[0, 2],[0, 3],[3, 0],[1, 1],[1, 2],[1, 3],
    [2, 1],[2, 2],[2, 3],[3, 1],[3, 2],[3, 3],[4, 2],[4, 3]];

const SF_COMPRESS = [
// slen2= 0   1   2   3
        [ 0,  1,  2,  3], // slen1 = 0
        [-1,  5,  6,  7], // slen1 = 1
        [-1,  8,  9, 10], // slen1 = 2
        [ 4, 11, 12, 13], // slen1 = 3
        [-1, -1, 14, 15], // slen1 = 4
];


/////////////////////////////////////////////////////////////////
//
//  编 码 器 全 局 参 数
//
/////////////////////////////////////////////////////////////////

// 采样率
let SAMPLE_RATE = SAMPLE_RATE_44100;

// 比特率
let BIT_RATE = BIT_RATE_320K;

// 声道数（最大设为2）
let CHANNELS = 2;


/////////////////////////////////////////////////////////////////
//
//  工 具 函 数
//
/////////////////////////////////////////////////////////////////

function LOG(x) {
    // console.log(x);
}


// 返回某正整数的指定长度的二进制串
function BinaryString(intNumber, length) {
    let seq = "";
    let shift = Math.ceil(length / 4);
    let remain = 4 - length % 4;
    for(let i = 0; i < shift; i++) {
        let rightBits = (intNumber & 15);
        switch(rightBits) {
            case 0:  seq = "0000" + seq; break;
            case 1:  seq = "0001" + seq; break;
            case 2:  seq = "0010" + seq; break;
            case 3:  seq = "0011" + seq; break;
            case 4:  seq = "0100" + seq; break;
            case 5:  seq = "0101" + seq; break;
            case 6:  seq = "0110" + seq; break;
            case 7:  seq = "0111" + seq; break;
            case 8:  seq = "1000" + seq; break;
            case 9:  seq = "1001" + seq; break;
            case 10: seq = "1010" + seq; break;
            case 11: seq = "1011" + seq; break;
            case 12: seq = "1100" + seq; break;
            case 13: seq = "1101" + seq; break;
            case 14: seq = "1110" + seq; break;
            case 15: seq = "1111" + seq; break;
            default: break;
        }
        intNumber = intNumber >> 4;
    }

    if(remain === 4) {
        return seq;
    }
    else {
        return seq.substring(remain);
    }
}

// 二进制串转无符号整数
function BinaryStringToUint(bstr) {
    let sum = 0;
    for(let i = bstr.length; i>= 0; i--) {
        if(bstr[i] === "1") {
            sum += (1 << (bstr.length - i - 1));
        }
    }
    return sum;
}
