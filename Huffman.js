
/**
 * @description 哈夫曼树
 */

function HuffmanTree() {
    this.isEnd = false;
    this.nexts = new Array();
    return this;
}

HuffmanTree.prototype.AddCode = function(bincode, key) {
    let currentTree = this;
    for(let i = 0; i < bincode.length; i++) {
        let currentBit = (bincode[i] === "0") ? 0 : 1;
        let nextTree = currentTree.nexts[currentBit];
        if(!nextTree) {
            nextTree = new HuffmanTree();
            currentTree.nexts[currentBit] = nextTree;
        }
        currentTree = nextTree;

        if(i === bincode.length - 1) {
            currentTree.key = key;
            currentTree.isEnd = true;
        }
    }
    return this;
};

HuffmanTree.prototype.Decode = function(str) {
    let currentTree = this;
    for(let i = 0; i < str.length; i++) {
        let bit = (str[i] === "0") ? 0 : 1;
        currentTree = currentTree.nexts[bit];
        if(currentTree.isEnd === true) {
            return {
                key: currentTree.key,
                runlength: i+1
            };
        }
    }
    return null;
}


/**
 * @description 初始化哈夫曼树
 */
function HuffmanTreeInit() {
    let HuffmanTreeDuple = new Array();
    let HuffmanTreeQuadruple = new Array();
    // 大值表
    for(let i = 0; i < HuffmanTableDuple.length; i++) {
        if(HuffmanTableDuple[i] === null) continue;
        let htree = new HuffmanTree();
        let htable = HuffmanTableDuple[i].table;
        for(let key in htable) {
            let hcode = htable[key];
            htree.AddCode(hcode, key);
        }
        HuffmanTreeDuple[i] = htree;
    }
    // 小值表
    let htree0 = new HuffmanTree();
    let htree1 = new HuffmanTree();
    for(let i = 0; i < 16; i++) {
        let key = BinaryString(i, 4).split("").join(" ");
        let hcode0 = HuffmanTableQuadruple[0][i];
        let hcode1 = HuffmanTableQuadruple[1][i];
        htree0.AddCode(hcode0, key);
        htree1.AddCode(hcode1, key);
    }
    HuffmanTreeQuadruple[0] = htree0;
    HuffmanTreeQuadruple[1] = htree1;

    return {
        HuffmanTreeQuadruple: HuffmanTreeQuadruple,
        HuffmanTreeDuple: HuffmanTreeDuple
    };
}

/**
 * @description 使用选定的哈夫曼树解码字符串（仅匹配前缀）
 */
function DecodePrefix(str, htree) {
    let hresult = htree.Decode(str)
    let key = hresult.key.split(" ");
    if(key.length === 2) {
        return {
            runlength: hresult.runlength,
            x: parseInt(key[0]),
            y: parseInt(key[1])
        };
    }
    else if(key.length === 4) {
        return {
            runlength: hresult.runlength,
            v: parseInt(key[0]),
            w: parseInt(key[1]),
            x: parseInt(key[2]),
            y: parseInt(key[3])
        };
    }
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
    let hcode = (huffmanTableObject.table)[16 * x + y];

    return {
        "huffmanCode": hcode,
        "linbits": linbits,
        "linbitsX": linbitsX,
        "linbitsY": linbitsY
    };
}

/**
 * @description 576点量化频谱分区：一般分为大值区（bigvalues）、小值区（smallvalues）和零值区（zeros）
 */
function PartitionQuantizedSpectrum(spect576, blockType) {
    let rzero = 0;
    let big_values = 0;
    let count1 = 0;

    if(blockType === WINDOW_SHORT) {
        big_values = 288;
        count1 = 0;
    }
    else {
        let i;
        for(i = 576; i > 1; i-= 2) {
            if((spect576[i-1] === 0) && (spect576[i-2] === 0)) {
                rzero++;
            }
            else break;
        }

        count1 = 0;
        for( ; i > 3; i -= 4) {
            if( Math.abs(spect576[i-1]) <= 1 &&
                Math.abs(spect576[i-2]) <= 1 &&
                Math.abs(spect576[i-3]) <= 1 &&
                Math.abs(spect576[i-4]) <= 1
            ) {
                count1++
    }
            else break;
    }

        big_values = i / 2;
    }

    return {
        "bigvalues":   [0, big_values * 2],
        "smallvalues": [big_values * 2, count1 * 4 + big_values * 2],
        "zeros":       [count1 * 4 + big_values * 2, spect576.length]
    };
}


/**
 * @description 对量化频谱作哈夫曼编码
 */
