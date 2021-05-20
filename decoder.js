/////////////////////////////////////////////////////////////////
//
//  Project Aqua - MP3 Audio Encoder / MP3音频编码器
//
//  Copyright (c) 2019-2020 BD4SUR @ GitHub
//
//  =============================================================
//
//  decoder.js
//
//    哈夫曼解码。仅用于开发、测试。
//
/////////////////////////////////////////////////////////////////

let HUFFMAN_TREES = HuffmanTreeInit();
let HUFFMAN_TREES_DUPLE = HUFFMAN_TREES.HuffmanTreeDuple;
let HUFFMAN_TREES_QUADRUPLE = HUFFMAN_TREES.HuffmanTreeQuadruple;


/**
 * @description 解码大值区
 */
function HuffmanDecode(
    bitstr,                 /* 哈夫曼编码的比特串 */
    blockType,              /* 块类型：长块或短块 */
    bigvalues,              /* 大值对儿数量 */
    region0Count,           /* 大值区子分区0包含的SFB个数-1 */
    region1Count,           /* 大值区子分区1包含的SFB个数-1 */
    bigvalueTableSelects,   /* 大值区各子分区的哈夫曼表编号 */
    smallvalueTableSelect   /* 小值区哈夫曼表（0/1） */
) {

    if(bitstr.length <= 0) {
        let zeros = new Array();
        for(let i = 0; i < 576; i++) { zeros[i] = 0; }
        return zeros;
    }

    // 计算大值区三个子分区的频点数目
    let regionLength = [0, 0, 0];
    if(blockType === WINDOW_NORMAL) {
        let SFBands = ScaleFactorBands[SAMPLE_RATE][LONG_BLOCK];
        for(let sfb = 0; sfb < region0Count + 1; sfb++) {
            let sfbPartition = SFBands[sfb];
            regionLength[0] = regionLength[0] + (sfbPartition[1] - sfbPartition[0] + 1);
        }
        for(let sfb = region0Count + 1; sfb < region0Count + region1Count + 2; sfb++) {
            let sfbPartition = SFBands[sfb];
            regionLength[1] = regionLength[1] + (sfbPartition[1] - sfbPartition[0] + 1);
        }
        regionLength[2] = bigvalues * 2 - regionLength[0] - regionLength[1];
    }
    else if(blockType === WINDOW_SHORT) {
        let SFBands = ScaleFactorBands[SAMPLE_RATE][SHORT_BLOCK];
        for(let sfb = 0; sfb < 3; sfb++) {
            let sfbPartition = SFBands[sfb];
            regionLength[0] = regionLength[0] + (sfbPartition[1] - sfbPartition[0] + 1) * 3;
        }
        regionLength[1] = bigvalues * 2 - regionLength[0];
    }
    if(blockType === WINDOW_START || blockType === WINDOW_STOP) {
        let SFBands = ScaleFactorBands[SAMPLE_RATE][LONG_BLOCK];
        for(let sfb = 0; sfb < region0Count /* i.e. === 7 */ + 1; sfb++) {
            let sfbPartition = SFBands[sfb];
            regionLength[0] = regionLength[0] + (sfbPartition[1] - sfbPartition[0] + 1);
        }
        regionLength[1] = bigvalues * 2 - regionLength[0];
    }

    let values = new Array();

    let regionNum = 3;
    if(blockType === WINDOW_SHORT || blockType === WINDOW_START || blockType === WINDOW_STOP) {
        regionNum = 2; // @reference p26
    }

    let offset = 0;
    for(let region = 0; region < regionNum; region++) {
        let count = regionLength[region];

        if(bigvalueTableSelects[region] === 0) {
            for(let i = 0; i < count; i++) {
                values.push(0);
                values.push(0);
            }
        }
        else {
            let htree = HUFFMAN_TREES_DUPLE[bigvalueTableSelects[region]];
            let linbits = HuffmanTableDuple[bigvalueTableSelects[region]].linbits;

            // LOG(`Region ${region}: Length = ${count} Linbits = ${linbits}`);

            while(count > 0) {
                let hresult = DecodePrefix(bitstr.substring(offset), htree);
                let x = hresult.x;
                let y = hresult.y;
                offset += hresult.runlength;

                if(x === 15 && linbits > 0) {
                    x += BinaryStringToUint(bitstr.substring(offset, offset + linbits), linbits);
                    offset += linbits;
                }
                if(x !== 0) {
                    x *= ((bitstr[offset] === "1") ? (-1) : 1);
                    offset += 1;
                }
                if(y === 15 && linbits > 0) {
                    y += BinaryStringToUint(bitstr.substring(offset, offset + linbits), linbits);
                    offset += linbits;
                }
                if(y !== 0) {
                    y *= ((bitstr[offset] === "1") ? (-1) : 1);
                    offset += 1;
                }

                values.push(x);
                values.push(y);

                count -= 2;

                // LOG(`Decoded: ${x} ${y}`);
            }
        }
    }

    // 解码小值区
    while(offset < bitstr.length) {
        let htree = HUFFMAN_TREES_QUADRUPLE[smallvalueTableSelect];
        let hresult = DecodePrefix(bitstr.substring(offset), htree);
        let v = hresult.v;
        let w = hresult.w;
        let x = hresult.x;
        let y = hresult.y;
        offset += hresult.runlength;

        if(v !== 0) { v *= ((bitstr[offset] === "1") ? (-1) : 1); offset += 1; }
        if(w !== 0) { w *= ((bitstr[offset] === "1") ? (-1) : 1); offset += 1; }
        if(x !== 0) { x *= ((bitstr[offset] === "1") ? (-1) : 1); offset += 1; }
        if(y !== 0) { y *= ((bitstr[offset] === "1") ? (-1) : 1); offset += 1; }

        values.push(v); values.push(w); values.push(x); values.push(y);
    }

    // 结尾填充0
    for(let i = values.length; i < 576; i++) {
        values[i] = 0;
    }

    return values;
}
