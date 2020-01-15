
// 第二心理声学模型（PAM2）

////////////////////////////////
//
//  缓 冲 区 （TODO 每个声道需要一个缓冲区，这块需要完善）
//
////////////////////////////////

// 前两个长块的极坐标频谱（0~1023）
let PrevLongPolarSpectrum1, PrevLongPolarSpectrum2;
// 前两个短块的极坐标频谱（0~255）
let PrevShortPolarSpectrum1, PrevShortPolarSpectrum2;

// 前两个长块的未考虑前回声效应的归一化阈值（以TCP为下标），即nb[b]
let PrevNB1, PrevNB2;

////////////////////////////////
//
//  心 理 声 学 模 型 参 数
//
////////////////////////////////

const SWITCH_PE = 1800; // @reference p95

let TABLE_C7_LONG  = PAM_TABLES_C7[SAMPLE_RATE][LONG_BLOCK];
let TABLE_C7_SHORT = PAM_TABLES_C7[SAMPLE_RATE][SHORT_BLOCK];
let TABLE_C8_LONG  = PAM_TABLES_C8[SAMPLE_RATE][LONG_BLOCK];
let TABLE_C8_SHORT = PAM_TABLES_C8[SAMPLE_RATE][SHORT_BLOCK];

// 阈值计算区间：由表C7定义，由PAM2_Init函数初始化之
let TCPS_LONG  = new Array(); // [[wlow, whigh]]
let TCPS_SHORT = new Array(); // [[wlow, whigh]]

// 扩散函数
let SPREADING_FUNCTION_LONG  = new Array();
let SPREADING_FUNCTION_SHORT = new Array();

/**
 *  心理声学模型参数初始化
 */
function PAM2_Init() {

    // TCPS_LONG init
    let wcount = 0;
    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        let fft_lines = TABLE_C7_LONG[b][0];
        TCPS_LONG.push([wcount, wcount + (fft_lines - 1)]);
        wcount += fft_lines;
    }

    // TCPS_LONG init
    wcount = 0;
    for(let b = 0; b < TABLE_C7_SHORT.length; b++) {
        let fft_lines = TABLE_C7_SHORT[b][0];
        TCPS_SHORT.push([wcount, wcount + (fft_lines - 1)]);
        wcount += fft_lines;
    }

    // SPREADING_FUNCTION_L/S init
    // NOTE 扩散函数的输入值以bark为单位，但是SPREADING_FUNCTION_*是以TCP为下标
    for(let bi = 0; bi < TABLE_C7_LONG.length; bi++) {
        SPREADING_FUNCTION_LONG[bi] = new Array();
        for(let bj = 0; bj < TABLE_C7_LONG.length; bj++) {
            let ibark = TABLE_C7_LONG[bi][4]; // bval在TABLE_C7_LONG表中的下标是4
            let jbark = TABLE_C7_LONG[bj][4];
            SPREADING_FUNCTION_LONG[bi][bj] = SpreadingFunction(ibark, jbark);
        }
    }
    for(let bi = 0; bi < TABLE_C7_SHORT.length; bi++) {
        SPREADING_FUNCTION_SHORT[bi] = new Array();
        for(let bj = 0; bj < TABLE_C7_SHORT.length; bj++) {
            let ibark = TABLE_C7_SHORT[bi][4]; // bval在TABLE_C7_LONG表中的下标是4
            let jbark = TABLE_C7_SHORT[bj][4];
            SPREADING_FUNCTION_SHORT[bi][bj] = SpreadingFunction(ibark, jbark);
        }
    }

}

/**
 * 心理声学模型：主流程
 * @input  PCM序列、granuleOffset（即一个576点序列的起始点）
 * @output PE、blockType、xmin
 */
function PAM2(PCM, granuleOffset) {

    // 初始化全局缓存

    // 计算长块/短块频谱
    
    // 计算长块/短块预测频谱

    // 计算不可预测度

    // 以长块参数计算阈值和PE

    // 根据PE判断是否Attack

    // 如果切换到短块，则计算3个短块的阈值

    // 修改全局缓存

    // 返回结果

    return {
        "PE": 0,
        "blockType": WINDOW_NORMAL,
        "xmin": 0 // 长块1个，短块3个
    };
}