function HuffmanEncode(qspectrum576, blockType) {
    let Bigvalues = -1,
        BigvalueTableSelect = new Array(),
        Region0Count = -1,
        Region1Count = -1,
        SmallvalueTableSelect = 0;

    // 首先检查最大值是否超过 8191+15=8206，如果超过，则返回null
    for(let i = 0; i < qspectrum576.length; i++) {
        if(Math.abs(qspectrum576[i]) > 8206) return null;
    }

    // 对量化后的频谱分区
    let partition = PartitionQuantizedSpectrum(qspectrum576, blockType);
    let BigvaluesPartition = partition.bigvalues;
    let SmallvaluesPartition = partition.smallvalues;

    Bigvalues = (BigvaluesPartition[1] - BigvaluesPartition[0]) / 2;

    let BigvaluesCodeString = "", SmallvaluesCodeString = "";

    // 处理大值区
    // 以尺度因子频带（scalefactor bands，SFB）划分子区间（region）：按照C.1.5.4.4.6的推荐，选择大值区内的前三分之一SFB、后四分之一SFB为分割点，并保证分割点跟SFB的分割点对齐（即region划分不能跨过SFB）。（详见p27）
    // 保存分割点信息到region0_count和region1_count，具体是子区间0和1所包含的SFB数量减一。
    // 注意：对于短块部分（即非混合块模式的全部短块，以及混合块模式下高频方向的短块部分），这两个数量应相应地乘以3。详见p27。
    if(BigvaluesPartition[1] > 0) {
        let region01 = 0, region12 = 0;
        let LastSFBIndexOfBigvalues = -1;
        let BigvaluesEndIndex = BigvaluesPartition[1] - 1;

        // 普通块（长块）
        if(blockType === WINDOW_NORMAL) {
            let SFBands = ScaleFactorBands[SAMPLE_RATE][LONG_BLOCK];
            // 确定大值区的尺度因子频带数目，计算分割点
            for(let sfb = 0; sfb < SFBands.length; sfb++) {
                let sfbPartition = SFBands[sfb];
                // 因最后一个SFB并未延伸到频谱末端，所以应将其延伸到频谱末端
                if(sfb === SFBands.length - 1) sfbPartition = [sfbPartition[0], qspectrum576.length-1];
                if(BigvaluesEndIndex > 0 && BigvaluesEndIndex >= sfbPartition[0] && BigvaluesEndIndex <= sfbPartition[1]) {
                    LastSFBIndexOfBigvalues = sfb;
                    break;
                }
            }

            // 计算各个region的SFB数量
            let SFBNumberInBigvalues = LastSFBIndexOfBigvalues + 1;
            let Region0_SFBNum = Math.round(SFBNumberInBigvalues / 3); // 注意：作为sideinfo的值应减1
            let Region1_SFBNum = SFBNumberInBigvalues - Math.round(SFBNumberInBigvalues / 4) - Region0_SFBNum;
            let Region2_SFBNum = SFBNumberInBigvalues - Region0_SFBNum - Region1_SFBNum;

            // 计算SFB边界与region0/1_count
            if(Region1_SFBNum <= 0) {
                Region1_SFBNum = Region2_SFBNum;
                Region2_SFBNum = 0;
            }

            // 由于sideInfo中Region0/1Count长度为4bit/3bit，因此需要限幅
            Region0_SFBNum = (Region0_SFBNum > 16) ? 16 : Region0_SFBNum;
            Region1_SFBNum = (Region1_SFBNum > 8)  ? 8  : Region1_SFBNum;

            Region0Count = Region0_SFBNum - 1;
            Region1Count = Region1_SFBNum - 1;

            region01 = SFBands[Region0_SFBNum][0]; // Region 1 的起点
            region12 = SFBands[Region0_SFBNum + Region1_SFBNum][0]; // Region 2 的起点
        }
        // 起始块（长块）、结束块（长块）、短块（仅支持非混合的）
        else {
            /**
             * 短窗、起始窗、结束窗情况下，以下两个值为标准规定，实际上并不会被编码到边信息中 @reference p26
             * 目前暂时不实现混合块
             */ 
            if(blockType === WINDOW_SHORT) {
                Region0Count = 8;
            }
            else if(blockType === WINDOW_START || blockType === WINDOW_STOP) {
                Region0Count = 7;
            }
            Region1Count = 36;

            let SFBands = ScaleFactorBands[SAMPLE_RATE][SHORT_BLOCK];
            for(let sfb = 0; sfb < 3; sfb++) { // NOTE 因为Region0Count=8，意味着有(8+1)/3=3个SFB
                let sfbPartition = SFBands[sfb];
                region01 += (sfbPartition[1] - sfbPartition[0] + 1) * 3;
            }
            // 短块没有region2，因此region12就是大值区的右边界
            region12 = BigvaluesPartition[1];
        }

        // 计算每个region的最大值，选取不同的Huffman编码表，保留码表编号到table_select
        let MaxValue0 = -1, MaxValue1 = -1, MaxValue2 = -1;
        for(let i = 0; i < region01; i++) {
            if(Math.abs(qspectrum576[i]) > MaxValue0) { MaxValue0 = Math.abs(qspectrum576[i]); }
        }
        for(let i = region01; i < region12; i++) {
            if(Math.abs(qspectrum576[i]) > MaxValue1) { MaxValue1 = Math.abs(qspectrum576[i]); }
        }
        for(let i = region12; i < BigvaluesPartition[1]; i++) {
            if(Math.abs(qspectrum576[i]) > MaxValue2){ MaxValue2 = Math.abs(qspectrum576[i]); }
        }

        let tableSelect0 = -1, tableSelect1 = -1, tableSelect2 = -1;
        for(let i = 0; i < HuffmanTableDuple.length; i++) {
            let htable = HuffmanTableDuple[i];
            if(htable === null) continue;
            let huffmanTableMaxValue = htable.maxvalue;
            if(tableSelect0 < 0 && MaxValue0 <= huffmanTableMaxValue) { tableSelect0 = i; }
            if(tableSelect1 < 0 && MaxValue1 <= huffmanTableMaxValue) { tableSelect1 = i; }
            if(tableSelect2 < 0 && MaxValue2 <= huffmanTableMaxValue) { tableSelect2 = i; }
            // 如果所有的表格都已确定，则终止循环
            if(tableSelect0 >= 0 && tableSelect1 >= 0 && tableSelect2 >= 0) break;
        }

        BigvalueTableSelect[0] = tableSelect0;
        BigvalueTableSelect[1] = tableSelect1;
        BigvalueTableSelect[2] = tableSelect2;

        // 按照格式对大值区进行编码
        let codeString0 = "", codeString1 = "", codeString2 = "";
        for(let i = 0; i < region01; i += 2) {
            let x = qspectrum576[i], y = qspectrum576[i+1];
            let huffman = EncodeDuple(x, y, tableSelect0);
            codeString0 += String(huffman.huffmanCode);
            if(huffman.linbitsX !== null) { codeString0 += String(huffman.linbitsX); }
            if(x !== 0) { codeString0 += String((x < 0) ? "1" : "0"); }
            if(huffman.linbitsY !== null) { codeString0 += String(huffman.linbitsY); }
            if(y !== 0) { codeString0 += String((y < 0) ? "1" : "0"); }
        }
        for(let i = region01; i < region12; i += 2) {
            let x = qspectrum576[i], y = qspectrum576[i+1];
            let huffman = EncodeDuple(x, y, tableSelect1);
            codeString1 += String(huffman.huffmanCode);
            if(huffman.linbitsX !== null) { codeString1 += String(huffman.linbitsX); }
            if(x !== 0) { codeString1 += String((x < 0) ? "1" : "0"); }
            if(huffman.linbitsY !== null) { codeString1 += String(huffman.linbitsY); }
            if(y !== 0) { codeString1 += String((y < 0) ? "1" : "0"); }
        }
        for(let i = region12; i < BigvaluesPartition[1]; i += 2) {
            let x = qspectrum576[i], y = qspectrum576[i+1];
            let huffman = EncodeDuple(x, y, tableSelect2);
            codeString2 += String(huffman.huffmanCode);
            if(huffman.linbitsX !== null) { codeString2 += String(huffman.linbitsX); }
            if(x !== 0) { codeString2 += String((x < 0) ? "1" : "0"); }
            if(huffman.linbitsY !== null) { codeString2 += String(huffman.linbitsY); }
            if(y !== 0) { codeString2 += String((y < 0) ? "1" : "0"); }
        }

        BigvaluesCodeString = String(codeString0) + String(codeString1) + String(codeString2);
    }

    // 处理小值区
    // 分别使用0和1两个四元组Huffman码表进行编码，计算总码长，选取较小者为最终的编码，并记录对应的码表编号0或1到count1table_select。
    if(SmallvaluesPartition[1] > SmallvaluesPartition[0]) {
        let codeStringA = "", codeStringB = "";
        // 分别使用两个码表进行编码，计算编码长度
        for(let i = SmallvaluesPartition[0]; i < SmallvaluesPartition[1]; i += 4) {
            let v = qspectrum576[i], w = qspectrum576[i+1], x = qspectrum576[i+2], y = qspectrum576[i+3];
            codeStringA += String(EncodeQuadruple(v, w, x, y, 0));
            if(v !== 0) { codeStringA += String((v < 0) ? "1" : "0"); }
            if(w !== 0) { codeStringA += String((w < 0) ? "1" : "0"); }
            if(x !== 0) { codeStringA += String((x < 0) ? "1" : "0"); }
            if(y !== 0) { codeStringA += String((y < 0) ? "1" : "0"); }

            codeStringB += String(EncodeQuadruple(v, w, x, y, 1));
            if(v !== 0) { codeStringB += String((v < 0) ? "1" : "0"); }
            if(w !== 0) { codeStringB += String((w < 0) ? "1" : "0"); }
            if(x !== 0) { codeStringB += String((x < 0) ? "1" : "0"); }
            if(y !== 0) { codeStringB += String((y < 0) ? "1" : "0"); }
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

    if(Region0Count < 0) Region0Count = 0;
    if(Region1Count < 0) Region1Count = 0;

    return {
        "blockType": blockType,
        "spectrum576": qspectrum576,
        "partition": partition,
        "codeString": HuffmanCodeString,
        "bigvalues": Bigvalues,
        "bigvalueTableSelect": BigvalueTableSelect,
        "region0Count": Region0Count,
        "region1Count": Region1Count,
        "smallvalueTableSelect": SmallvalueTableSelect
    };

}
