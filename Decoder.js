
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
    // 长块频谱
    if(blockType === LONG_BLOCK) {
        // 计算大值区三个子分区的频点数目
        let SFBands = ScaleFactorBands[SAMPLE_RATE][LONG_BLOCK];
        let regionLength = [0, 0, 0];
        for(let sfb = 0; sfb < region0Count + 1; sfb++) {
            let sfbPartition = SFBands[sfb];
            regionLength[0] = regionLength[0] + (sfbPartition[1] - sfbPartition[0] + 1);
        }
        for(let sfb = region0Count + 1; sfb < region0Count + region1Count + 2; sfb++) {
            let sfbPartition = SFBands[sfb];
            regionLength[1] = regionLength[1] + (sfbPartition[1] - sfbPartition[0] + 1);
        }
        regionLength[2] = bigvalues * 2 - regionLength[0] - regionLength[1];

        let values = new Array();

        // 解码大值区
        let offset = 0;
        for(let region = 0; region < 3; region++) {
            let count = regionLength[region];
            let htree = HUFFMAN_TREES_DUPLE[bigvalueTableSelects[region]];
            let linbits = HuffmanTableDuple[bigvalueTableSelects[region]].linbits;

            console.log(`Region ${region}: Length = ${count} Linbits = ${linbits}`);

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

                // console.log(`Decoded: ${x} ${y}`);
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
    // 短块频谱
    else {

    }
}
