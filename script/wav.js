function ToString(array) {
    return String.fromCharCode.apply(this, array);
}
function ToUnsignedInt(array) {
    let num = 0;
    for(let i = 0; i < array.length; i++) {
        num |= array[i] << (i<<3);
    }
    return num;
}

function PCMAudio() {
    this.Channels = 2;
    this.SampleRate = 44100;
    this.BitsPerSample = 16;
    this.Length = 0;
    this.Data = null;

    this.BlockAlign = this.BitsPerSample * this.Channels >> 3;
}

PCMAudio.prototype = {
    Init: function(BUF) {
        let RiffID = ToString(BUF.slice(0x00, 0x04));
        let FileSize = ToUnsignedInt(BUF.slice(0x04, 0x08)) + 8;
        let WaveTag = ToString(BUF.slice(0x08, 0x0c));
        let FmtID = ToString(BUF.slice(0x0c, 0x10));
        let FmtSize = ToUnsignedInt(BUF.slice(0x10, 0x14));

        let Format = ToUnsignedInt(BUF.slice(0x14, 0x16));
        let Channels = ToUnsignedInt(BUF.slice(0x16, 0x18));
        let SampleRate = ToUnsignedInt(BUF.slice(0x18, 0x1c));
        let ByteRate = ToUnsignedInt(BUF.slice(0x1c, 0x20));
        let BlockAlign = ToUnsignedInt(BUF.slice(0x20, 0x22));
        let BitsPerSample = ToUnsignedInt(BUF.slice(0x22, 0x24));

        let DataID = ToString(BUF.slice(0x24, 0x28));
        let DataSize = ToUnsignedInt(BUF.slice(0x28, 0x2c));

        if(RiffID === "RIFF") {
            this.Channels = Channels;
            this.SampleRate = SampleRate;
            this.BitsPerSample = BitsPerSample;
            this.BlockAlign = BlockAlign;
            this.Length = DataSize / BlockAlign;
            this.Data = BUF.slice(0x2c);
        }
        else {
            console.error("非 RIFF WAV 文件");
        }
    },

    GetSample: function(offset) {
        function ToSignedInt(array) {
            let unsigned = ToUnsignedInt(array);
            return (unsigned >= 0x8000) ? (unsigned - 0x10000) : unsigned;
        }
        let byteOffset = 0x2c + offset * this.BlockAlign/*(BitsPerSample / 8) * Channels*/;
        let BytesPerSample = this.BitsPerSample >> 3;
        let left  = ToSignedInt(this.Data.slice(byteOffset, byteOffset + BytesPerSample));
        let right = ToSignedInt(this.Data.slice(byteOffset + BytesPerSample, byteOffset + BytesPerSample + BytesPerSample));
        return [left, right];
    },

    GetFrame: function(offset, frameLength) {
        let frame = new Array();
        frame[0] = new Array();
        frame[1] = new Array();
        for(let i = offset; i < offset + frameLength; i++) {
            frame[0].push(this.GetSample(i)[0]);
            frame[1].push(this.GetSample(i)[1]);
        }
        return frame;
    },

    // 将原始采样分帧（不重叠不间隔，不加窗），并计算每一帧的能量，得到能量序列
    GetEnergySeries: function(frameOffset, frameNumber, frameLength) {
        function calculateEnergy(arr) {
            let spect = FFT(arr.toComplexList(), frameLength);
            let sum = 0;
            for(let i = 0; i < spect.length; i++) {
                sum += (spect[i].absSqr() <= 0) ? 0 : (Math.pow(Math.log10(spect[i].absSqr()), 2));
            }
            return sum;
        }
        let maxFrameNumber = (this.Length / frameLength) >> 0;
        if(frameOffset >= maxFrameNumber || frameOffset + frameNumber > maxFrameNumber) {
            throw `帧超出原始数据范围`;
        }
        else {
            let energySeries = new Array();
            let offset = frameOffset * frameLength;
            if(offset % this.BlockAlign !== 0) throw `err`;
            let finish = (frameOffset + frameNumber) * frameLength;
            while(offset < finish) {
                let frame = this.GetFrame(offset, frameLength)[0];
                energySeries.push(calculateEnergy(frame));
                offset += frameLength;
            }
            return energySeries;
        }
    }
};