/**
 * @description 窗口切换
 * @reference Fig.C.7(p95)
 * @input  prevWindowType - 上一个Granule的窗口类型
 * @input  isAttack - 由PAM2给出的是否attack的判断（true/false）
 * @output 当前Granule的窗口类型
 */
function SwitchWindowType(prevWindowType, isAttack) {
    if(prevWindowType === WINDOW_NORMAL) {
        return (isAttack) ? WINDOW_START : WINDOW_NORMAL;
    }
    else if(prevWindowType === WINDOW_START) {
        return WINDOW_SHORT;
    }
    else if(prevWindowType === WINDOW_SHORT) {
        return (isAttack) ? WINDOW_SHORT : WINDOW_STOP;
    }
    else if(prevWindowType === WINDOW_STOP) {
        return (isAttack) ? WINDOW_START : WINDOW_NORMAL;
    }
}


/**
 * @description 计算扩散函数c(w)
 * @reference C.1.5.3.2.1(p80) & D.2.3(p129)
 * @input  i - 从频点i（Bark）被扩散
 * @input  j - 扩散到频点j（Bark）所在处
 * @output 扩散函数值
 */
function SpreadingFunction(i, j) {
    let tmpx = 1.05 * (j - i);
    let x = 8 * Math.min((tmpx - 0.5) * (tmpx - 0.5) - 2 * (tmpx - 0.5), 0);
    // LayerIII的tmpy有变化，详见 @reference C.1.5.3.2.1(p80)
    // let tmpy = 15.811389 + 7.5 * (tmpx + 0.474) - 17.5 * Math.sqrt(1.0 + (tmpx + 0.474) * (tmpx + 0.474));
    // TODO 此处存疑，标准原文的(3.0 * (j - i))似乎应为(3.0 * (i - j))，曲线形状才合理。
    let tmpy = (j >= i) ? (3.0 * (i - j)) : (1.5 * (j - i));
    if(tmpy < -100) {
        return 0;
    }
    else {
        let result = Math.pow(10, (x + tmpy) / 10);
        return (result < 1e-6) ? 0 : result; // 根据 @reference C.1.5.3.2.1(p80)，凡是小于1e-6的值均设为0
    }
}

/**
 * @description 计算长块/短块极坐标频谱：加窗并执行1024/256点FFT
 * @reference D.2.4(p129)
 * @input  input - 1024（长块）/256（短块）点PCM序列，以576/192采样为中心
 * @input  isLongBlock - 长短块标识：true为长块，false为短块
 * @output 极坐标表示的频谱，r为模，f为相位 [r[w], f[w]], w=0~1023/255
 */
function CalculatePolarSpectrum(input, isLongBlock) {
    // FFT点数：长块1024，短块256
    let BlockLength = (isLongBlock) ? 1024 : 256;
    // 加Hann窗
    let windowedInput = new Array();
    for(let i = 0; i < BlockLength; i++) {
        windowedInput[i] = input[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i - 0.5) / BlockLength));
    }
    // 执行FFT
    let spectrum = FFT(RealArrayToComplexArray(windowedInput), BlockLength);
    // 转换成极坐标表示
    let polarSpectrum = ComplexArrayToPolarArrays(spectrum);
    return polarSpectrum;
}

/**
 * @description 计算长块/短块的预测极坐标频谱
 * @reference D.2.4(p129)
 * @input  prevPolarSpectrum1 - 当前块之前 第1个 长块或短块的极坐标频谱 [r[w], f[w]], w=0~1023/255
 * @input  prevPolarSpectrum2 - 当前块之前 第2个 长块或短块的极坐标频谱 [r[w], f[w]], w=0~1023/255
 * @input  isLongBlock - 长短块标识：true为长块，false为短块
 * @output  预测的长块/短块极坐标频谱 [r[w], f[w]], w=0~1023/255
 */
