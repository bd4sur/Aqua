
/**
 * @description 计算序列中最后一个非零值的下标，用于确定零值区的起始点。如果序列全为0，则返回-1。
 */
function LastNzeroIndex(seq) {
    for(let i = seq.length - 1; i >= 0; i--) {
        if(Math.abs(seq[i]) === 0) continue;
        else return i;
    }
    return -1;
}

/**
 * @description 计算序列中最后一个大于等于2的值（即所谓的大值）的下标，用于确定零值区的起始点。如果序列没有大值，则返回-1。
 */
function LastBigvalueIndex(seq) {
    for(let i = seq.length - 1; i >= 0; i--) {
        if(Math.abs(seq[i]) < 2) continue;
        else return i;
    }
    return -1;
}

/**
 * @description 使用指定的小值哈夫曼表（0/1），对小值四元组进行编码
 */
function EncodeQuadruple(v, w, x, y, tableSelect) {
    let key = (Math.abs(v) << 3) + (Math.abs(w) << 2) + (Math.abs(x) << 1) + (Math.abs(y) << 0);
    let hcode = HuffmanTableQuadruple[tableSelect][key];
    return hcode;
}

/**
 * @description 使用指定的大值哈夫曼表，对大值二元组进行编码，并返回相应的linbitsX、linbitsY
 */
function EncodeDuple(x, y, tableSelect) {
    x = Math.abs(x);
    y = Math.abs(y);
    let huffmanTableObject = HuffmanTableDuple[tableSelect]; // TODO 码表存在性检查
    let linbits = huffmanTableObject.linbits;
    let linbitsX = null;
    let linbitsY = null;
    if(x >= 15) {
        linbitsX = BinaryString(x - 15, linbits);
        x = 15;
    }
    if(y >= 15) {
        linbitsY = BinaryString(y - 15, linbits);
        y = 15;
    }
    let key = `${x} ${y}`;
    let hcode = (huffmanTableObject.table)[key];

    return {
        "huffmanCode": hcode,
        "linbits": linbits,
        "linbitsX": linbitsX,
        "linbitsY": linbitsY
    };
}

/**
 * @description 返回某正整数的指定长度的二进制串
 */
function BinaryString(intNumber, length) {
    let seq = [];
    for(let i = 0; i < length; i++) {
        if((intNumber & 1) > 0) seq.unshift("1");
        else seq.unshift("0");
        intNumber = intNumber >> 1;
    }
    return seq.join("");
}

/**
 * @description 576点量化频谱分区：一般分为大值区（bigvalues）、小值区（smallvalues）和零值区（zeros）
 */
function PartitionQuantizedSpectrum(qspect) {
    // 先计算小值区和零值区的起始位置
    let smallvaluesStartIndex = LastBigvalueIndex(qspect) + 1;
    let zerosStartIndex = LastNzeroIndex(qspect) + 1;
    // 小值区起点位置向后移动，对齐到偶数（因大值是成对的）
    if((smallvaluesStartIndex & 1) > 0) {
        smallvaluesStartIndex++;
    }
    // 零值区起点向后移动，使小值区长度(zerosStartIndex - smallvaluesStartIndex)为4的倍数
    while(((zerosStartIndex - smallvaluesStartIndex) & 3) > 0) {
        zerosStartIndex++;
    }
    // 如果零值区起点超过了频谱宽度，说明零值区的长度不足2，则将小值区起点向后移动两位
    // 例如 .. 3 2|0 0 0 0 1 0 - -|
    // 应为 .. 3 2 0 0|0 0 1 0|
    if(zerosStartIndex > qspect.length) {
        smallvaluesStartIndex += 2;
        zerosStartIndex = qspect.length;
    }
    // 返回各区域的边界
    return {
        "bigvalues": [0, smallvaluesStartIndex],
        "smallvalues": [smallvaluesStartIndex, zerosStartIndex],
        "zeros": [zerosStartIndex, qspect.length]
    };
}

/**
 * @description 对量化频谱作哈夫曼编码
 */
