// 聚类
function clustering(BPMdistribution, clusterNumber) {
    let bpmIndex = new Array();
    let freqIndex = new Array();
    for(let bpm in BPMdistribution) {
        bpmIndex.push(parseFloat(bpm));
        freqIndex.push(parseInt(BPMdistribution[bpm]));
    }
    function remainCount(arr) {
        return arr.reduce((prev, curr)=> { return (curr) ? (prev+1) : prev; }, 0);
    }
    while(remainCount(bpmIndex) > clusterNumber) {
        // 计算最小距离
        let dist = new Array();
        let bpmIndexWithoutUndefined = bpmIndex.filter((e)=> { return e; });
        for(let i = 0; i < bpmIndexWithoutUndefined.length - 1; i++) {
            dist[i] = bpmIndexWithoutUndefined[i+1] - bpmIndexWithoutUndefined[i];
        }
        let minDist = dist.reduce((prev, current)=> {
            if(current <= prev) return current;
            else return prev;
        }, Number.MAX_VALUE);

        // 向左看
        function lookRight(fromIndex, arr) {
            for(let i = fromIndex+1; i < arr.length; i++) {
                if(arr[i]) return {index: i, value:arr[i]};
            }
            return undefined;
        };

        // 向右看
        function lookLeft(fromIndex, arr) {
            for(let i = fromIndex-1; i >= 0; i--) {
                if(arr[i]) return {index: i, value:arr[i]};
            }
            return undefined;
        };

        // 以每个样本点为中心，以最小距离为邻域半径，合并邻域内的样本点
        for(let i = 1; i < bpmIndex.length - 1; i++) {
            if(bpmIndex[i] === undefined) continue;
            let left = lookLeft(i, bpmIndex);
            let right = lookRight(i, bpmIndex);
            // 优先向右合并，所以先向右看
            if(right && (right.value <= bpmIndex[i] + minDist)) {
                if(freqIndex[right.index] <= freqIndex[i]) {
                    freqIndex[i] += freqIndex[right.index];
                    bpmIndex[right.index] = undefined;
                    freqIndex[right.index] = undefined;
                }
                else {
                    freqIndex[right.index] += freqIndex[i];
                    bpmIndex[i] = undefined;
                    freqIndex[i] = undefined;
                }
            }
            if(left && bpmIndex[i] && (left.value >= bpmIndex[i] - minDist)) {
                if(freqIndex[left.index] <= freqIndex[i]) {
                    freqIndex[i] += freqIndex[left.index];
                    bpmIndex[left.index] = undefined;
                    freqIndex[left.index] = undefined;
                }
                else {
                    freqIndex[left.index] += freqIndex[i];
                    bpmIndex[i] = undefined;
                    freqIndex[i] = undefined;
                }
            }
        }
    }

    // 结果重新组装成BPM分布
    let bpmValue = bpmIndex.filter((e)=> { return e; });
    let freqValue = freqIndex.filter((e)=> { return e; });

    let newDistribution = new Object();
    for(let i = 0; i < bpmValue.length; i++) {
        newDistribution[bpmValue[i]] = freqValue[i];
    }
    return newDistribution;
}


// 计算bpm
function BPMAnalyseByFT(PCM, FRAME_NUMBER, FRAME_LENGTH) {
    let maxBPM = 60 * PCM.SampleRate / FRAME_LENGTH / 2;

    let BPMs = new Object();
    console.log(`节拍帧宽度：${FRAME_LENGTH}采样（${(FRAME_LENGTH / PCM.SampleRate * 1000).toFixed(2)}ms）`);
    console.log(`窗长度：${FRAME_NUMBER}个节拍帧（${(FRAME_NUMBER * (FRAME_LENGTH / PCM.SampleRate)).toFixed(2)}s）`);

    for(let POSITION = 0.0; POSITION <= 1.0; POSITION += 0.1) {
        // 取能量序列的一个窗口
        let center = Math.floor((FRAME_NUMBER >> 1) + POSITION * (PCM.Length / FRAME_LENGTH - FRAME_NUMBER));
        let startFrom = Math.floor(center - (FRAME_NUMBER >> 1));
        let energySeries = PCM.GetEnergySeries(startFrom, FRAME_NUMBER, FRAME_LENGTH);

        // 求能量-时间谱的FFT
        let etSpect = FFT(energySeries.toComplexList(), FRAME_NUMBER);

        let maxValue = 0;
        let maxIndex = 0;
        // 从BPM=30的点开始，寻找谱的峰值位置
        for(let index = Math.ceil(etSpect.length * 30 / maxBPM); index < etSpect.length / 2; index++) {
            if(etSpect[index].absSqr() >= maxValue) {
                maxValue = etSpect[index].absSqr();
                maxIndex = index;
            }
        }

        // 将BPM标准化到60~180的范围内
        function normalize(bpm) {
            if(bpm >= 60 && bpm <= 180) return bpm;
            else if(bpm > 180) return normalize(bpm >> 1);
            else if(bpm <= 0) return 0;
            else return normalize(bpm << 1);
        }
    
        let BPM = Math.round(maxBPM * maxIndex / (etSpect.length / 2 - 1));
        BPMs[POSITION.toFixed(2)] = normalize(BPM);

        let windowStartTime = (startFrom * FRAME_LENGTH / PCM.SampleRate).toFixed(2);
        console.log(`BPM @ ${POSITION.toFixed(2)} (from ${windowStartTime}s) = ${normalize(BPM)}`);
    }

    // 根据速度谱，估计总体BPM

    // 频数统计
    let BPMdistribution = new Object();
    for(let pos in BPMs) {
        if(!(BPMs[pos] in BPMdistribution)) {
            BPMdistribution[BPMs[pos]] = 1;
        }
        else {
            BPMdistribution[BPMs[pos]]++;
        }
    }
    // 聚类：聚为3类
    BPMdistribution = clustering(BPMdistribution, 3);

    // 选择频数最大的作为计算得到的BPM
    let maxFreq = 0;
    let evaluatedBPM = 0;
    for(let bpm in BPMdistribution) {
        if(BPMdistribution[bpm] >= maxFreq) {
            maxFreq = BPMdistribution[bpm];
            evaluatedBPM = bpm;
        }
    }

    return {
        TempoDistribution: BPMdistribution,
        TempoSpectrum: BPMs,
        BPM: parseFloat(evaluatedBPM)
    };
}

function BPM(PCM, callback) {
    const FRAME_NUMBER = 2048; // 帧的数量（44100Hz，帧宽1024点的情况下，1024帧持续时间约23.8s）
    const FRAME_LENGTH = 2048;
    let BpmResult = BPMAnalyseByFT(PCM, FRAME_NUMBER, FRAME_LENGTH);
    console.log(BpmResult);
    callback();
}

onmessage = (e) => {
    let PCM = e;
    BPM(PCM, () => {
        postMessage(`finished`);
    });
}