function CalculatePredictedPolarSpectrum(prevPolarSpectrum1, prevPolarSpectrum2, isLongBlock) {
    let predictedPolarSpectrum_Radius = new Array();
    let predictedPolarSpectrum_Phase = new Array();
    // 长块
    if(isLongBlock) {
        for(let w = 0; w < 1024; w++) {
            predictedPolarSpectrum_Radius[w] = 2 * prevPolarSpectrum1[0][w] - prevPolarSpectrum2[0][w];
            predictedPolarSpectrum_Phase[w]  = 2 * prevPolarSpectrum1[1][w] - prevPolarSpectrum2[1][w];
        }
    }
    // 短块
    else {
        for(let w = 0; w < 256; w++) {
            predictedPolarSpectrum_Radius[w] = 2 * prevPolarSpectrum1[0][w] - prevPolarSpectrum2[0][w];
            predictedPolarSpectrum_Phase[w]  = 2 * prevPolarSpectrum1[1][w] - prevPolarSpectrum2[1][w];
        }
    }
    return [predictedPolarSpectrum_Radius, predictedPolarSpectrum_Phase];
}

/**
 * @description 计算不可预测度c(w)
 * @reference C.1.5.3.2.1(p80) & D.2.4(p129-130)
 * @input  longBlockPolarSpectrum - 当前长块的极坐标频谱 [r[w], f[w]], w=0~1023
 * @input  longBlockPredictedPolarSpectrum - 当前长块的预测极坐标频谱 [r[w], f[w]], w=0~1023
 * @input  shortBlockPolarSpectrum - 当前短块的极坐标频谱 [r[w], f[w]], w=0~255
 * @input  shortBlockPredictedPolarSpectrum - 当前短块的预测极坐标频谱 [r[w], f[w]], w=0~255
 * @output 每个FFT频点(w)的不可预测度c[w], w=0~1023
 */
function CalculateUnpredictability(
    longBlockPolarSpectrum,  longBlockPredictedPolarSpectrum,
    shortBlockPolarSpectrum, shortBlockPredictedPolarSpectrum)
{
    // PAM2规定的c(w)计算公式  @reference D.2.4(p129-130)
    // 注意输入的 r, rp, f, fp 都是频点w上的值，因此函数没有参数w
    const BasicUnpredictability = (r, rp, f, fp) => {
        let temp1 = r * Math.cos(f) - rp * Math.cos(fp);
        let temp2 = r * Math.sin(f) - rp * Math.sin(fp);
        let temp3 = Math.sqrt(temp1 * temp1 + temp2 * temp2);
        let temp4 = r + Math.abs(rp);
        return temp3 / temp4;
    }
    // 以下是Layer3规定的c(w)计算方法 @reference C.1.5.3.2.1(p80)
    let c = new Array();
    // 长块
    let longBlockSpect_Radius = longBlockPolarSpectrum[0];
    let longBlockSpect_Phase  = longBlockPolarSpectrum[1];
    let longBlockPredictedSpect_Radius = longBlockPredictedPolarSpectrum[0];
    let longBlockPredictedSpect_Phase  = longBlockPredictedPolarSpectrum[1];
    // 短块
    let shortBlockSpect_Radius = shortBlockPolarSpectrum[0];
    let shortBlockSpect_Phase  = shortBlockPolarSpectrum[1];
    let shortBlockPredictedSpect_Radius = shortBlockPredictedPolarSpectrum[0];
    let shortBlockPredictedSpect_Phase  = shortBlockPredictedPolarSpectrum[1];

    for(let w = 0; w < 1024; w++) {
        if(w >= 0 && w < 6) {
            c[w] = BasicUnpredictability(longBlockSpect_Radius[w], longBlockPredictedSpect_Radius[w],
                                         longBlockSpect_Phase[w], longBlockPredictedSpect_Phase[w]);
        }
        else if(w >= 6 && w < 206) {
            let index = Math.round((w + 2) / 4);
            c[w] = BasicUnpredictability(shortBlockSpect_Radius[index], shortBlockPredictedSpect_Radius[index],
                                         shortBlockSpect_Phase[index], shortBlockPredictedSpect_Phase[index]);
        }
        else {
            c[w] = 0.4;
        }
    }

    return c;
}

/**
 * 计算SMR和PE（长块模式）
 */