function HuffmanEncodeQuantizedSpectrum(qspect) {
    let Bigvalues = -1,
        BigvalueTableSelect = new Array(),
        Region0Count = -1,
        Region1Count = -1,
        SmallvalueTableSelect = 0;

    // 首先检查最大值是否超过 8191+15=8206，如果超过，则返回null
    for(let i = 0; i < qspect.length; i++) {
        if(qspect[i] > 8206) return null;
    }

    // 对量化后的频谱分区
    let partition = PartitionQuantizedSpectrum(qspect);
    let BigvaluesPartition = partition.bigvalues;
    let SmallvaluesPartition = partition.smallvalues;

    Bigvalues = (BigvaluesPartition[1] - BigvaluesPartition[0]) / 2;

    let SFBands = ScaleFactorBands[SAMPLE_RATE_44100][LONG_BLOCK];
    let BigvaluesCodeString = "", SmallvaluesCodeString = "";

    // 处理大值区
    // 以尺度因子频带（scalefactor bands，SFB）划分子区间（region）：按照C.1.5.4.4.6的推荐，选择大值区内的前三分之一SFB、后四分之一SFB为分割点，并保证分割点跟SFB的分割点对齐（即region划分不能跨过SFB）。（详见p27）
    // 保存分割点信息到region0_count和region1_count，具体是子区间0和1所包含的SFB数量减一。
    // 注意：对于短块部分（即非混合块模式的全部短块，以及混合块模式下高频方向的短块部分），这两个数量应相应地乘以3。详见p27。
    if(BigvaluesPartition[1] > 0) {
        // 确定大值区的尺度因子频带数目，计算分割点
        let LastSFBIndexOfBigvalues = -1;
        let BigvaluesEndIndex = BigvaluesPartition[1] - 1;
        for(let sfb = 0; sfb < SFBands.length; sfb++) {
            let sfbPartition = SFBands[sfb];
            if(BigvaluesEndIndex > 0 && BigvaluesEndIndex >= sfbPartition[0] && BigvaluesEndIndex <= sfbPartition[1]) {
                LastSFBIndexOfBigvalues = sfb;
                break;
            }
        }

        let SFBNumberInBigvalues = LastSFBIndexOfBigvalues + 1;
        let Region0_SFBNum = Math.round(SFBNumberInBigvalues / 3); // 注意：作为sideinfo的值应减1
        let Region1_SFBNum = SFBNumberInBigvalues - Math.round(SFBNumberInBigvalues / 4) - Region0_SFBNum;
        let Region2_SFBNum = SFBNumberInBigvalues - Region0_SFBNum - Region1_SFBNum;

        Region0Count = Region0_SFBNum - 1;
        Region1Count = Region1_SFBNum - 1;
        if(Region1_SFBNum <= 0) {
            Region1_SFBNum = Region2_SFBNum;
            Region2_SFBNum = 0;
            Region1Count = Region1_SFBNum - 1;
        }

        let region01 = SFBands[Region0_SFBNum][0]; // Region 1 的起点
        let region12 = SFBands[Region0_SFBNum + Region1_SFBNum][0]; // Region 2 的起点

        // 计算每个region的最大值，选取不同的Huffman编码表，保留码表编号到table_select
        let MaxValue0 = -1, MaxValue1 = -1, MaxValue2 = -1;
        for(let i = 0; i < region01; i++) {
            if(qspect[i] > MaxValue0) { MaxValue0 = qspect[i]; }
        }
        for(let i = region01; i < region12; i++) {
            if(qspect[i] > MaxValue1) { MaxValue1 = qspect[i]; }
        }
        for(let i = region12; i < BigvaluesPartition[1]; i++) {
            if(qspect[i] > MaxValue2){ MaxValue2 = qspect[i]; }
        }

        let tableSelect0 = -1, tableSelect1 = -1, tableSelect2 = -1;
        for(let i = 0; i < HuffmanTableDuple.length; i++) {
            let htable = HuffmanTableDuple[i];
            if(htable === null) continue;
            let huffmanTableMaxValue = htable.maxvalue;
            if(tableSelect0 < 0 && MaxValue0 < huffmanTableMaxValue) { tableSelect0 = i; }
            if(tableSelect1 < 0 && MaxValue1 < huffmanTableMaxValue) { tableSelect1 = i; }
            if(tableSelect2 < 0 && MaxValue2 < huffmanTableMaxValue) { tableSelect2 = i; }
            // 如果所有的表格都已确定，则终止循环
            if(tableSelect0 >= 0 && tableSelect1 >= 0 && tableSelect2 >= 0) break;
        }

        BigvalueTableSelect[0] = tableSelect0;
        BigvalueTableSelect[1] = tableSelect1;
        BigvalueTableSelect[2] = tableSelect2;

        // 按照格式对大值区进行编码
        let codeString0 = "", codeString1 = "", codeString2 = "";
        for(let i = 0; i < region01; i += 2) {
            let x = qspect[i], y = qspect[i+1];
            let huffman = EncodeDuple(x, y, tableSelect0);
            codeString0 += String(huffman.huffmanCode);
            if(huffman.linbitsX !== null) { codeString0 += String(huffman.linbitsX); }
            if(x !== 0) { codeString0 += String((x > 0) ? "1" : "0"); }
            if(huffman.linbitsY !== null) { codeString0 += String(huffman.linbitsY); }
            if(y !== 0) { codeString0 += String((y > 0) ? "1" : "0"); }
        }
        for(let i = region01; i < region12; i += 2) {
            let x = qspect[i], y = qspect[i+1];
            let huffman = EncodeDuple(x, y, tableSelect1);
            codeString1 += String(huffman.huffmanCode);
            if(huffman.linbitsX !== null) { codeString1 += String(huffman.linbitsX); }
            if(x !== 0) { codeString1 += String((x > 0) ? "1" : "0"); }
            if(huffman.linbitsY !== null) { codeString1 += String(huffman.linbitsY); }
            if(y !== 0) { codeString1 += String((y > 0) ? "1" : "0"); }
        }
        for(let i = region12; i < BigvaluesPartition[i]; i += 2) {
            let x = qspect[i], y = qspect[i+1];
            let huffman = EncodeDuple(x, y, tableSelect2);
            codeString2 += String(huffman.huffmanCode);
            if(huffman.linbitsX !== null) { codeString2 += String(huffman.linbitsX); }
            if(x !== 0) { codeString2 += String((x > 0) ? "1" : "0"); }
            if(huffman.linbitsY !== null) { codeString2 += String(huffman.linbitsY); }
            if(y !== 0) { codeString2 += String((y > 0) ? "1" : "0"); }
        }

        BigvaluesCodeString = String(codeString0) + String(codeString1) + String(codeString2);
    }

    // 处理小值区
    // 分别使用0和1两个四元组Huffman码表进行编码，计算总码长，选取较小者为最终的编码，并记录对应的码表编号0或1到count1table_select。
    if(SmallvaluesPartition[1] > SmallvaluesPartition[0]) {
        let codeStringA = "", codeStringB = "";
        // 分别使用两个码表进行编码，计算编码长度
        for(let i = SmallvaluesPartition[0]; i < SmallvaluesPartition[1]; i += 4) {
            let v = qspect[i], w = qspect[i+1], x = qspect[i+2], y = qspect[i+3];
            codeStringA += String(EncodeQuadruple(v, w, x, y, 0));
            if(v !== 0) { codeStringA += String((v > 0) ? "1" : "0"); }
            if(w !== 0) { codeStringA += String((w > 0) ? "1" : "0"); }
            if(x !== 0) { codeStringA += String((x > 0) ? "1" : "0"); }
            if(y !== 0) { codeStringA += String((y > 0) ? "1" : "0"); }

            codeStringB += String(EncodeQuadruple(v, w, x, y, 1));
            if(v !== 0) { codeStringB += String((v > 0) ? "1" : "0"); }
            if(w !== 0) { codeStringB += String((w > 0) ? "1" : "0"); }
            if(x !== 0) { codeStringB += String((x > 0) ? "1" : "0"); }
            if(y !== 0) { codeStringB += String((y > 0) ? "1" : "0"); }
        }

        if(codeStringA.length <= codeStringB.length) {
            SmallvaluesCodeString = codeStringA;
            SmallvalueTableSelect = 0;
        }
        else {
            SmallvaluesCodeString = codeStringB;
            SmallvalueTableSelect = 1;
        }
    }

    // 将大值区和小值区编码拼接起来
    let HuffmanCodeString = BigvaluesCodeString + SmallvaluesCodeString;

    return {
        "Partition": partition,
        "CodeString": HuffmanCodeString,
        "Bigvalues": Bigvalues,
        "BigvalueTableSelect": BigvalueTableSelect,
        "Region0Count": Region0Count,
        "Region1Count": Region1Count,
        "SmallvalueTableSelect": SmallvalueTableSelect
    };

}

