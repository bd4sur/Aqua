// 编码器 预备工作
// 分析子带滤波器

// 输入：512个样本，其中前32个是滤波器的输入。
//       可以理解成一个512点的窗口从左向右滑过样本，每次滑动步进32点。窗口最右侧为0，最左侧为511，与输入序列**顺序相反**。窗口最右侧为实际的输入，其左侧为缓冲区。
// 输出：长度为32的子带滤波结果，每一点代表每一频带在此32点时域窗口对应的时间点上的（降）采样值

function BasicAnalysisSubbandFilter(inputBuffer) { // def. @ p.67,78

    // Window by 512 Coefficients (ANALYSIS_SUBBAND_FILTER_WINDOW_COEFFICIENTS[])
    let Z = new Array(); // length = 512
    for(let i = 0; i < 512; i++) {
        Z[i] = inputBuffer[i] * ANALYSIS_SUBBAND_FILTER_WINDOW_COEFFICIENTS[i];
    }

    // Partial Calculation
    let Y = new Array(); // length = 64
    for(let i = 0; i < 64; i++) {
        let sum = 0;
        for(let j = 0; j < 8; j++) {
            sum += Z[i + 64 * j];
        }
        Y[i] = sum;
    }

    // Calculate 32 Samples by Matrixing
    const M = (i, k) => { // def. @ p.67
        return Math.cos((2 * i + 1) * (k - 16) * Math.PI / 64); // for i = 0 to 31, and k = 0 to 63.
    }
    let S = new Array(); // length = 32
    for(let i = 0; i < 32; i++) {
        let sum = 0;
        for(let k = 0; k < 64; k++) {
            sum += (M(i, k) * Y[k]);
        }
        S[i] = sum;
    }

    // Output 32 Subband Samples
    return S;

}

// 输入：原始PCM序列；Granule（576点）起点index
// 输出：32个频带的时域序列，每个序列18点
function AnalysisSubbandFilter(PCMData, GranuleStartOffset) {
    // 滑动窗口，对一帧节进行分析子带滤波
    const STEP_LENGTH = 32;
    let Outputs = new Array(); // 此数组存储18个子带滤波结果，每个结果有32点
    for(let step = 1; step <= (GRANULE_LENGTH / STEP_LENGTH); step++) {
        let offset = GranuleStartOffset + STEP_LENGTH * step;
        let inputBuffer = new Array();
        // 倒序从原始序列读取512个采样，原始序列第一个采样之前的值以0填充
        for(let i = 0; i < 512; i++) {
            let dataIndex = offset - i;
            inputBuffer[i] = (dataIndex >= 0 && dataIndex < PCMData.length) ? PCMData[dataIndex] : 0;
        }
        // 滤波
        let output = BasicAnalysisSubbandFilter(inputBuffer);
        Outputs[step-1] = output;
    }
    // 将结果转换为32个频带的结果
    let Subbands = new Array();
    for(let i = 0; i < Outputs.length; i++) {
        for(let j = 0; j < Outputs[i].length; j++) {
            if(Subbands[j] === undefined) {
                Subbands[j] = new Array();
            }
            Subbands[j][i] = Outputs[i][j];
        }
    }

    return Subbands;
}