function CalculateRatiosAndPE(longBlockPolarSpectrum, Unpred_w) {

    // (e) 计算阈值计算区间（Threshold Calculation Partition）内的能量、以及不可预测度加权的能量

    let Energy = new Array();
    let Unpred = new Array();

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        let ebsum = 0;
        let cbsum = 0;
        for(let w = TCPS_LONG[b][0]; w <= TCPS_LONG[b][1]; w++) {
            let rw = longBlockPolarSpectrum[0][w];
            ebsum += (rw * rw);
            cbsum += (rw * rw * Unpred_w[w]);
        }
        Energy[b] = ebsum;
        Unpred[b] = cbsum;
    }

    // (f) 与扩散函数作卷积

    let ecb = new Array();
    let ct = new Array();

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        let ecb_sum = 0;
        let ct_sum = 0;
        for(let bb = 0; bb < TABLE_C7_LONG.length; bb++) {
            let sprdngf = SPREADING_FUNCTION_LONG[bb][b];
            ecb_sum += (Energy[bb] * sprdngf);
            ct_sum  += (Unpred[bb] * sprdngf);
        }
        ecb[b] = ecb_sum;
        ct[b] = ct_sum;
    }

    // 将ct[b]按照ecb[b]归一化，得到cb[b]

    let cb = new Array();

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        if(ecb[b] === 0) {
            cb[b] = 0;
        }
        else {
            cb[b] = ct[b] / ecb[b];
            if(cb[b] < 0.01) cb[b] = 0.01; // 参考dist10
        }
    }

    // 将ecb[b]归一化，得到en[b] （Layer3所用的PAM2不需要这一步）

    // (g) 计算每个TCP的纯音指数tb

    let tb = new Array();

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        tb[b] = -0.299 - 0.43 * Math.log(cb[b]);
        tb[b] = Math.min(1.0, Math.max(0, tb[b])); // 取值范围 (0,1)
    }

    // (h) 计算每个TCP的SNR

    let SNR = new Array();

    const NMT = 6.0;   // (in dB) Noise masking tone. @reference C.1.5.3.2.1(p80)
    const TMN = 29.0;  // (in dB) Tone masking noise. @reference C.1.5.3.2.1(p80)

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        let minval = TABLE_C7_LONG[b][1]; // minval在TABLE_C7_LONG表中的下标是1
        SNR[b] = Math.max(minval, tb[b] * TMN + (1.0 - tb[b]) * NMT);
    }

    // (i)(j) 计算能量阈值nb

    let nb = new Array();

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        let norm = TABLE_C7_LONG[b][3]; // norm在TABLE_C7_LONG表中的下标是3
        nb[b] = ecb[b] * norm * Math.pow(10, (-SNR[b] / 10)); // NOTE 标准附录C的算法框图中，此处少了一个符号。（以dist10源码为准）
    }

    // 以下不采用附录D的算法，而是采用附录C给出的算法（见p81、p92）

    // 计算每个TCP的阈值thr[b]（前回声控制）

    let thr = new Array();

    const rpelev  = 2;  // @reference C.1.5.3.2.1(p81)
    const rpelev2 = 16; // @reference C.1.5.3.2.1(p81)

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        let qthr = TABLE_C7_LONG[b][2]; // qthr在TABLE_C7_LONG表中的下标是1
        let nb_l  = PrevNB1[b] * rpelev;     // @reference p92
        let nb_ll = PrevNB2[b] * rpelev2;    // @reference p92
        // NOTE 根据dist10，标准文档p92有误，以下以dist10为准
        let min_nb = Math.min(nb[b], nb_l, nb_ll); // 标准文档是取大者
        thr[b] = Math.max(qthr, min_nb);
    }

    // 将thr[b]通过表C8直接转换到尺度因子频带上，并计算最终的ratio（Part2）

    let en_Sb = new Array();
    let thr_Sb = new Array();

    let ratio_Sb = new Array();

    for(let sb = 0; sb < 21; sb++) { // 长块SFB有21个
        let bu = TABLE_C8_LONG[sb][1];
        let bo = TABLE_C8_LONG[sb][2];
        let w1 = TABLE_C8_LONG[sb][3];
        let w2 = TABLE_C8_LONG[sb][4];

        let en_sum = w1 * Energy[bu] + w2 * Energy[bo];
        let thr_sum = w1 * thr[bu] + w2 * thr[bo];
    
        for(let b = bu + 1; b <= bo - 1; b++) {
            en_sum += Energy[b];
            thr_sum += thr[b];
        }
        en_Sb[sb] = en_sum;
        thr_Sb[sb] = thr_sum;

        if(en_Sb[sb] !== 0) {
            ratio_Sb[sb] = thr_Sb[sb] / en_Sb[sb];
        }
        else {
            ratio_Sb[sb] = 0;
        }
    }

    // 计算感知熵（PE）

    let PE = 0;

    for(let b = 0; b < TABLE_C7_LONG.length; b++) {
        let pe_b = - Math.min(0.0, Math.log((thr[b] + 1.0) / (Energy[b] + 1.0)));
        let lines = TABLE_C7_LONG[b][0]; // lines在TABLE_C7_LONG表中的下标是0
        PE += (pe_b * lines);
    }

    // 处理缓冲区：将本帧的nb保存到缓冲区中

    PrevNB2 = PrevNB1;
    PrevNB1 = nb;

    // 返回结果

    return {
        "threshold": thr_Sb,
        "ratio": ratio_Sb,
        "PE": PE
    };

}

