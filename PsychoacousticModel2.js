
// 第二心理声学模型 试验性实现


/** @description 前两个长块的极坐标频谱（0~1023）*/
let PrevLongPolarSpectrum1, PrevLongPolarSpectrum2;
/** @description 前两个短块的极坐标频谱（0~255）*/
let PrevShortPolarSpectrum1, PrevShortPolarSpectrum2;

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


class PsychoacousticModel2 {
    constructor() {

    }

}