/**
 * 计算单个短块的阈值 (p94)
 */
function CalculateShortBlockRatios(shortBlockPolarSpectrum) {

    // 计算每个TCP的能量

    let Energy = new Array();

    for(let b = 0; b < TABLE_C7_SHORT.length; b++) {
        let ebsum = 0;
        for(let w = TCPS_SHORT[b][0]; w <= TCPS_SHORT[b][1]; w++) {
            let rw = shortBlockPolarSpectrum[0][w];
            ebsum += (rw * rw);
        }
        Energy[b] = ebsum;
    }

    // 与扩散函数作卷积

    let ecb = new Array();

    for(let b = 0; b < TABLE_C7_SHORT.length; b++) {
        let ecb_sum = 0;
        for(let bb = 0; bb < TABLE_C7_SHORT.length; bb++) {
            let sprdngf = SPREADING_FUNCTION_SHORT[bb][b];
            ecb_sum += (Energy[bb] * sprdngf);
        }
        ecb[b] = ecb_sum;
    }

    // 计算能量阈值nb以及thr。与长块不同之处是：SNR通过查表而不是计算得到。

    let nb  = new Array();
    let thr = new Array();

    for(let b = 0; b < TABLE_C7_SHORT.length; b++) {
        let norm = TABLE_C7_SHORT[b][2]; // norm在TABLE_C7_SHORT表中的下标是2
        let SNR =  TABLE_C7_SHORT[b][3]; //  SNR在TABLE_C7_SHORT表中的下标是3
        nb[b] = ecb[b] * norm * Math.pow(10, (SNR[b] / 10)); // NOTE 注意此处式中没有负号，因为负号在表里

        let qthr = TABLE_C7_SHORT[b][1]; // qthr在TABLE_C7_LONG表中的下标是1
        thr[b] = Math.max(qthr, nb[b]);
    }

    // 将thr[b]通过表C8直接转换到尺度因子频带上，并计算最终的ratio（Part2）
    // 这里流程与长块是相同的，只是需要使用短块的参数

    let en_Sb = new Array();
    let thr_Sb = new Array();

    let ratio_Sb = new Array();

    for(let sb = 0; sb < 12; sb++) { // 短块SFB有12个
        let bu = TABLE_C8_SHORT[sb][1];
        let bo = TABLE_C8_SHORT[sb][2];
        let w1 = TABLE_C8_SHORT[sb][3];
        let w2 = TABLE_C8_SHORT[sb][4];

        let en_sum = w1 * Energy[bu] + w2 * Energy[bo];
        let thr_sum = w1 * thr[bu] + w2 * thr[bo];
    
        for(let b = bu + 1; b <= bo - 1; b++) {
            en_sum += Energy[b];
            thr_sum += thr[b];
        }
        en_Sb[sb] = en_sum;
        thr_Sb[sb] = thr_sum;

        if(en_Sb[sb] !== 0) {
            ratio_Sb[sb] = thr_Sb[sb] / en_Sb[sb];
        }
        else {
            ratio_Sb[sb] = 0;
        }
    }

    // 返回结果

    return {
        "threshold": thr_Sb,
        "ratio": ratio_Sb
    };

}
